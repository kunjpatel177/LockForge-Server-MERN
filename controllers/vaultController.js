import Credential from '../models/Credential.js';
import Folder from '../models/Folder.js';
import SecureNote from '../models/SecureNote.js';
import User from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { encryptJSON, decryptJSON, verifyMasterPassword, verifyPassword } from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';
import { assertFolderOwnership, createDefaultFolders } from '../services/folderService.js';
import { LIMITS } from '../config/limits.js';
import { assertUnderLimit } from '../utils/limitGuard.js';

const decryptCredential = (cred, key) => {
  const data = decryptJSON(cred.encryptedData, key);
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
    isFavorite: cred.isFavorite,
    tags: cred.tags,
    isHidden: !!cred.isHidden,
    hiddenAt: cred.hiddenAt,
    isDeleted: cred.isDeleted,
    deletedAt: cred.deletedAt,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };
};

export const getCredentials = asyncHandler(async (req, res) => {
  const key = req.vaultKey;
  const {
    search,
    searchField = 'all',
    folderId,
    favorite,
    hasTags,
    sort = 'updatedAt',
    order = 'desc',
    trash,
  } = req.query;

  const filter = { userId: req.user._id };
  filter.isDeleted = trash === 'true';

  if (req.query.hidden === 'true') {
    filter.isHidden = true;
  } else if (trash !== 'true') {
    if (folderId) {
      const targetFolder = await Folder.findOne({ _id: folderId, userId: req.user._id });
      if (!targetFolder?.isHidden) {
        filter.isHidden = { $ne: true };
      }
    } else {
      filter.isHidden = { $ne: true };
      const hiddenFolders = await Folder.find({ userId: req.user._id, isHidden: true }).select('_id');
      if (hiddenFolders.length > 0) {
        filter.folderId = { $nin: hiddenFolders.map((f) => f._id) };
      }
    }
  }

  if (folderId) filter.folderId = folderId;
  if (req.query.unassigned === 'true') filter.folderId = null;
  if (favorite === 'true') filter.isFavorite = true;
  if (hasTags === 'true') filter.tags = { $exists: true, $ne: [] };

  const sortDirection = order === 'asc' ? 1 : -1;
  const mongoSortObj = {};
  if (['updatedAt', 'createdAt'].includes(sort)) {
    mongoSortObj[sort] = sortDirection;
  } else if (sort === 'serviceName') {
    mongoSortObj.serviceName = sortDirection;
  } else {
    mongoSortObj.updatedAt = -1;
  }

  const credentials = await Credential.find(filter).sort(mongoSortObj);
  let decrypted = credentials.map((c) => decryptCredential(c, key));

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    decrypted = decrypted.filter((c) => {
      const matchService = (c.serviceName || '').toLowerCase().includes(q);
      const matchUsername = (c.username || '').toLowerCase().includes(q);
      const matchEmail = (c.email || '').toLowerCase().includes(q);
      const matchUrl = (c.url || '').toLowerCase().includes(q);
      const matchTags = Array.isArray(c.tags) && c.tags.some((t) => t.toLowerCase().includes(q));
      const matchNotes = (c.notes || '').toLowerCase().includes(q);
      const matchCustom = Array.isArray(c.customFields) && c.customFields.some((cf) =>
        (cf.label || '').toLowerCase().includes(q) || (cf.value || '').toLowerCase().includes(q)
      );

      switch (searchField) {
        case 'service':
          return matchService;
        case 'username_email':
          return matchUsername || matchEmail;
        case 'url':
          return matchUrl;
        case 'tags':
          return matchTags;
        case 'notes':
          return matchNotes;
        case 'all':
        default:
          return (
            matchService ||
            matchUsername ||
            matchEmail ||
            matchUrl ||
            matchTags ||
            matchNotes ||
            matchCustom
          );
      }
    });
  }

  // Case-insensitive sorting
  if (sort === 'serviceName') {
    decrypted.sort((a, b) =>
      sortDirection * a.serviceName.localeCompare(b.serviceName, undefined, { sensitivity: 'base' })
    );
  } else if (sort === 'favoriteFirst') {
    decrypted.sort((a, b) => {
      if (a.isFavorite === b.isFavorite) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      }
      return a.isFavorite ? -1 : 1;
    });
  }

  res.json({ success: true, data: decrypted, count: decrypted.length });
});

