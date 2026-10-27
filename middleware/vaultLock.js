import crypto from 'crypto';
import Session from '../models/Session.js';
import User from '../models/User.js';
import { deriveKey, verifyMasterPassword, encrypt, decrypt } from '../utils/crypto.js';
import { AppError } from './errorHandler.js';

// In-memory caches for high-throughput zero-latency vault requests
const vaultKeyMemoryCache = new Map();
const hiddenUnlockMemoryCache = new Map();

const deriveStorageKeyFast = (sessionId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return crypto.createHmac('sha256', secret).update(`lockforge-vault:${sessionId}`).digest();
};

const deriveStorageKeyLegacy = (sessionId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return crypto.pbkdf2Sync(secret, `lockforge-vault:${sessionId}`, 100000, 32, 'sha512');
};

const normalizeSessionId = (sessionId) => {
  if (!sessionId) return null;
  if (typeof sessionId === 'object') {
    if (typeof sessionId.toHexString === 'function') return sessionId.toHexString();
    if (sessionId.$oid) return sessionId.$oid;
  }
  return String(sessionId);
};

export const getVaultKey = async (sessionId) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return null;

  // 1. Fast in-memory lookup (sub-millisecond, bypasses DB + PBKDF2)
  const cached = vaultKeyMemoryCache.get(id);
  if (cached) {
    if (cached.vaultUnlockedUntil && cached.vaultUnlockedUntil > new Date()) {
      return cached.key;
    }
    vaultKeyMemoryCache.delete(id);
  }

  // 2. Fallback to MongoDB session lookup
  const session = await Session.findById(id).select('userId vaultKeyEncrypted vaultUnlockedUntil isActive').lean();
  if (!session?.isActive || !session.vaultKeyEncrypted) return null;

  if (session.vaultUnlockedUntil && new Date(session.vaultUnlockedUntil) < new Date()) {
    await clearVaultKey(id);
    return null;
  }

  try {
    let keyBuffer;
    try {
      // Fast HMAC-SHA256 storage key derivation
      const storageKey = deriveStorageKeyFast(id);
      const keyB64 = decrypt(session.vaultKeyEncrypted, storageKey);
      keyBuffer = Buffer.from(keyB64, 'base64');
    } catch {
      // Legacy PBKDF2 fallback for older sessions
      const storageKey = deriveStorageKeyLegacy(id);
      const keyB64 = decrypt(session.vaultKeyEncrypted, storageKey);
      keyBuffer = Buffer.from(keyB64, 'base64');
      // Upgrade session to fast storage key asynchronously
      const fastKey = deriveStorageKeyFast(id);
      const reEncrypted = encrypt(keyB64, fastKey);
      Session.findByIdAndUpdate(id, { vaultKeyEncrypted: reEncrypted }).catch(() => {});
    }

    // Cache in memory for subsequent requests
    vaultKeyMemoryCache.set(id, {
      key: keyBuffer,
      vaultUnlockedUntil: new Date(session.vaultUnlockedUntil),
      userId: session.userId ? String(session.userId) : null,
    });

    return keyBuffer;
  } catch {
    await clearVaultKey(id);
    return null;
  }
};

export const setVaultKey = async (sessionId, key, ttlMinutes = 60) => {
  const id = normalizeSessionId(sessionId);
  if (!id || !key) return;

  const storageKey = deriveStorageKeyFast(id);
  const encrypted = encrypt(key.toString('base64'), storageKey);
  const vaultUnlockedUntil = new Date(Date.now() + ttlMinutes * 60 * 1000);

  // Update memory cache immediately
  vaultKeyMemoryCache.set(id, {
    key,
    vaultUnlockedUntil,
  });

  await Session.findByIdAndUpdate(id, {
    vaultKeyEncrypted: encrypted,
    vaultUnlockedUntil,
  });
};

export const clearVaultKey = async (sessionId) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return;

  vaultKeyMemoryCache.delete(id);
  hiddenUnlockMemoryCache.delete(id);

  await Session.findByIdAndUpdate(id, {
    $unset: { vaultKeyEncrypted: '', vaultUnlockedUntil: '', hiddenUnlockedUntil: '' },
  });
};

export const clearVaultKeysForUser = async (userId) => {
  const uIdStr = String(userId);
  for (const [sId, cached] of vaultKeyMemoryCache.entries()) {
    if (cached.userId === uIdStr) {
      vaultKeyMemoryCache.delete(sId);
      hiddenUnlockMemoryCache.delete(sId);
    }
  }

  await Session.updateMany(
    { userId },
    { $unset: { vaultKeyEncrypted: '', vaultUnlockedUntil: '', hiddenUnlockedUntil: '' } },
  );
};

export const getHiddenUnlockStatus = async (sessionId) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return false;

  // 1. Fast in-memory lookup
  const cached = hiddenUnlockMemoryCache.get(id);
  if (cached) {
    if (cached.hiddenUnlockedUntil && cached.hiddenUnlockedUntil > new Date()) {
      return true;
    }
    hiddenUnlockMemoryCache.delete(id);
  }

  const session = await Session.findById(id).select('hiddenUnlockedUntil isActive').lean();
  if (!session?.isActive || !session.hiddenUnlockedUntil) return false;

  if (new Date(session.hiddenUnlockedUntil) < new Date()) {
    await clearHiddenUnlock(id);
    return false;
  }

  hiddenUnlockMemoryCache.set(id, {
    hiddenUnlockedUntil: new Date(session.hiddenUnlockedUntil),
  });

  return true;
};

export const setHiddenUnlock = async (sessionId, ttlMinutes = 15) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return;

  const hiddenUnlockedUntil = new Date(Date.now() + ttlMinutes * 60 * 1000);

  hiddenUnlockMemoryCache.set(id, {
    hiddenUnlockedUntil,
  });

  await Session.findByIdAndUpdate(id, { hiddenUnlockedUntil });
};

export const clearHiddenUnlock = async (sessionId) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return;

  hiddenUnlockMemoryCache.delete(id);

  await Session.findByIdAndUpdate(id, {
    $unset: { hiddenUnlockedUntil: '' },
  });
};

export const requireVaultUnlock = async (req, res, next) => {
  try {
    const key = await getVaultKey(req.sessionId);
    if (!key) {
      return next(new AppError('Vault is locked. Please unlock with your master password.', 403));
    }
    req.vaultKey = key;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireHiddenUnlock = async (req, res, next) => {
  try {
    const isUnlocked = await getHiddenUnlockStatus(req.sessionId);
    if (!isUnlocked) {
      return next(new AppError('Hidden vault is locked. Please enter your master password to access hidden items.', 403));
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const unlockVault = async (userId, sessionId, masterPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const valid = verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier);
  if (!valid) throw new AppError('Invalid master password', 401);

  const key = deriveKey(masterPassword, user.masterSalt);
  const ttl = user.settings?.autoLockMinutes || 60;
  await setVaultKey(sessionId, key, ttl);
  return key;
};
