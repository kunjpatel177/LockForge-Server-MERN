import Folder from '../models/Folder.js';
import Credential from '../models/Credential.js';
import SecureNote from '../models/SecureNote.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { logActivity } from '../services/activityService.js';
import { LIMITS } from '../config/limits.js';
import { assertBatchSize, assertUnderLimit } from '../utils/limitGuard.js';
import { createDefaultFolders } from '../services/folderService.js';
export const getFolders = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const isTrash = req.query.trash === 'true';

  if (isTrash) {
    filter.isDeleted = true;
  } else {
    filter.isDeleted = { $ne: true };
    if (req.query.hidden === 'true') {
      filter.isHidden = true;
    } else {
      filter.isHidden = { $ne: true };
    }
  }

  const folders = await Folder.find(filter).sort({ name: 1 });
  const [credCounts, noteCounts] = await Promise.all([
    Credential.aggregate([
      { $match: { userId: req.user._id, isDeleted: false, isHidden: { $ne: true } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]),
    SecureNote.aggregate([
      { $match: { userId: req.user._id, isDeleted: { $ne: true }, isHidden: { $ne: true } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]),
  ]);
  const credMap = Object.fromEntries(credCounts.map((c) => [c._id?.toString() || 'null', c.count]));
  const noteMap = Object.fromEntries(noteCounts.map((c) => [c._id?.toString() || 'null', c.count]));
  const data = folders.map((f) => ({
    id: f._id,
    name: f.name,
    isDefault: f.isDefault,
    isHidden: !!f.isHidden,
    hiddenAt: f.hiddenAt,
    isDeleted: !!f.isDeleted,
    deletedAt: f.deletedAt,
    credentialCount: credMap[f._id.toString()] || 0,
    noteCount: noteMap[f._id.toString()] || 0,
    createdAt: f.createdAt,
  }));
  res.json({ success: true, data });
});

export const getFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!folder) throw new AppError('Folder not found', 404);
  const [credentialCount, noteCount] = await Promise.all([
    Credential.countDocuments({ userId: req.user._id, folderId: folder._id, isDeleted: false, isHidden: { $ne: true } }),
    SecureNote.countDocuments({ userId: req.user._id, folderId: folder._id, isDeleted: { $ne: true }, isHidden: { $ne: true } }),
  ]);
  res.json({
    success: true,
    data: {
      id: folder._id,
      name: folder.name,
      isDefault: folder.isDefault,
      isHidden: !!folder.isHidden,
      hiddenAt: folder.hiddenAt,
      credentialCount,
      noteCount,
      createdAt: folder.createdAt,
    },
  });
});

export const toggleHideFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!folder) throw new AppError('Folder not found', 404);

  folder.isHidden = !folder.isHidden;
  folder.hiddenAt = folder.isHidden ? new Date() : undefined;
  await folder.save();

  await logActivity(
    req.user._id,
    'folder_updated',
    `${folder.isHidden ? 'Hidden' : 'Unhidden'} folder: ${folder.name}`,
    req,
  );

  res.json({
    success: true,
    message: folder.isHidden ? 'Folder hidden' : 'Folder unhidden',
    data: {
      id: folder._id,
      name: folder.name,
      isHidden: folder.isHidden,
      hiddenAt: folder.hiddenAt,
    },
  });
});

export const createFolder = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const folderCount = await Folder.countDocuments({ userId: req.user._id, isDeleted: { $ne: true } });
  assertUnderLimit(folderCount, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
  const existing = await Folder.findOne({ userId: req.user._id, name, isDeleted: { $ne: true } });
  if (existing) throw new AppError('Folder already exists', 409);
  const folder = await Folder.create({ userId: req.user._id, name });
  await logActivity(req.user._id, 'folder_created', `Created folder: ${name}`, req);
  res.status(201).json({ success: true, data: { id: folder._id, name: folder.name } });
});

