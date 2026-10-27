import ActivityLog from '../models/ActivityLog.js';
import { LIMITS } from '../config/limits.js';
import { getClientIp } from './tokenService.js';
import { resolveLocationFromIp } from '../utils/ipLocation.js';

const pruneActivityLogs = async (userId) => {
  const maxLogs = LIMITS.MAX_ACTIVITY_LOGS_PER_USER;
  const total = await ActivityLog.countDocuments({ userId });
  const excess = total - maxLogs;
  if (excess <= 0) return;

  const oldest = await ActivityLog.find({ userId })
    .sort({ createdAt: 1 })
    .limit(excess)
    .select('_id')
    .lean();

  if (!oldest.length) return;

  await ActivityLog.deleteMany({ _id: { $in: oldest.map((entry) => entry._id) } });
};

export const logActivity = async (userId, action, description = '', req = null, metadata = {}) => {
  // Capture client IP immediately from req while request context is alive
  const ipAddress = req ? getClientIp(req) : 'Unknown';

  // Perform location resolution, log creation, and maintenance asynchronously without blocking the API response
  (async () => {
    try {
      const location = await resolveLocationFromIp(ipAddress);

      await ActivityLog.create({
        userId,
        action,
        description,
        ipAddress,
        location,
        metadata,
      });

      // Sampled pruning (every ~10 logs) to avoid expensive countDocuments on every single action
      if (Math.random() < 0.1) {
        await pruneActivityLogs(userId);
      }
    } catch (err) {
      console.error('Failed to log activity:', err.message);
    }
  })().catch(() => {});
};
