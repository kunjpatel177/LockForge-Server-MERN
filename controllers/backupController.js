import Credential from '../models/Credential.js';
import Folder from '../models/Folder.js';
import SecureNote from '../models/SecureNote.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { encryptJSON, decryptJSON, verifyMasterPassword } from '../utils/crypto.js';
import User from '../models/User.js';
import { deriveKey } from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';
import { LIMITS } from '../config/limits.js';
import { assertUnderLimit } from '../utils/limitGuard.js';
import { buildVaultPdf } from '../utils/pdfExport.js';

export const exportBackup = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);

  const [credentials, folders, notes] = await Promise.all([
    Credential.find({ userId: req.user._id }),
    Folder.find({ userId: req.user._id }),
    SecureNote.find({ userId: req.user._id }),
  ]);

  const backupData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    credentials: credentials.map((c) => ({
      serviceName: c.serviceName,
      data: decryptJSON(c.encryptedData, key),
      folderId: c.folderId,
      isFavorite: c.isFavorite,
      tags: c.tags,
      isDeleted: c.isDeleted,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    folders: folders.map((f) => ({ name: f.name, isDefault: f.isDefault })),
    notes: notes.map((n) => ({
      data: decryptJSON(n.encryptedData, key),
      folderId: n.folderId,
      isFavorite: n.isFavorite,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
  };

  const backupKey = deriveKey(masterPassword + '_backup', user.masterSalt);
  const encrypted = encryptJSON(backupData, backupKey);

  await logActivity(req.user._id, 'backup', 'Encrypted vault backup exported', req);
  res.json({
    success: true,
    data: {
      backup: encrypted,
      exportedAt: backupData.exportedAt,
    },
  });
});

export const importBackup = asyncHandler(async (req, res) => {
  const { masterPassword, backup, replace = false } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);
  const backupKey = deriveKey(masterPassword + '_backup', user.masterSalt);

  let backupData;
  try {
    backupData = decryptJSON(backup, backupKey);
  } catch {
    throw new AppError('Invalid backup file or master password', 400);
  }

  if (replace) {
    await Promise.all([
      Credential.deleteMany({ userId: req.user._id }),
      SecureNote.deleteMany({ userId: req.user._id }),
    ]);
  }

  const folderMap = {};
  const existingFolders = await Folder.find({ userId: req.user._id });
  existingFolders.forEach((f) => { folderMap[f.name] = f._id; });

  const newFolders = (backupData.folders || []).filter((f) => !folderMap[f.name]);
  const [currentFolderCount, currentCredCount, currentNoteCount] = await Promise.all([
    Folder.countDocuments({ userId: req.user._id }),
    Credential.countDocuments({ userId: req.user._id, isDeleted: false }),
    SecureNote.countDocuments({ userId: req.user._id }),
  ]);

  if (!replace) {
    assertUnderLimit(currentFolderCount + newFolders.length, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
    assertUnderLimit(currentCredCount + (backupData.credentials?.length || 0), LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');
    assertUnderLimit(currentNoteCount + (backupData.notes?.length || 0), LIMITS.MAX_NOTES_PER_USER, 'notes');
  } else {
    assertUnderLimit(newFolders.length, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
    assertUnderLimit(backupData.credentials?.length || 0, LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');
    assertUnderLimit(backupData.notes?.length || 0, LIMITS.MAX_NOTES_PER_USER, 'notes');
  }

  for (const f of backupData.folders || []) {
    if (!folderMap[f.name]) {
      const folderCount = await Folder.countDocuments({ userId: req.user._id });
      assertUnderLimit(folderCount, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
      const folder = await Folder.create({ userId: req.user._id, name: f.name, isDefault: f.isDefault });
      folderMap[f.name] = folder._id;
    }
  }

  for (const c of backupData.credentials || []) {
    const credentialCount = await Credential.countDocuments({ userId: req.user._id, isDeleted: false });
    assertUnderLimit(credentialCount, LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');
    await Credential.create({
      userId: req.user._id,
      serviceName: c.serviceName,
      encryptedData: encryptJSON(c.data, key),
      folderId: c.folderId,
      isFavorite: c.isFavorite,
      tags: c.tags || [],
      isDeleted: c.isDeleted || false,
    });
  }

  for (const n of backupData.notes || []) {
    const noteCount = await SecureNote.countDocuments({ userId: req.user._id });
    assertUnderLimit(noteCount, LIMITS.MAX_NOTES_PER_USER, 'notes');
    await SecureNote.create({
      userId: req.user._id,
      encryptedData: encryptJSON(n.data, key),
      folderId: n.folderId,
      isFavorite: n.isFavorite,
    });
  }

  await logActivity(req.user._id, 'restore', 'Vault restored from backup', req);
  res.json({ success: true, message: 'Backup restored successfully' });
});

export const exportPDF = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);

  const [credentials, notes, folders] = await Promise.all([
    Credential.find({ userId: req.user._id, isDeleted: false }).sort({ serviceName: 1 }),
    SecureNote.find({ userId: req.user._id }).sort({ updatedAt: -1 }),
    Folder.find({ userId: req.user._id }).sort({ name: 1 }),
  ]);

  const folderGroups = folders.map((folder) => ({
    id: folder._id.toString(),
    name: folder.name,
    credentials: [],
    notes: [],
  }));
  const unassigned = { name: 'Unassigned', credentials: [], notes: [] };

  credentials.forEach((cred) => {
    const data = decryptJSON(cred.encryptedData, key);
    const item = {
      serviceName: cred.serviceName,
      username: data.username || '',
      email: data.email || '',
      password: data.password || '',
      url: data.url || '',
      notes: data.notes || '',
      customFields: data.customFields || [],
      updatedAt: cred.updatedAt,
    };
    if (cred.folderId) {
      const group = folderGroups.find((g) => g.id === cred.folderId.toString());
      if (group) group.credentials.push(item);
      else unassigned.credentials.push(item);
    } else {
      unassigned.credentials.push(item);
    }
  });

  notes.forEach((note) => {
    const data = decryptJSON(note.encryptedData, key);
    const item = {
      title: data.title || 'Untitled Note',
      content: data.content || '',
      updatedAt: note.updatedAt,
    };
    if (note.folderId) {
      const group = folderGroups.find((g) => g.id === note.folderId.toString());
      if (group) group.notes.push(item);
      else unassigned.notes.push(item);
    } else {
      unassigned.notes.push(item);
    }
  });

  const populatedSections = [
    ...folderGroups.filter((s) => s.credentials.length || s.notes.length),
    ...(unassigned.credentials.length || unassigned.notes.length ? [unassigned] : []),
  ];

  await logActivity(req.user._id, 'export', 'PDF export generated', req);

  const pdfBuffer = await buildVaultPdf({
    user,
    folders,
    credentials,
    notes,
    populatedSections,
  });

  const filename = `lockforge-export-${new Date().toISOString().split('T')[0]}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(pdfBuffer);
});
