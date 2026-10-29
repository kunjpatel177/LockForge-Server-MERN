import { Router } from 'express';
import {
  getFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  deleteAllFolders,
  restoreFolder,
  permanentDeleteFolder,
  assignItemsToFolder,
  toggleHideFolder,
} from '../controllers/folderController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { folderValidation, assignItemsValidation } from '../validators/index.js';

const router = Router();

router.use(protect);

router.get('/trash', (req, res, next) => {
  req.query.trash = 'true';
  next();
}, getFolders);

router.get('/', getFolders);
router.get('/:id', getFolder);
router.post('/', folderValidation, validate, createFolder);
router.put('/:id', folderValidation, validate, updateFolder);
router.patch('/:id/hide', toggleHideFolder);
router.post('/:id/assign', assignItemsValidation, validate, assignItemsToFolder);
router.delete('/all', deleteAllFolders);
router.delete('/:id', deleteFolder);
router.post('/:id/restore', restoreFolder);
router.delete('/:id/permanent', permanentDeleteFolder);

export default router;
