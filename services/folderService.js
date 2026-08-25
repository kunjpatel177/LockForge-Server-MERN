import Folder from '../models/Folder.js';

const DEFAULT_FOLDERS = ['Personal', 'Work', 'Banking', 'Social', 'Development', 'Other'];

export const createDefaultFolders = async (userId) => {
  const folders = DEFAULT_FOLDERS.map((name) => ({
    userId,
    name,
    isDefault: true,
  }));
  await Folder.insertMany(folders);
};
