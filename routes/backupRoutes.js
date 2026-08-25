import { Router } from 'express';
import { exportBackup, importBackup, exportPDF } from '../controllers/backupController.js';
import { protect } from '../middleware/auth.js';
import { requireVaultUnlock } from '../middleware/vaultLock.js';

const router = Router();

router.use(protect);
router.post('/export', requireVaultUnlock, exportBackup);
router.post('/import', requireVaultUnlock, importBackup);
router.post('/export-pdf', requireVaultUnlock, exportPDF);

export default router;