export const updateFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: { $ne: true } });
  if (!folder) throw new AppError('Folder not found', 404);
  if (req.body.name) {
    const conflict = await Folder.findOne({
      userId: req.user._id,
      name: req.body.name,
      isDeleted: { $ne: true },
      _id: { $ne: folder._id },
    });
    if (conflict) throw new AppError('Folder with this name already exists', 409);
    folder.name = req.body.name;
  }
  await folder.save();
  await logActivity(req.user._id, 'folder_updated', `Renamed folder to: ${folder.name}`, req);
  res.json({ success: true, data: { id: folder._id, name: folder.name } });
});

export const deleteFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: { $ne: true } });
  if (!folder) throw new AppError('Folder not found', 404);
  folder.isDeleted = true;
  folder.deletedAt = new Date();
  await folder.save();
  await logActivity(req.user._id, 'folder_deleted', `Moved folder to trash: ${folder.name}`, req);
  res.json({ success: true, message: 'Folder moved to trash' });
});

export const restoreFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: true });
  if (!folder) throw new AppError('Folder not found in trash', 404);

  const conflict = await Folder.findOne({
    userId: req.user._id,
    name: folder.name,
    isDeleted: { $ne: true },
    _id: { $ne: folder._id },
  });
  if (conflict) {
    throw new AppError(`A folder named "${folder.name}" already exists. Please rename or delete the existing one first.`, 409);
  }

  folder.isDeleted = false;
  folder.deletedAt = undefined;
  await folder.save();
  await logActivity(req.user._id, 'folder_restored', `Restored folder: ${folder.name}`, req);
  res.json({ success: true, data: { id: folder._id, name: folder.name } });
});

export const permanentDeleteFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: true });
  if (!folder) throw new AppError('Folder not found in trash', 404);
  await Credential.updateMany({ folderId: folder._id }, { folderId: null });
  await SecureNote.updateMany({ folderId: folder._id }, { folderId: null });
  await folder.deleteOne();
  await logActivity(req.user._id, 'folder_permanently_deleted', `Permanently deleted folder: ${folder.name}`, req);
  res.json({ success: true, message: 'Folder permanently deleted' });
});

export const deleteAllFolders = asyncHandler(async (req, res) => {
  const { permanent = false } = req.body || {};

  if (permanent) {
    await Credential.updateMany({ userId: req.user._id }, { folderId: null });
    await SecureNote.updateMany({ userId: req.user._id }, { folderId: null });
    const result = await Folder.deleteMany({ userId: req.user._id });
    await createDefaultFolders(req.user._id);
    await logActivity(req.user._id, 'folder_deleted', `Permanently deleted all folders (${result.deletedCount} items)`, req);
    return res.json({ success: true, message: `Permanently deleted ${result.deletedCount} folders` });
  }

  const result = await Folder.updateMany(
    { userId: req.user._id, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: new Date() }
  );

  await logActivity(req.user._id, 'folder_deleted', `Moved all folders to trash (${result.modifiedCount} items)`, req);
  res.json({ success: true, message: `Moved ${result.modifiedCount} folders to trash` });
});

export const assignItemsToFolder = asyncHandler(async (req, res) => {
  const { credentialIds = [], noteIds = [] } = req.body;
  assertBatchSize(credentialIds.length, LIMITS.MAX_ASSIGN_BATCH_SIZE, 'credentials');
  assertBatchSize(noteIds.length, LIMITS.MAX_ASSIGN_BATCH_SIZE, 'notes');
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!folder) throw new AppError('Folder not found', 404);

  let credentialCount = 0;
  let noteCount = 0;

  if (credentialIds.length) {
    const result = await Credential.updateMany(
      { _id: { $in: credentialIds }, userId: req.user._id, isDeleted: false },
      { folderId: folder._id },
    );
    credentialCount = result.modifiedCount;
  }

  if (noteIds.length) {
    const result = await SecureNote.updateMany(
      { _id: { $in: noteIds }, userId: req.user._id },
      { folderId: folder._id },
    );
    noteCount = result.modifiedCount;
  }

  await logActivity(
    req.user._id,
    'folder_updated',
    `Assigned ${credentialCount} credentials and ${noteCount} notes to folder: ${folder.name}`,
    req,
  );

  res.json({
    success: true,
    message: 'Items assigned to folder',
    data: { credentialCount, noteCount },
  });
});
