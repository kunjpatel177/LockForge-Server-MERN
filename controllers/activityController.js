import ActivityLog from '../models/ActivityLog.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const getActivityLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [logs, total] = await Promise.all([
    ActivityLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10)),
    ActivityLog.countDocuments({ userId: req.user._id }),
  ]);
  res.json({
    success: true,
    data: logs,
    pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
  });
});

export const getRecentActivity = asyncHandler(async (req, res) => {
  const logs = await ActivityLog.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(10);
  res.json({ success: true, data: logs });
});