export const getCredential = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id });
  if (!cred) throw new AppError('Credential not found', 404);
  res.json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export const createCredential = asyncHandler(async (req, res) => {
  const {
    serviceName, username, email, password, url, notes, folderId, tags, customFields, isFavorite,
  } = req.body;

  if (folderId) await assertFolderOwnership(req.user._id, folderId);

  const credentialCount = await Credential.countDocuments({ userId: req.user._id, isDeleted: false });
  assertUnderLimit(credentialCount, LIMITS.MAX_CREDENTIALS_PER_USER, 'credentials');

  const encryptedData = encryptJSON({
    username, email, password, url, notes, customFields: customFields || [],
  }, req.vaultKey);

  const cred = await Credential.create({
    userId: req.user._id,
    serviceName,
    encryptedData,
    folderId: folderId || null,
    tags: tags || [],
    isFavorite: isFavorite || false,
  });

  await logActivity(req.user._id, 'credential_created', `Created credential: ${serviceName}`, req);
  res.status(201).json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export const updateCredential = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id });
  if (!cred) throw new AppError('Credential not found', 404);

  const existing = decryptJSON(cred.encryptedData, req.vaultKey);
  const updated = {
    username: req.body.username ?? existing.username,
    email: req.body.email ?? existing.email,
    password: req.body.password ?? existing.password,
    url: req.body.url ?? existing.url,
    notes: req.body.notes ?? existing.notes,
    customFields: req.body.customFields ?? existing.customFields,
  };

  if (req.body.serviceName) cred.serviceName = req.body.serviceName;
  if (req.body.folderId !== undefined) {
    if (req.body.folderId) await assertFolderOwnership(req.user._id, req.body.folderId);
    cred.folderId = req.body.folderId || null;
  }
  if (req.body.tags) cred.tags = req.body.tags;
  if (req.body.isFavorite !== undefined) cred.isFavorite = req.body.isFavorite;

  cred.encryptedData = encryptJSON(updated, req.vaultKey);
  await cred.save();
  await logActivity(req.user._id, 'credential_updated', `Updated credential: ${cred.serviceName}`, req);
  res.json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export const deleteCredential = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id });
  if (!cred) throw new AppError('Credential not found', 404);
  cred.isDeleted = true;
  cred.deletedAt = new Date();
  await cred.save();
  await logActivity(req.user._id, 'credential_deleted', `Moved to trash: ${cred.serviceName}`, req);
  res.json({ success: true, message: 'Credential moved to trash' });
});

export const restoreCredential = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: true });
  if (!cred) throw new AppError('Credential not found in trash', 404);
  cred.isDeleted = false;
  cred.deletedAt = undefined;
  await cred.save();
  await logActivity(req.user._id, 'credential_restored', `Restored: ${cred.serviceName}`, req);
  res.json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export const permanentDeleteCredential = asyncHandler(async (req, res) => {
  const cred = await Credential.findOneAndDelete({ _id: req.params.id, userId: req.user._id, isDeleted: true });
  if (!cred) throw new AppError('Credential not found in trash', 404);
  await logActivity(req.user._id, 'credential_permanently_deleted', `Permanently deleted: ${cred.serviceName}`, req);
  res.json({ success: true, message: 'Credential permanently deleted' });
});

