import { Router } from 'express';
import { getFolders, getFolder, createFolder, updateFolder, deleteFolder, assignItemsToFolder } from '../controllers/folderController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { folderValidation, assignItemsValidation } from '../validators/index.js';

const router = Router();

router.use(protect);
router.get('/', getFolders);
router.get('/:id', getFolder);
router.post('/', folderValidation, validate, createFolder);
router.put('/:id', folderValidation, validate, updateFolder);
router.post('/:id/assign', assignItemsValidation, validate, assignItemsToFolder);
router.delete('/:id', deleteFolder);

export default router;
