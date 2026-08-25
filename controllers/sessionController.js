import Session from '../models/Session.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { logActivity } from '../services/activityService.js';

export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id, isActive: true })
    .sort({ lastActive: -1 })
    .select('-refreshToken');
  const data = sessions.map((s) => ({
    id: s._id,
    deviceInfo: s.deviceInfo,
    browser: s.browser,
    ipAddress: s.ipAddress,
    lastActive: s.lastActive,
    createdAt: s.createdAt,
    isCurrent: s._id.toString() === req.sessionId?.toString(),
    expiresAt: s.expiresAt,
  }));
  res.json({ success: true, data });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) throw new AppError('Session not found', 404);
  if (session._id.toString() === req.sessionId?.toString()) {
    throw new AppError('Cannot revoke current session. Use logout instead.', 400);
  }
  session.isActive = false;
  await session.save();
  await logActivity(req.user._id, 'session_revoked', `Revoked session: ${session.deviceInfo}`, req);
  res.json({ success: true, message: 'Session revoked' });
});

export const revokeAllSessions = asyncHandler(async (req, res) => {
  await Session.updateMany(
    { userId: req.user._id, _id: { $ne: req.sessionId }, isActive: true },
    { isActive: false }
  );
  await logActivity(req.user._id, 'session_revoked', 'Revoked all other sessions', req);
  res.json({ success: true, message: 'All other sessions revoked' });
});
