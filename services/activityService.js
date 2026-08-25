import ActivityLog from '../models/ActivityLog.js';

export const logActivity = async (userId, action, description = '', req = null, metadata = {}) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      description,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || 'Unknown',
      metadata,
    });
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
};
