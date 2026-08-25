import { Router } from 'express';
import { getSessions, revokeSession, revokeAllSessions } from '../controllers/sessionController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);
router.get('/', getSessions);
router.delete('/:id', revokeSession);
router.delete('/', revokeAllSessions);

export default router;
