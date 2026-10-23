import { Router } from 'express';
import {
  unlockHidden,
  lockHidden,
  getHiddenStatus,
  getHiddenItems,
} from '../controllers/hiddenController.js';
import { protect } from '../middleware/auth.js';
import { requireVaultUnlock, requireHiddenUnlock } from '../middleware/vaultLock.js';

const router = Router();

router.use(protect);

router.post('/unlock', unlockHidden);
router.post('/lock', lockHidden);
router.get('/status', getHiddenStatus);
router.get('/', requireVaultUnlock, requireHiddenUnlock, getHiddenItems);

export default router;
