import { Router } from 'express';
import { getSecurityDashboard } from '../controllers/securityController.js';
import { protect } from '../middleware/auth.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';

const router = Router();

router.use(protect);
router.get('/dashboard', requireVaultUnlock, getSecurityDashboard);

export default router;
