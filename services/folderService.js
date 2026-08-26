import Folder from '../models/Folder.js';
import { AppError } from '../middleware/errorHandler.js';

const DEFAULT_FOLDERS = ['Personal', 'Work', 'Banking', 'Social', 'Development', 'Other'];

export const createDefaultFolders = async (userId) => {
  const existing = await Folder.countDocuments({ userId });
  if (existing > 0) return;

  const folders = DEFAULT_FOLDERS.map((name) => ({
    userId,
    name,
    isDefault: true,
  }));

  try {
    await Folder.insertMany(folders, { ordered: false });
  } catch (err) {
    if (err.code === 11000) return;
    throw err;
  }
};

export const assertFolderOwnership = async (userId, folderId) => {
  if (!folderId) return null;
  const folder = await Folder.findOne({ _id: folderId, userId });
  if (!folder) throw new AppError('Folder not found', 404);
  return folder;
};