export const emptyTrash = asyncHandler(async (req, res) => {
  const trashedFolders = await Folder.find({ userId: req.user._id, isDeleted: true }).select('_id');
  const trashedFolderIds = trashedFolders.map((f) => f._id);
  if (trashedFolderIds.length) {
    await Credential.updateMany({ folderId: { $in: trashedFolderIds } }, { folderId: null });
    await SecureNote.updateMany({ folderId: { $in: trashedFolderIds } }, { folderId: null });
    await Folder.deleteMany({ _id: { $in: trashedFolderIds } });
  }

  const [credResult, noteResult] = await Promise.all([
    Credential.deleteMany({ userId: req.user._id, isDeleted: true }),
    SecureNote.deleteMany({ userId: req.user._id, isDeleted: true }),
  ]);

  const total = credResult.deletedCount + noteResult.deletedCount + trashedFolderIds.length;
  await logActivity(req.user._id, 'trash_emptied', `Emptied trash (${total} items)`, req);
  res.json({
    success: true,
    message: `Permanently deleted ${total} items from trash`,
    data: {
      credentialsDeleted: credResult.deletedCount,
      notesDeleted: noteResult.deletedCount,
      foldersDeleted: trashedFolderIds.length,
    },
  });
});

export const deleteAllCredentials = asyncHandler(async (req, res) => {
  const { permanent = false } = req.body || {};

  if (permanent) {
    const result = await Credential.deleteMany({ userId: req.user._id });
    await logActivity(req.user._id, 'credential_deleted', `Permanently deleted all credentials (${result.deletedCount} items)`, req);
    return res.json({ success: true, message: `Permanently deleted ${result.deletedCount} credentials` });
  }

  const result = await Credential.updateMany(
    { userId: req.user._id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() }
  );

  await logActivity(req.user._id, 'credential_deleted', `Moved all credentials to trash (${result.modifiedCount} items)`, req);
  res.json({ success: true, message: `Moved ${result.modifiedCount} credentials to trash` });
});

export const purgeAllVaultData = asyncHandler(async (req, res) => {
  const { masterPassword, password } = req.body || {};
  const user = await User.findById(req.user._id);

  let verified = false;
  if (masterPassword) {
    verified = verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier);
  } else if (password) {
    verified = await verifyPassword(user.password, password);
  }

  if (!verified) {
    throw new AppError('Incorrect password provided to confirm vault purge', 401);
  }

  const [credResult, noteResult, folderResult] = await Promise.all([
    Credential.deleteMany({ userId: user._id }),
    SecureNote.deleteMany({ userId: user._id }),
    Folder.deleteMany({ userId: user._id }),
  ]);

  await createDefaultFolders(user._id);

  const total = credResult.deletedCount + noteResult.deletedCount + folderResult.deletedCount;
  await logActivity(user._id, 'vault_cleared', `Permanently purged all vault data (${total} items removed)`, req);

  res.json({
    success: true,
    message: `All vault data cleared successfully (${credResult.deletedCount} credentials, ${noteResult.deletedCount} notes, ${folderResult.deletedCount} folders permanently deleted)`,
    data: {
      credentialsDeleted: credResult.deletedCount,
      notesDeleted: noteResult.deletedCount,
      foldersDeleted: folderResult.deletedCount,
    },
  });
});

export const moveCredentialToFolder = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: false });
  if (!cred) throw new AppError('Credential not found', 404);

  if (req.body.folderId) {
    await assertFolderOwnership(req.user._id, req.body.folderId);
    cred.folderId = req.body.folderId;
  } else {
    cred.folderId = null;
  }

  await cred.save();
  await logActivity(req.user._id, 'credential_updated', `Moved credential to folder: ${cred.serviceName}`, req);
  res.json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export const toggleFavorite = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: false });
  if (!cred) throw new AppError('Credential not found', 404);
  cred.isFavorite = !cred.isFavorite;
  await cred.save();
  res.json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export const toggleHideCredential = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: false });
  if (!cred) throw new AppError('Credential not found', 404);

  cred.isHidden = !cred.isHidden;
  cred.hiddenAt = cred.isHidden ? new Date() : undefined;
  await cred.save();

  await logActivity(
    req.user._id,
    'credential_updated',
    `${cred.isHidden ? 'Hidden' : 'Unhidden'} credential: ${cred.serviceName}`,
    req,
  );

  res.json({
    success: true,
    message: cred.isHidden ? 'Credential hidden' : 'Credential unhidden',
    data: decryptCredential(cred, req.vaultKey),
  });
});

export { requireVaultUnlock };
