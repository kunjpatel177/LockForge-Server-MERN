import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
import User from '../models/User.js';
import Session from '../models/Session.js';

const LAST_ACTIVE_INTERVAL_MS = 5 * 60 * 1000;

const normalizeSessionId = (sessionId) => {
  if (!sessionId) return null;
  if (typeof sessionId === 'object') {
    if (typeof sessionId.toHexString === 'function') return sessionId.toHexString();
    if (sessionId.$oid) return sessionId.$oid;
  }
  return String(sessionId);
};

const extractToken = (req) => {
  let token = req.cookies?.accessToken;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  return token;
};

const validateSession = async (sessionId) => {
  const id = normalizeSessionId(sessionId);
  if (!id) return null;

  const session = await Session.findById(id).select('isActive expiresAt lastActive');
  if (!session || !session.isActive || session.expiresAt < new Date()) {
    return false;
  }

  if (Date.now() - new Date(session.lastActive).getTime() > LAST_ACTIVE_INTERVAL_MS) {
    session.lastActive = new Date();
    await session.save();
  }

  return session._id;
};

export const protect = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next(new AppError('Not authorized, please log in', 401));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -masterVerifier');
    if (!user) return next(new AppError('User not found', 401));

    const sessionId = await validateSession(decoded.sessionId);
    if (sessionId === false) {
      return next(new AppError('Session expired or revoked', 401));
    }

    req.user = user;
    req.sessionId = sessionId || normalizeSessionId(decoded.sessionId);
    next();
  } catch {
    return next(new AppError('Not authorized, token invalid', 401));
  }
};

export const optionalProtect = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -masterVerifier');
    if (user) {
      const sessionId = await validateSession(decoded.sessionId);
      if (sessionId === false) return next();

      req.user = user;
      req.sessionId = sessionId || normalizeSessionId(decoded.sessionId);
    }
  } catch {
    // Token invalid or expired — continue without user
  }
  next();
};

export const requireEmailVerified = (req, res, next) => {
  if (!req.user.emailVerified) {
    return next(new AppError('Please verify your email first', 403));
  }
  next();
};
