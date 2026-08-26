import User from '../models/User.js';
import Credential from '../models/Credential.js';
import Folder from '../models/Folder.js';
import SecureNote from '../models/SecureNote.js';
import Session from '../models/Session.js';
import ActivityLog from '../models/ActivityLog.js';
import { clearTokenCookies } from '../services/tokenService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import {
  hashPassword, verifyPassword, generateSalt, createMasterVerifier, deriveKey, encryptJSON, decryptJSON,
} from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';
import { clearVaultKey, setVaultKey, clearVaultKeysForUser } from '../middleware/vaultLock.js';

export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -masterVerifier -masterSalt');
  const [credentialCount, folderCount, noteCount, favoriteCount] = await Promise.all([
    Credential.countDocuments({ userId: req.user._id, isDeleted: false }),
    Folder.countDocuments({ userId: req.user._id }),
    SecureNote.countDocuments({ userId: req.user._id }),
    Credential.countDocuments({ userId: req.user._id, isFavorite: true, isDeleted: false }),
  ]);
  res.json({
    success: true,
    data: { user, stats: { credentialCount, folderCount, noteCount, favoriteCount } },
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, settings } = req.body;
  const user = await User.findById(req.user._id);
  if (name) user.name = name;
  if (settings) {
    user.settings = { ...user.settings.toObject(), ...settings };
  }
  await user.save();
  await logActivity(user._id, 'settings_updated', 'Profile updated', req);
  res.json({
    success: true,
    data: { user: { id: user._id, name: user.name, email: user.email, settings: user.settings } },
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!(await verifyPassword(user.password, currentPassword))) {
    throw new AppError('Current password is incorrect', 400);
  }
  user.password = await hashPassword(newPassword);
  await user.save();
  await Session.updateMany({ userId: user._id, _id: { $ne: req.sessionId } }, { isActive: false });
  await logActivity(user._id, 'password_changed', 'Account password changed', req);
  res.json({ success: true, message: 'Password changed successfully' });
});

export const changeMasterPassword = asyncHandler(async (req, res) => {
  const { currentMasterPassword, newMasterPassword } = req.body;
  const user = await User.findById(req.user._id);
  const currentKey = deriveKey(currentMasterPassword, user.masterSalt);
  const { verifyMasterPassword } = await import('../utils/crypto.js');
  if (!verifyMasterPassword(currentMasterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Current master password is incorrect', 401);
  }

  const credentials = await Credential.find({ userId: user._id });
  const notes = await SecureNote.find({ userId: user._id });
  const newSalt = generateSalt();
  const newKey = deriveKey(newMasterPassword, newSalt);

  for (const cred of credentials) {
    const data = decryptJSON(cred.encryptedData, currentKey);
    cred.encryptedData = encryptJSON(data, newKey);
    await cred.save();
  }
  for (const note of notes) {
    const data = decryptJSON(note.encryptedData, currentKey);
    note.encryptedData = encryptJSON(data, newKey);
    await note.save();
  }

  user.masterSalt = newSalt;
  user.masterVerifier = createMasterVerifier(newMasterPassword, newSalt);
  await user.save();
  await setVaultKey(req.sessionId, newKey, user.settings?.autoLockMinutes || 60);
  await logActivity(user._id, 'master_password_changed', 'Master password changed', req);
  res.json({ success: true, message: 'Master password changed and vault re-encrypted' });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }
  await Promise.all([
    Credential.deleteMany({ userId: user._id }),
    Folder.deleteMany({ userId: user._id }),
    SecureNote.deleteMany({ userId: user._id }),
    Session.deleteMany({ userId: user._id }),
    ActivityLog.deleteMany({ userId: user._id }),
  ]);
  await user.deleteOne();
  await clearVaultKeysForUser(user._id);
  clearTokenCookies(res);
  res.json({ success: true, message: 'Account deleted' });
});
