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
import { auditUserVault } from '../services/securityAuditService.js';

const buildFolderLookup = (folders) => {
  const byId = new Map();
  folders.forEach((folder) => {
    byId.set(folder._id.toString(), folder);
  });
  return byId;
};

const resolveImportFolderId = (entry, folderIdByBackupId, folderIdByName) => {
  if (entry.folderName) {
    const byName =
      folderIdByName[entry.folderName] ||
      folderIdByName[entry.folderName.trim().toLowerCase()];
    if (byName) return byName;
  }
  if (entry.folderId && folderIdByBackupId[entry.folderId]) {
    return folderIdByBackupId[entry.folderId];
  }
  return null;
};

const syncFoldersFromBackup = async (userId, backupFolders, isReplaceAll = false) => {
  const folderIdByBackupId = {};
  const folderIdByName = {};
  let foldersCreated = 0;
  let foldersUpdated = 0;

  const existing = await Folder.find({ userId, isDeleted: { $ne: true } });
  const existingByName = new Map();
  existing.forEach((folder) => {
    existingByName.set(folder.name.trim().toLowerCase(), folder);
    folderIdByName[folder.name] = folder._id;
    folderIdByName[folder.name.trim().toLowerCase()] = folder._id;
  });

  for (const folder of backupFolders || []) {
    const lookupKey = (folder.name || '').trim().toLowerCase();
    const existingFolder = !isReplaceAll ? existingByName.get(lookupKey) : null;

    if (existingFolder) {
      if (folder.id) folderIdByBackupId[folder.id] = existingFolder._id;
      folderIdByName[folder.name] = existingFolder._id;
      folderIdByName[lookupKey] = existingFolder._id;

      // Ensure hidden folders stay hidden:
      // If either existing was hidden OR backup folder is marked hidden, keep it hidden
      const shouldBeHidden = Boolean(existingFolder.isHidden || folder.isHidden);
      let changed = false;

      if (existingFolder.isHidden !== shouldBeHidden) {
        existingFolder.isHidden = shouldBeHidden;
        existingFolder.hiddenAt = shouldBeHidden
          ? (existingFolder.hiddenAt || (folder.hiddenAt ? new Date(folder.hiddenAt) : new Date()))
          : undefined;
        changed = true;
      } else if (shouldBeHidden && !existingFolder.hiddenAt) {
        existingFolder.hiddenAt = folder.hiddenAt ? new Date(folder.hiddenAt) : new Date();
        changed = true;
      }

      if (changed) {
        await existingFolder.save();
        foldersUpdated += 1;
      }
      continue;
    }

    const folderCount = await Folder.countDocuments({ userId, isDeleted: { $ne: true } });
    assertUnderLimit(folderCount, LIMITS.MAX_FOLDERS_PER_USER, 'folders');

    const isHidden = !!folder.isHidden;
    const created = await Folder.create({
      userId,
      name: folder.name,
      isDefault: !!folder.isDefault,
      isHidden,
      hiddenAt: isHidden ? (folder.hiddenAt ? new Date(folder.hiddenAt) : new Date()) : undefined,
    });

    foldersCreated += 1;
    folderIdByName[folder.name] = created._id;
    folderIdByName[lookupKey] = created._id;
    if (folder.id) folderIdByBackupId[folder.id] = created._id;
    existingByName.set(lookupKey, created);
  }

  return { folderIdByBackupId, folderIdByName, foldersCreated, foldersUpdated };
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
      isHidden: !!folder.isHidden,
      hiddenAt: folder.hiddenAt || (folder.isHidden ? folder.updatedAt : undefined),
      isDeleted: !!folder.isDeleted,
      deletedAt: folder.deletedAt || undefined,
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
        isHidden: !!credential.isHidden,
        hiddenAt: credential.hiddenAt || (credential.isHidden ? credential.updatedAt : undefined),
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
        isHidden: !!note.isHidden,
        hiddenAt: note.hiddenAt || (note.isHidden ? note.updatedAt : undefined),
        isDeleted: note.isDeleted,
        deletedAt: note.deletedAt,
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
  const { masterPassword, backup, replace = false, mode } = req.body;
  const isReplaceAll = mode === 'replace_all' || (replace === true && mode !== 'smart_merge');

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

  const backupFolders = backupData.folders || [];
  const backupCredentials = backupData.credentials || [];
  const backupNotes = backupData.notes || [];

  if (isReplaceAll) {
    await Promise.all([
      Credential.deleteMany({ userId: req.user._id }),
      SecureNote.deleteMany({ userId: req.user._id }),
      Folder.deleteMany({ userId: req.user._id }),
    ]);
  }

  // Sync / create folders
  const {
    folderIdByBackupId,
    folderIdByName,
    foldersCreated,
    foldersUpdated,
  } = await syncFoldersFromBackup(req.user._id, backupFolders, isReplaceAll);

  // Sync credentials
  let credentialsCreated = 0;
  let credentialsUpdated = 0;

  const existingCredMap = new Map();
  if (!isReplaceAll) {
    const existingCreds = await Credential.find({ userId: req.user._id, isDeleted: false });
    existingCreds.forEach((c) => {
      existingCredMap.set(c.serviceName.trim().toLowerCase(), c);
    });
  }

  for (const credential of backupCredentials) {
    const lookupKey = (credential.serviceName || '').trim().toLowerCase();
    const existingCred = !isReplaceAll ? existingCredMap.get(lookupKey) : null;
    const targetFolderId = resolveImportFolderId(credential, folderIdByBackupId, folderIdByName);

    if (existingCred) {
      existingCred.encryptedData = encryptJSON(credential.data, key);
      existingCred.folderId = targetFolderId;
      if (credential.isFavorite !== undefined) existingCred.isFavorite = !!credential.isFavorite;
      if (credential.tags) existingCred.tags = credential.tags || [];

      // Hidden credentials MUST stay hidden
      const shouldBeHidden = Boolean(existingCred.isHidden || credential.isHidden);
      existingCred.isHidden = shouldBeHidden;
      existingCred.hiddenAt = shouldBeHidden
        ? (existingCred.hiddenAt || (credential.hiddenAt ? new Date(credential.hiddenAt) : new Date()))
        : undefined;

      if (credential.isDeleted !== undefined) {
        existingCred.isDeleted = !!credential.isDeleted;
        existingCred.deletedAt = credential.deletedAt ? new Date(credential.deletedAt) : undefined;
      }
      await existingCred.save();
      credentialsUpdated += 1;
    } else {
      const credentialCount = await Credential.countDocuments({ userId: req.user._id, isDeleted: false });
      assertUnderLimit(credentialCount, LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');

      const isHidden = !!credential.isHidden;
      const created = await Credential.create({
        userId: req.user._id,
        serviceName: credential.serviceName,
        encryptedData: encryptJSON(credential.data, key),
        folderId: targetFolderId,
        isFavorite: !!credential.isFavorite,
        tags: credential.tags || [],
        isHidden,
        hiddenAt: isHidden ? (credential.hiddenAt ? new Date(credential.hiddenAt) : new Date()) : undefined,
        isDeleted: !!credential.isDeleted,
        deletedAt: credential.deletedAt ? new Date(credential.deletedAt) : undefined,
      });
      credentialsCreated += 1;
      existingCredMap.set(lookupKey, created);
    }
  }

  // Sync secure notes
  let notesCreated = 0;
  let notesUpdated = 0;

  const existingNoteMap = new Map();
  if (!isReplaceAll) {
    const existingNotes = await SecureNote.find({ userId: req.user._id, isDeleted: false });
    for (const note of existingNotes) {
      try {
        const data = decryptJSON(note.encryptedData, key);
        if (data?.title) {
          existingNoteMap.set(data.title.trim().toLowerCase(), note);
        }
      } catch {
        // Skip un-decryptable note
      }
    }
  }

  for (const note of backupNotes) {
    const noteTitle = (note.data?.title || 'Untitled Note').trim();
    const lookupKey = noteTitle.toLowerCase();
    const existingNote = !isReplaceAll ? existingNoteMap.get(lookupKey) : null;
    const targetFolderId = resolveImportFolderId(note, folderIdByBackupId, folderIdByName);

    if (existingNote) {
      existingNote.encryptedData = encryptJSON(note.data, key);
      existingNote.folderId = targetFolderId;
      if (note.isFavorite !== undefined) existingNote.isFavorite = !!note.isFavorite;

      // Hidden notes MUST stay hidden
      const shouldBeHidden = Boolean(existingNote.isHidden || note.isHidden);
      existingNote.isHidden = shouldBeHidden;
      existingNote.hiddenAt = shouldBeHidden
        ? (existingNote.hiddenAt || (note.hiddenAt ? new Date(note.hiddenAt) : new Date()))
        : undefined;

      if (note.isDeleted !== undefined) {
        existingNote.isDeleted = !!note.isDeleted;
        existingNote.deletedAt = note.deletedAt ? new Date(note.deletedAt) : undefined;
      }
      await existingNote.save();
      notesUpdated += 1;
    } else {
      const noteCount = await SecureNote.countDocuments({ userId: req.user._id, isDeleted: false });
      assertUnderLimit(noteCount, LIMITS.MAX_NOTES_PER_USER, 'notes');

      const isHidden = !!note.isHidden;
      const created = await SecureNote.create({
        userId: req.user._id,
        encryptedData: encryptJSON(note.data, key),
        folderId: targetFolderId,
        isFavorite: !!note.isFavorite,
        isHidden,
        hiddenAt: isHidden ? (note.hiddenAt ? new Date(note.hiddenAt) : new Date()) : undefined,
        isDeleted: !!note.isDeleted,
        deletedAt: note.deletedAt ? new Date(note.deletedAt) : undefined,
      });
      notesCreated += 1;
      existingNoteMap.set(lookupKey, created);
    }
  }

  const actionMsg = isReplaceAll
    ? `Vault restored (all replaced: ${credentialsCreated} creds, ${notesCreated} notes, ${foldersCreated} folders)`
    : `Vault merged (${credentialsUpdated} creds updated, ${credentialsCreated} added, ${notesUpdated} notes updated, ${notesCreated} added)`;
  await logActivity(req.user._id, 'restore', actionMsg, req);
  auditUserVault(req.user._id, key, false).catch(() => {});

  res.json({
    success: true,
    message: isReplaceAll ? 'Vault replaced successfully from backup' : 'Backup merged successfully with vault',
    data: {
      mode: isReplaceAll ? 'replace_all' : 'smart_merge',
      summary: {
        credentialsUpdated,
        credentialsCreated,
        notesUpdated,
        notesCreated,
        foldersUpdated,
        foldersCreated,
      },
    },
  });
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
    SecureNote.find({ userId: req.user._id, isDeleted: false }).sort({ updatedAt: -1 }),
    Folder.find({ userId: req.user._id, isDeleted: false }).sort({ name: 1 }),
  ]);

  const folderGroups = folders.map((folder) => ({
    id: folder._id.toString(),
    name: folder.name,
    isHidden: !!folder.isHidden,
    credentials: [],
    notes: [],
  }));
  const unassigned = { name: 'Unassigned', isHidden: false, credentials: [], notes: [] };

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
      isHidden: !!cred.isHidden,
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
      isHidden: !!note.isHidden,
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
    userPassword: masterPassword,
  });

  const filename = `lockforge-export-${new Date().toISOString().split('T')[0]}-${new Date().toLocaleTimeString()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(pdfBuffer);
});
