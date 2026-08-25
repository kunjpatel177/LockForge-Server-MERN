import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
import User from '../models/User.js';

const extractToken = (req) => {
  let token = req.cookies?.accessToken;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  return token;
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
    req.user = user;
    req.sessionId = decoded.sessionId;
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
      req.user = user;
      req.sessionId = decoded.sessionId;
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
