import Credential from '../models/Credential.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { encryptJSON, decryptJSON } from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';

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
    isDeleted: cred.isDeleted,
    deletedAt: cred.deletedAt,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };
};

export const getCredentials = asyncHandler(async (req, res) => {
  const key = req.vaultKey;
  const {
    search, folderId, favorite, sort = 'updatedAt', order = 'desc', trash,
  } = req.query;

  const filter = { userId: req.user._id };
  filter.isDeleted = trash === 'true';
  if (folderId) filter.folderId = folderId;
  if (favorite === 'true') filter.isFavorite = true;

  let query = Credential.find(filter);
  if (search) {
    query = Credential.find({
      ...filter,
      $or: [
        { serviceName: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ],
    });
  }

  const sortObj = { [sort]: order === 'asc' ? 1 : -1 };
  const credentials = await query.sort(sortObj);
  const decrypted = credentials.map((c) => decryptCredential(c, key));
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
  if (req.body.folderId !== undefined) cred.folderId = req.body.folderId || null;
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
  const result = await Credential.deleteMany({ userId: req.user._id, isDeleted: true });
  await logActivity(req.user._id, 'trash_emptied', `Emptied trash (${result.deletedCount} items)`, req);
  res.json({ success: true, message: `Permanently deleted ${result.deletedCount} credentials` });
});

export const toggleFavorite = asyncHandler(async (req, res) => {
  const cred = await Credential.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: false });
  if (!cred) throw new AppError('Credential not found', 404);
  cred.isFavorite = !cred.isFavorite;
  await cred.save();
  res.json({ success: true, data: decryptCredential(cred, req.vaultKey) });
});

export { requireVaultUnlock };
