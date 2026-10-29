import { Router } from 'express';
import {
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  restoreNote,
  permanentDeleteNote,
  moveNoteToFolder,
  toggleHideNote,
} from '../controllers/noteController.js';
import { protect } from '../middleware/auth.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';
import { validate } from '../middleware/validate.js';
import { noteValidation, moveFolderValidation } from '../validators/index.js';

const router = Router();

router.use(protect, requireVaultUnlock);

router.get('/trash', (req, res, next) => {
  req.query.trash = 'true';
  next();
}, getNotes);

router.get('/', getNotes);
router.get('/:id', getNote);
router.post('/', noteValidation, validate, createNote);
router.put('/:id', noteValidation, validate, updateNote);
router.patch('/:id/hide', toggleHideNote);
router.patch('/:id/folder', moveFolderValidation, validate, moveNoteToFolder);
router.delete('/:id', deleteNote);
router.post('/:id/restore', restoreNote);
router.delete('/:id/permanent', permanentDeleteNote);

export default router;
