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

const buildFolderLookup = (folders) => {
  const byId = new Map();
  folders.forEach((folder) => {
    byId.set(folder._id.toString(), folder);
  });
  return byId;
};

const resolveImportFolderId = (entry, folderIdByBackupId, folderIdByName) => {
  if (entry.folderName && folderIdByName[entry.folderName]) {
    return folderIdByName[entry.folderName];
  }
  if (entry.folderId && folderIdByBackupId[entry.folderId]) {
    return folderIdByBackupId[entry.folderId];
  }
  return null;
};

const syncFoldersFromBackup = async (userId, backupFolders) => {
  const folderIdByBackupId = {};
  const folderIdByName = {};

  const existing = await Folder.find({ userId });
  existing.forEach((folder) => {
    folderIdByName[folder.name] = folder._id;
  });

  for (const folder of backupFolders || []) {
    if (folderIdByName[folder.name]) {
      if (folder.id) folderIdByBackupId[folder.id] = folderIdByName[folder.name];
      continue;
    }

    const folderCount = await Folder.countDocuments({ userId });
    assertUnderLimit(folderCount, LIMITS.MAX_FOLDERS_PER_USER, 'folders');

    const created = await Folder.create({
      userId,
      name: folder.name,
      isDefault: !!folder.isDefault,
    });

    folderIdByName[folder.name] = created._id;
    if (folder.id) folderIdByBackupId[folder.id] = created._id;
  }

  return { folderIdByBackupId, folderIdByName };
};

export const exportBackup = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);

  const [credentials, folders, notes] = await Promise.all([
    Credential.find({ userId: req.user._id }),
    Folder.find({ userId: req.user._id }).sort({ name: 1 }),
    SecureNote.find({ userId: req.user._id }),
  ]);

  const folderById = buildFolderLookup(folders);

  const backupData = {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    folders: folders.map((folder) => ({
      id: folder._id.toString(),
      name: folder.name,
      isDefault: folder.isDefault,
    })),
    credentials: credentials.map((credential) => {
      const folder = credential.folderId
        ? folderById.get(credential.folderId.toString())
        : null;

      return {
        serviceName: credential.serviceName,
        data: decryptJSON(credential.encryptedData, key),
        folderId: folder ? folder._id.toString() : null,
        folderName: folder?.name || null,
        isFavorite: credential.isFavorite,
        tags: credential.tags,
        isDeleted: credential.isDeleted,
        deletedAt: credential.deletedAt,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      };
    }),
    notes: notes.map((note) => {
      const folder = note.folderId ? folderById.get(note.folderId.toString()) : null;

      return {
        data: decryptJSON(note.encryptedData, key),
        folderId: folder ? folder._id.toString() : null,
        folderName: folder?.name || null,
        isFavorite: note.isFavorite,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      };
    }),
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
      Folder.deleteMany({ userId: req.user._id }),
    ]);
  }

  const backupFolders = backupData.folders || [];
  let newFolderCount = backupFolders.length;

  if (!replace) {
    const existingNames = new Set(
      (await Folder.find({ userId: req.user._id }).select('name')).map((folder) => folder.name),
    );
    newFolderCount = backupFolders.filter((folder) => !existingNames.has(folder.name)).length;
  }

  const [currentFolderCount, currentCredCount, currentNoteCount] = await Promise.all([
    Folder.countDocuments({ userId: req.user._id }),
    Credential.countDocuments({ userId: req.user._id, isDeleted: false }),
    SecureNote.countDocuments({ userId: req.user._id }),
  ]);

  if (!replace) {
    assertUnderLimit(currentFolderCount + newFolderCount, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
    assertUnderLimit(currentCredCount + (backupData.credentials?.length || 0), LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');
    assertUnderLimit(currentNoteCount + (backupData.notes?.length || 0), LIMITS.MAX_NOTES_PER_USER, 'notes');
  } else {
    assertUnderLimit(backupFolders.length, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
    assertUnderLimit(backupData.credentials?.length || 0, LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');
    assertUnderLimit(backupData.notes?.length || 0, LIMITS.MAX_NOTES_PER_USER, 'notes');
  }

  const { folderIdByBackupId, folderIdByName } = await syncFoldersFromBackup(
    req.user._id,
    backupFolders,
  );

  for (const credential of backupData.credentials || []) {
    const credentialCount = await Credential.countDocuments({ userId: req.user._id, isDeleted: false });
    assertUnderLimit(credentialCount, LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');

    await Credential.create({
      userId: req.user._id,
      serviceName: credential.serviceName,
      encryptedData: encryptJSON(credential.data, key),
      folderId: resolveImportFolderId(credential, folderIdByBackupId, folderIdByName),
      isFavorite: credential.isFavorite,
      tags: credential.tags || [],
      isDeleted: credential.isDeleted || false,
      deletedAt: credential.deletedAt || undefined,
    });
  }

  for (const note of backupData.notes || []) {
    const noteCount = await SecureNote.countDocuments({ userId: req.user._id });
    assertUnderLimit(noteCount, LIMITS.MAX_NOTES_PER_USER, 'notes');

    await SecureNote.create({
      userId: req.user._id,
      encryptedData: encryptJSON(note.data, key),
      folderId: resolveImportFolderId(note, folderIdByBackupId, folderIdByName),
      isFavorite: note.isFavorite,
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
    ...folderGroups,
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
