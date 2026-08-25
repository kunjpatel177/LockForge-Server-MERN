import { Router } from 'express';
import { getNotes, getNote, createNote, updateNote, deleteNote } from '../controllers/noteController.js';
import { protect } from '../middleware/auth.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';
import { validate } from '../middleware/validate.js';
import { noteValidation } from '../validators/index.js';

const router = Router();

router.use(protect, requireVaultUnlock);
router.get('/', getNotes);
router.get('/:id', getNote);
router.post('/', noteValidation, validate, createNote);
router.put('/:id', noteValidation, validate, updateNote);
router.delete('/:id', deleteNote);

export default router;
