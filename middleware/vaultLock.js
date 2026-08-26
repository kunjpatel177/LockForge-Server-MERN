import crypto from 'crypto';
import Session from '../models/Session.js';
import User from '../models/User.js';
import { deriveKey, verifyMasterPassword, encrypt, decrypt } from '../utils/crypto.js';
import { AppError } from './errorHandler.js';

const deriveStorageKey = (sessionId) => {
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

  const session = await Session.findById(id).select('vaultKeyEncrypted vaultUnlockedUntil isActive');
  if (!session?.isActive || !session.vaultKeyEncrypted) return null;

  if (session.vaultUnlockedUntil && session.vaultUnlockedUntil < new Date()) {
    await clearVaultKey(id);
    return null;
  }

  try {
    const storageKey = deriveStorageKey(id);
    const keyB64 = decrypt(session.vaultKeyEncrypted, storageKey);
    return Buffer.from(keyB64, 'base64');
  } catch {
    await clearVaultKey(id);
    return null;
  }
};

export const setVaultKey = async (sessionId, key, ttlMinutes = 60) => {
  const id = normalizeSessionId(sessionId);
  if (!id || !key) return;

  const storageKey = deriveStorageKey(id);
  const encrypted = encrypt(key.toString('base64'), storageKey);
  const vaultUnlockedUntil = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await Session.findByIdAndUpdate(id, {
    vaultKeyEncrypted: encrypted,
    vaultUnlockedUntil,
  });
};

export const clearVaultKey = async (sessionId) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return;

  await Session.findByIdAndUpdate(id, {
    $unset: { vaultKeyEncrypted: '', vaultUnlockedUntil: '' },
  });
};

export const clearVaultKeysForUser = async (userId) => {
  await Session.updateMany(
    { userId },
    { $unset: { vaultKeyEncrypted: '', vaultUnlockedUntil: '' } },
  );
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
