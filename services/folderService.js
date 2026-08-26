import Folder from '../models/Folder.js';
import { AppError } from '../middleware/errorHandler.js';

const DEFAULT_FOLDERS = ['Personal', 'Work', 'Banking', 'Social', 'Development', 'Other'];

export const createDefaultFolders = async (userId) => {
  const folders = DEFAULT_FOLDERS.map((name) => ({
    userId,
    name,
    isDefault: true,
  }));
  await Folder.insertMany(folders);
};

export const assertFolderOwnership = async (userId, folderId) => {
  if (!folderId) return null;
  const folder = await Folder.findOne({ _id: folderId, userId });
  if (!folder) throw new AppError('Folder not found', 404);
  return folder;
};
