import Credential from '../models/Credential.js';
import Folder from '../models/Folder.js';
import SecureNote from '../models/SecureNote.js';
import User from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { decryptJSON, deriveKey, verifyMasterPassword } from '../utils/crypto.js';
import {
  getHiddenUnlockStatus,
  setHiddenUnlock,
  clearHiddenUnlock,
  setVaultKey,
} from '../middleware/vaultLock.js';
import { logActivity } from '../services/activityService.js';

const decryptCredential = (cred, key, folderMap) => {
  const data = decryptJSON(cred.encryptedData, key);
  const folderName = cred.folderId ? folderMap[cred.folderId.toString()] || 'Unknown Folder' : null;

  return {
    id: cred._id,
    serviceName: cred.serviceName,
    username: data.username || '',
    email: data.email || '',
    password: data.password || '',
    url: data.url || '',
    notes: data.notes || '',
    customFields: data.customFields || [],
    folderId: cred.folderId,
    folderName,
    isFavorite: cred.isFavorite,
    isHidden: true,
    hiddenAt: cred.hiddenAt,
    tags: cred.tags,
    isDeleted: cred.isDeleted,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };
};

const decryptNote = (note, key, folderMap) => {
  const data = decryptJSON(note.encryptedData, key);
  const folderName = note.folderId ? folderMap[note.folderId.toString()] || 'Unknown Folder' : null;

  return {
    id: note._id,
    title: data.title,
    content: data.content || '',
    folderId: note.folderId,
    folderName,
    isFavorite: note.isFavorite,
    isHidden: true,
    hiddenAt: note.hiddenAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
};

export const unlockHidden = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  if (!masterPassword) throw new AppError('Master password is required', 400);

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404);

  const valid = verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier);
  if (!valid) throw new AppError('Invalid master password', 401);

  const key = deriveKey(masterPassword, user.masterSalt);
  const ttl = user.settings?.autoLockMinutes || 60;

  // Unlocks both vault and hidden vault
  await setVaultKey(req.sessionId, key, ttl);
  await setHiddenUnlock(req.sessionId, ttl);

  await logActivity(user._id, 'hidden_vault_unlocked', 'Unlocked hidden vault with master password', req);

  res.json({ success: true, message: 'Hidden vault unlocked' });
});

export const lockHidden = asyncHandler(async (req, res) => {
  await clearHiddenUnlock(req.sessionId);
  res.json({ success: true, message: 'Hidden vault locked' });
});

export const getHiddenStatus = asyncHandler(async (req, res) => {
  const unlocked = await getHiddenUnlockStatus(req.sessionId);
  res.json({ success: true, data: { unlocked } });
});

export const getHiddenItems = asyncHandler(async (req, res) => {
  const [credentials, folders, notes, allFolders] = await Promise.all([
    Credential.find({ userId: req.user._id, isHidden: true, isDeleted: false }).sort({ updatedAt: -1 }),
    Folder.find({ userId: req.user._id, isHidden: true }).sort({ name: 1 }),
    SecureNote.find({ userId: req.user._id, isHidden: true }).sort({ updatedAt: -1 }),
    Folder.find({ userId: req.user._id }).select('name'),
  ]);

  const folderMap = Object.fromEntries(allFolders.map((f) => [f._id.toString(), f.name]));

  // Calculate credential and note counts for hidden folders
  const [credFolderCounts, noteFolderCounts] = await Promise.all([
    Credential.aggregate([
      { $match: { userId: req.user._id, isDeleted: false } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]),
    SecureNote.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]),
  ]);

  const credCountMap = Object.fromEntries(credFolderCounts.map((c) => [c._id?.toString() || 'null', c.count]));
  const noteCountMap = Object.fromEntries(noteFolderCounts.map((c) => [c._id?.toString() || 'null', c.count]));

  const formattedFolders = folders.map((f) => ({
    id: f._id,
    name: f.name,
    isDefault: f.isDefault,
    isHidden: true,
    hiddenAt: f.hiddenAt,
    credentialCount: credCountMap[f._id.toString()] || 0,
    noteCount: noteCountMap[f._id.toString()] || 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));

  const decryptedCreds = credentials.map((c) => decryptCredential(c, req.vaultKey, folderMap));
  const decryptedNotes = notes.map((n) => decryptNote(n, req.vaultKey, folderMap));

  res.json({
    success: true,
    data: {
      credentials: decryptedCreds,
      folders: formattedFolders,
      notes: decryptedNotes,
      counts: {
        credentials: decryptedCreds.length,
        folders: formattedFolders.length,
        notes: decryptedNotes.length,
        total: decryptedCreds.length + formattedFolders.length + decryptedNotes.length,
      },
    },
  });
});
