import User from '../models/User.js';
import Session from '../models/Session.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import {
  hashPassword, verifyPassword, generateSalt, createMasterVerifier, hashToken, generateToken,
} from '../utils/crypto.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';
import { logActivity } from '../services/activityService.js';
import { createDefaultFolders } from '../services/folderService.js';
import { createSession, generateTokens, setTokenCookies, clearTokenCookies } from '../services/tokenService.js';
import { unlockVault, clearVaultKey } from '../middleware/vaultLock.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, masterPassword } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already registered', 409);

  const masterSalt = generateSalt();
  const hashedPassword = await hashPassword(password);
  const masterVerifier = createMasterVerifier(masterPassword, masterSalt);
  const verificationToken = generateToken();
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    masterSalt,
    masterVerifier,
    verificationToken,
    verificationTokenExpiry,
  });

  await createDefaultFolders(user._id);
  await sendVerificationEmail(email, verificationToken);
  await logActivity(user._id, 'login', 'Account created', req);

  const { session, refreshToken, sessionId } = await createSession(user._id, req);
  const { accessToken } = generateTokens(user._id, sessionId);
  setTokenCookies(res, accessToken, refreshToken);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your email.',
    data: {
      user: { id: user._id, name: user.name, email: user.email, emailVerified: user.emailVerified, settings: user.settings },
      accessToken,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await verifyPassword(user.password, password))) {
    if (user) await logActivity(user._id, 'failed_login', 'Invalid password', req);
    throw new AppError('Invalid email or password', 401);
  }

  const { session, refreshToken, sessionId } = await createSession(user._id, req);
  const { accessToken } = generateTokens(user._id, sessionId);
  setTokenCookies(res, accessToken, refreshToken);
  await logActivity(user._id, 'login', 'User logged in', req);

  res.json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, emailVerified: user.emailVerified, settings: user.settings },
      accessToken,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  if (req.sessionId) {
    await Session.findByIdAndUpdate(req.sessionId, { isActive: false });
  }
  if (req.user) {
    clearVaultKey(req.user._id);
    await logActivity(req.user._id, 'logout', 'User logged out', req);
  }
  clearTokenCookies(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new AppError('Refresh token not found', 401);
  const jwt = await import('jsonwebtoken');
  const decoded = jwt.default.verify(token, process.env.JWT_REFRESH_SECRET);
  const session = await Session.findOne({ refreshToken: token, isActive: true });
  if (!session || session.expiresAt < new Date()) throw new AppError('Invalid session', 401);
  session.lastActive = new Date();
  await session.save();
  const accessToken = jwt.default.sign({ id: decoded.id, sessionId: session._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  setTokenCookies(res, accessToken, token);
  res.json({ success: true, data: { accessToken } });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpiry: { $gt: new Date() },
  });
  if (!user) throw new AppError('Invalid or expired verification token', 400);
  user.emailVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();
  res.json({ success: true, message: 'Email verified successfully' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.emailVerified) throw new AppError('Email already verified', 400);
  const verificationToken = generateToken();
  user.verificationToken = verificationToken;
  user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  await sendVerificationEmail(user.email, verificationToken);
  res.json({ success: true, message: 'Verification email sent' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    const resetToken = generateToken();
    user.resetPasswordToken = hashToken(resetToken);
    user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(email, resetToken);
  }
  res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const hashed = hashToken(token);
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpiry: { $gt: new Date() },
  });
  if (!user) throw new AppError('Invalid or expired reset token', 400);
  user.password = await hashPassword(password);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpiry = undefined;
  await user.save();
  await Session.updateMany({ userId: user._id }, { isActive: false });
  await logActivity(user._id, 'password_changed', 'Password reset via email', req);
  res.json({ success: true, message: 'Password reset successful' });
});

export const unlockVaultHandler = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  await unlockVault(req.user._id, masterPassword);
  res.json({ success: true, message: 'Vault unlocked' });
});

export const lockVault = asyncHandler(async (req, res) => {
  clearVaultKey(req.user._id);
  res.json({ success: true, message: 'Vault locked' });
});

export const vaultStatus = asyncHandler(async (req, res) => {
  const { getVaultKey } = await import('../middleware/vaultLock.js');
  res.json({ success: true, data: { unlocked: !!getVaultKey(req.user._id) } });
});
