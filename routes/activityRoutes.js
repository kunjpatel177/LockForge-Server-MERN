import { Router } from 'express';
import { getActivityLogs, getRecentActivity } from '../controllers/activityController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);
router.get('/', getActivityLogs);
router.get('/recent', getRecentActivity);

export default router;
