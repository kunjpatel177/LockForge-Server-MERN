import { deriveKey, verifyMasterPassword } from '../utils/crypto.js';
import User from '../models/User.js';
import { AppError } from './errorHandler.js';

const vaultKeys = new Map();

export const getVaultKey = (userId) => vaultKeys.get(userId.toString());

export const setVaultKey = (userId, key, ttlMinutes = 60) => {
  const id = userId.toString();
  vaultKeys.set(id, key);
  setTimeout(() => vaultKeys.delete(id), ttlMinutes * 60 * 1000);
};

export const clearVaultKey = (userId) => {
  vaultKeys.delete(userId.toString());
};

export const requireVaultUnlock = (req, res, next) => {
  const key = getVaultKey(req.user._id);
  if (!key) {
    return next(new AppError('Vault is locked. Please unlock with your master password.', 403));
  }
  req.vaultKey = key;
  next();
};

export const unlockVault = async (userId, masterPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  const valid = verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier);
  if (!valid) throw new AppError('Invalid master password', 401);
  const key = deriveKey(masterPassword, user.masterSalt);
  setVaultKey(userId, key, user.settings?.autoLockMinutes || 60);
  return key;
};
