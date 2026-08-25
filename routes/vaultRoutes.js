import { Router } from 'express';
import {
  getCredentials, getCredential, createCredential, updateCredential,
  deleteCredential, restoreCredential, permanentDeleteCredential,
  emptyTrash, toggleFavorite,
} from '../controllers/vaultController.js';
import { protect } from '../middleware/auth.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';
import { validate } from '../middleware/validate.js';
import { credentialValidation } from '../validators/index.js';

const router = Router();

router.use(protect, requireVaultUnlock);

router.get('/trash', (req, res, next) => {
  req.query.trash = 'true';
  next();
}, getCredentials);

router.delete('/trash/empty', emptyTrash);
router.get('/', getCredentials);
router.post('/', credentialValidation, validate, createCredential);
router.get('/:id', getCredential);
router.put('/:id', credentialValidation, validate, updateCredential);
router.delete('/:id', deleteCredential);
router.post('/:id/restore', restoreCredential);
router.delete('/:id/permanent', permanentDeleteCredential);
router.patch('/:id/favorite', toggleFavorite);

export default router;
