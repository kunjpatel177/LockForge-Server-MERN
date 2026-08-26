import User from '../models/User.js';
import Session from '../models/Session.js';
import jwt from 'jsonwebtoken';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import {
  hashPassword, verifyPassword, generateSalt, createMasterVerifier, hashToken, generateToken,
} from '../utils/crypto.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendTwoFactorOtpEmail } from '../utils/email.js';
import { logActivity } from '../services/activityService.js';
import { createDefaultFolders } from '../services/folderService.js';
import { createSession, refreshAccessToken, setTokenCookies, clearTokenCookies } from '../services/tokenService.js';
import { unlockVault, clearVaultKey, getVaultKey } from '../middleware/vaultLock.js';
import {
  generateEmailOtp,
  maskEmail,
  storeUserOtp,
  clearUserOtp,
  verifyLoginCode,
  getTwoFactorMethods,
  hasTwoFactorMethod,
} from '../utils/twoFactorService.js';

const formatAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  settings: user.settings,
  twoFactorEnabled: !!user.twoFactorEnabled,
  twoFactorMethods: user.twoFactorEnabled ? getTwoFactorMethods(user) : [],
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, masterPassword } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already registered', 409);

  const masterSalt = generateSalt();
  const hashedPassword = await hashPassword(password);
  const masterVerifier = createMasterVerifier(masterPassword, masterSalt);
  const verificationToken = generateToken();
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  let user;
  try {
    user = await User.create({
      name,
      email,
      password: hashedPassword,
      masterSalt,
      masterVerifier,
      verificationToken,
      verificationTokenExpiry,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError('Email already registered', 409);
    }
    throw err;
  }

  await createDefaultFolders(user._id);

  const { accessToken, refreshToken } = await createSession(user._id, req);
  setTokenCookies(res, accessToken, refreshToken);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your email.',
    data: {
      user: formatAuthUser(user),
      accessToken,
      refreshToken,
    },
  });

  void sendVerificationEmail(email, verificationToken).catch((err) => {
    console.error('Failed to send verification email:', err.message);
  });
  void logActivity(user._id, 'login', 'Account created', req);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await verifyPassword(user.password, password))) {
    if (user) await logActivity(user._id, 'failed_login', 'Invalid password', req);
    throw new AppError('Invalid email or password', 401);
  }

  if (user.twoFactorEnabled) {
    const methods = getTwoFactorMethods(user);
    const twoFactorToken = jwt.sign(
      { id: user._id.toString(), purpose: '2fa_login', methods },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    );

    if (hasTwoFactorMethod(user, 'email')) {
      const otp = generateEmailOtp();
      storeUserOtp(user, otp, 'login');
      await user.save();
      await sendTwoFactorOtpEmail(user.email, otp, 'login');
    }

    return res.json({
      success: true,
      data: {
        requiresTwoFactor: true,
        twoFactorToken,
        twoFactorMethods: methods,
        maskedEmail: hasTwoFactorMethod(user, 'email') ? maskEmail(user.email) : undefined,
      },
    });
  }

  const { accessToken, refreshToken } = await createSession(user._id, req);
  setTokenCookies(res, accessToken, refreshToken);
  await logActivity(user._id, 'login', 'User logged in', req);

  res.json({
    success: true,
    data: {
      user: formatAuthUser(user),
      accessToken,
      refreshToken,
    },
  });
});

export const verifyTwoFactorLogin = asyncHandler(async (req, res) => {
  const { twoFactorToken, token } = req.body;
  let decoded;
  try {
    decoded = jwt.verify(twoFactorToken, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Verification expired. Please sign in again.', 401);
  }
  if (decoded.purpose !== '2fa_login') throw new AppError('Invalid verification token', 401);

  const user = await User.findById(decoded.id);
  if (!user || !user.twoFactorEnabled) throw new AppError('Invalid verification', 401);

  if (!verifyLoginCode(user, token)) {
    await logActivity(user._id, 'failed_login', 'Invalid 2FA code', req);
    const methods = getTwoFactorMethods(user);
    throw new AppError(
      methods.includes('email') && methods.includes('totp')
        ? 'Invalid or expired code. Use your email code or authenticator app.'
        : 'Invalid or expired verification code',
      401,
    );
  }

  clearUserOtp(user);
  await user.save();

  const { accessToken, refreshToken } = await createSession(user._id, req);
  setTokenCookies(res, accessToken, refreshToken);
  await logActivity(user._id, 'login', 'User logged in with 2FA', req);

  res.json({
    success: true,
    data: {
      user: formatAuthUser(user),
      accessToken,
      refreshToken,
    },
  });
});

export const resendTwoFactorLogin = asyncHandler(async (req, res) => {
  const { twoFactorToken } = req.body;
  let decoded;
  try {
    decoded = jwt.verify(twoFactorToken, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Verification expired. Please sign in again.', 401);
  }
  if (decoded.purpose !== '2fa_login') throw new AppError('Invalid verification token', 401);

  const user = await User.findById(decoded.id);
  if (!user || !user.twoFactorEnabled) throw new AppError('Invalid verification', 401);
  if (!hasTwoFactorMethod(user, 'email')) {
    throw new AppError('Resend is only available when email verification is enabled', 400);
  }

  const otp = generateEmailOtp();
  storeUserOtp(user, otp, 'login');
  await user.save();
  await sendTwoFactorOtpEmail(user.email, otp, 'login');

  res.json({
    success: true,
    message: 'A new verification code has been sent',
    data: { maskedEmail: maskEmail(user.email) },
  });
});

export const logout = asyncHandler(async (req, res) => {
  if (req.sessionId) {
    await Session.findByIdAndUpdate(req.sessionId, { isActive: false });
  }
  if (req.user) {
    await clearVaultKey(req.sessionId);
    await logActivity(req.user._id, 'logout', 'User logged out', req);
  }
  clearTokenCookies(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (!token) throw new AppError('Refresh token not found', 401);

  try {
    const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(token);
    setTokenCookies(res, accessToken, newRefreshToken);
    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }
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

export const verifyEmailChange = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    emailChangeToken: token,
    emailChangeTokenExpiry: { $gt: new Date() },
    pendingEmail: { $exists: true, $ne: null },
  });
  if (!user) throw new AppError('Invalid or expired email change link', 400);

  const newEmail = user.pendingEmail;
  const duplicate = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
  if (duplicate) {
    user.pendingEmail = undefined;
    user.emailChangeToken = undefined;
    user.emailChangeTokenExpiry = undefined;
    await user.save();
    throw new AppError('Email is no longer available', 409);
  }

  const oldEmail = user.email;
  user.email = newEmail;
  user.emailVerified = true;
  user.pendingEmail = undefined;
  user.emailChangeToken = undefined;
  user.emailChangeTokenExpiry = undefined;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();

  await logActivity(user._id, 'email_changed', `Email changed from ${oldEmail} to ${newEmail}`, req);
  res.json({ success: true, message: 'Email changed successfully', data: { email: newEmail } });
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
  await unlockVault(req.user._id, req.sessionId, masterPassword);
  res.json({ success: true, message: 'Vault unlocked' });
});

export const lockVault = asyncHandler(async (req, res) => {
  await clearVaultKey(req.sessionId);
  res.json({ success: true, message: 'Vault locked' });
});

export const vaultStatus = asyncHandler(async (req, res) => {
  const key = await getVaultKey(req.sessionId);
  res.json({ success: true, data: { unlocked: !!key } });
});
