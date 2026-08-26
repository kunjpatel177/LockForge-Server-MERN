import Folder from '../models/Folder.js';
import Credential from '../models/Credential.js';
import SecureNote from '../models/SecureNote.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { logActivity } from '../services/activityService.js';
import { LIMITS } from '../config/limits.js';
import { assertBatchSize, assertUnderLimit } from '../utils/limitGuard.js';
export const getFolders = asyncHandler(async (req, res) => {
  const folders = await Folder.find({ userId: req.user._id }).sort({ name: 1 });
  const [credCounts, noteCounts] = await Promise.all([
    Credential.aggregate([
      { $match: { userId: req.user._id, isDeleted: false } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]),
    SecureNote.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]),
  ]);
  const credMap = Object.fromEntries(credCounts.map((c) => [c._id?.toString() || 'null', c.count]));
  const noteMap = Object.fromEntries(noteCounts.map((c) => [c._id?.toString() || 'null', c.count]));
  const data = folders.map((f) => ({
    id: f._id,
    name: f.name,
    isDefault: f.isDefault,
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
    Credential.countDocuments({ userId: req.user._id, folderId: folder._id, isDeleted: false }),
    SecureNote.countDocuments({ userId: req.user._id, folderId: folder._id }),
  ]);
  res.json({
    success: true,
    data: {
      id: folder._id,
      name: folder.name,
      isDefault: folder.isDefault,
      credentialCount,
      noteCount,
      createdAt: folder.createdAt,
    },
  });
});

export const createFolder = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const folderCount = await Folder.countDocuments({ userId: req.user._id });
  assertUnderLimit(folderCount, LIMITS.MAX_FOLDERS_PER_USER, 'folders');
  const existing = await Folder.findOne({ userId: req.user._id, name });
  if (existing) throw new AppError('Folder already exists', 409);
  const folder = await Folder.create({ userId: req.user._id, name });
  await logActivity(req.user._id, 'folder_created', `Created folder: ${name}`, req);
  res.status(201).json({ success: true, data: { id: folder._id, name: folder.name } });
});

export const updateFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!folder) throw new AppError('Folder not found', 404);
  if (req.body.name) folder.name = req.body.name;
  await folder.save();
  await logActivity(req.user._id, 'folder_updated', `Renamed folder to: ${folder.name}`, req);
  res.json({ success: true, data: { id: folder._id, name: folder.name } });
});

export const deleteFolder = asyncHandler(async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!folder) throw new AppError('Folder not found', 404);
  await Credential.updateMany({ folderId: folder._id }, { folderId: null });
  await SecureNote.updateMany({ folderId: folder._id }, { folderId: null });
  await folder.deleteOne();
  await logActivity(req.user._id, 'folder_deleted', `Deleted folder: ${folder.name}`, req);
  res.json({ success: true, message: 'Folder deleted' });
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
