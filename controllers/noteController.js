import SecureNote from '../models/SecureNote.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { encryptJSON, decryptJSON } from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';

const decryptNote = (note, key) => {
  const data = decryptJSON(note.encryptedData, key);
  return {
    id: note._id,
    title: data.title,
    content: data.content || '',
    folderId: note.folderId,
    isFavorite: note.isFavorite,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
};

export const getNotes = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.folderId) filter.folderId = req.query.folderId;
  const notes = await SecureNote.find(filter).sort({ updatedAt: -1 });
  res.json({ success: true, data: notes.map((n) => decryptNote(n, req.vaultKey)) });
});

export const getNote = asyncHandler(async (req, res) => {
  const note = await SecureNote.findOne({ _id: req.params.id, userId: req.user._id });
  if (!note) throw new AppError('Note not found', 404);
  res.json({ success: true, data: decryptNote(note, req.vaultKey) });
});

export const createNote = asyncHandler(async (req, res) => {
  const { title, content, folderId, isFavorite } = req.body;
  const encryptedData = encryptJSON({ title, content: content || '' }, req.vaultKey);
  const note = await SecureNote.create({
    userId: req.user._id,
    encryptedData,
    folderId: folderId || null,
    isFavorite: isFavorite || false,
  });
  await logActivity(req.user._id, 'note_created', `Created note: ${title}`, req);
  res.status(201).json({ success: true, data: decryptNote(note, req.vaultKey) });
});

export const updateNote = asyncHandler(async (req, res) => {
  const note = await SecureNote.findOne({ _id: req.params.id, userId: req.user._id });
  if (!note) throw new AppError('Note not found', 404);
  const existing = decryptJSON(note.encryptedData, req.vaultKey);
  const updated = {
    title: req.body.title ?? existing.title,
    content: req.body.content ?? existing.content,
  };
  if (req.body.folderId !== undefined) note.folderId = req.body.folderId || null;
  if (req.body.isFavorite !== undefined) note.isFavorite = req.body.isFavorite;
  note.encryptedData = encryptJSON(updated, req.vaultKey);
  await note.save();
  await logActivity(req.user._id, 'note_updated', `Updated note: ${updated.title}`, req);
  res.json({ success: true, data: decryptNote(note, req.vaultKey) });
});

export const deleteNote = asyncHandler(async (req, res) => {
  const note = await SecureNote.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!note) throw new AppError('Note not found', 404);
  const data = decryptJSON(note.encryptedData, req.vaultKey);
  await logActivity(req.user._id, 'note_deleted', `Deleted note: ${data.title}`, req);
  res.json({ success: true, message: 'Note deleted' });
});
