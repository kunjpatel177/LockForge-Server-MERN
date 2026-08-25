import jwt from 'jsonwebtoken';
import Session from '../models/Session.js';
import { generateToken } from '../utils/crypto.js';

const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY_DAYS = 7;

export const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
    return ip?.trim() || 'Unknown';
  }
  return req.ip || 'Unknown';
};

export const generateTokens = (userId, sessionId) => {
  const sid = String(sessionId);
  const uid = String(userId);
  const accessToken = jwt.sign({ id: uid, sessionId: sid }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
  const refreshToken = jwt.sign({ id: uid, sessionId: sid }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_EXPIRY_DAYS}d` });
  return { accessToken, refreshToken };
};

export const createSession = async (userId, req) => {
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const session = await Session.create({
    userId,
    refreshToken: generateToken(32),
    deviceInfo: parseDevice(userAgent),
    browser: parseBrowser(userAgent),
    ipAddress: getClientIp(req),
    expiresAt,
  });

  const { accessToken, refreshToken } = generateTokens(userId, session._id);
  session.refreshToken = refreshToken;
  await session.save();

  return { session, accessToken, refreshToken };
};

export const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new Error('Invalid refresh token');
  }

  const session = await Session.findOne({
    _id: String(decoded.sessionId),
    refreshToken,
    isActive: true,
    userId: decoded.id,
  });

  if (!session || session.expiresAt < new Date()) {
    throw new Error('Invalid session');
  }

  session.lastActive = new Date();
  const tokens = generateTokens(decoded.id, session._id);
  session.refreshToken = tokens.refreshToken;
  await session.save();

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    userId: decoded.id,
    sessionId: session._id,
  };
};

const parseBrowser = (ua) => {
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Unknown Browser';
};

const parseDevice = (ua) => {
  if (ua.includes('Mobile')) return 'Mobile';
  if (ua.includes('Tablet')) return 'Tablet';
  return 'Desktop';
};

export const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
  };
  res.cookie('accessToken', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

export const clearTokenCookies = (res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'strict' : 'lax' };
  res.clearCookie('accessToken', opts);
  res.clearCookie('refreshToken', opts);
};
