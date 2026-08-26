import User from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { verifyPassword } from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';
import { sendTwoFactorOtpEmail } from '../utils/email.js';
import {
  generateEmailOtp,
  generateTotpSecret,
  buildOtpAuthUrl,
  encryptSecret,
  maskEmail,
  storeUserOtp,
  clearUserOtp,
  clearTotpSecrets,
  verifyUserOtp,
  verifyTotpSetupCode,
  verifyDisableCode,
  verifyRemoveCode,
  normalizeMethods,
  getTwoFactorMethods,
  hasTwoFactorMethod,
  createQrDataUrl,
} from '../utils/twoFactorService.js';

const sendDisableOtp = async (user) => {
  const otp = generateEmailOtp();
  storeUserOtp(user, otp, 'disable');
  await user.save();
  await sendTwoFactorOtpEmail(user.email, otp, 'disable');
  return maskEmail(user.email);
};

const clearTwoFactorData = (user) => {
  clearUserOtp(user);
  clearTotpSecrets(user);
  user.twoFactorEnabled = false;
  user.twoFactorMethods = [];
  user.twoFactorMethod = undefined;
};

export const getTwoFactorStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    'twoFactorEnabled twoFactorMethods twoFactorMethod twoFactorSecret email',
  );
  const methods = user?.twoFactorEnabled ? getTwoFactorMethods(user) : [];
  res.json({
    success: true,
    data: {
      enabled: !!user?.twoFactorEnabled,
      methods,
      maskedEmail: user?.email ? maskEmail(user.email) : null,
    },
  });
});

export const setupTwoFactor = asyncHandler(async (req, res) => {
  const { password, methods } = req.body;
  const selected = normalizeMethods(methods);
  if (!selected.length) throw new AppError('Select at least one verification method', 400);

  const user = await User.findById(req.user._id);
  if (user.twoFactorEnabled) throw new AppError('Two-factor authentication is already enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  const data = { methods: selected };

  if (selected.includes('totp')) {
    const secret = generateTotpSecret();
    user.twoFactorTempSecret = encryptSecret(secret);
    const otpauthUrl = buildOtpAuthUrl(user.email, secret);
    data.secret = secret;
    data.otpauthUrl = otpauthUrl;
    data.qrCodeDataUrl = await createQrDataUrl(otpauthUrl);
  }

  if (selected.includes('email')) {
    const otp = generateEmailOtp();
    storeUserOtp(user, otp, 'setup');
    data.maskedEmail = maskEmail(user.email);
    await sendTwoFactorOtpEmail(user.email, otp, 'setup');
  }

  await user.save();

  res.json({
    success: true,
    message: selected.includes('email') ? 'Verification code sent to your email' : 'Authenticator setup ready',
    data,
  });
});

export const enableTwoFactor = asyncHandler(async (req, res) => {
  const { password, methods, totpToken, emailToken } = req.body;
  const selected = normalizeMethods(methods);
  if (!selected.length) throw new AppError('Select at least one verification method', 400);

  const user = await User.findById(req.user._id);
  if (user.twoFactorEnabled) throw new AppError('Two-factor authentication is already enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  if (selected.includes('totp')) {
    if (!totpToken) throw new AppError('Authenticator code is required', 400);
    if (!user.twoFactorTempSecret) throw new AppError('Start authenticator setup before enabling 2FA', 400);
    if (!verifyTotpSetupCode(user, totpToken)) {
      throw new AppError('Invalid authenticator code', 400);
    }
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
  }

  if (selected.includes('email')) {
    if (!emailToken) throw new AppError('Email verification code is required', 400);
    if (!verifyUserOtp(user, emailToken, 'setup')) {
      throw new AppError('Invalid or expired email verification code', 400);
    }
  }

  if (!selected.includes('totp')) clearTotpSecrets(user);
  clearUserOtp(user);
  user.twoFactorMethods = selected;
  user.twoFactorMethod = undefined;
  user.twoFactorEnabled = true;
  await user.save();

  await logActivity(user._id, 'settings_updated', `Two-factor authentication enabled (${selected.join(', ')})`, req);
  res.json({ success: true, message: 'Two-factor authentication enabled' });
});

export const requestDisableTwoFactor = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) throw new AppError('Two-factor authentication is not enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  const methods = getTwoFactorMethods(user);
  const data = { methods };

  if (hasTwoFactorMethod(user, 'email')) {
    data.maskedEmail = await sendDisableOtp(user);
    return res.json({
      success: true,
      message: 'Verification code sent to your email',
      data,
    });
  }

  res.json({ success: true, data });
});

export const disableTwoFactor = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) throw new AppError('Two-factor authentication is not enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  if (!verifyDisableCode(user, token)) {
    const methods = getTwoFactorMethods(user);
    throw new AppError(
      methods.includes('email') && methods.includes('totp')
        ? 'Invalid or expired code. Use your email code or authenticator app.'
        : methods.includes('email')
          ? 'Invalid or expired verification code'
          : 'Invalid authentication code',
      400,
    );
  }

  clearTwoFactorData(user);
  await user.save();

  await logActivity(user._id, 'settings_updated', 'Two-factor authentication disabled', req);
  res.json({ success: true, message: 'Two-factor authentication disabled' });
});

const METHOD_LABEL = (m) => (m === 'totp' ? 'Authenticator app' : 'Email OTP');

const sendRemoveOtp = async (user) => {
  const otp = generateEmailOtp();
  storeUserOtp(user, otp, 'remove');
  await user.save();
  await sendTwoFactorOtpEmail(user.email, otp, 'disable');
  return maskEmail(user.email);
};

export const setupAddMethod = asyncHandler(async (req, res) => {
  const { password, method } = req.body;
  if (!['totp', 'email'].includes(method)) throw new AppError('Invalid method', 400);

  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) throw new AppError('Enable two-factor authentication first', 400);
  if (hasTwoFactorMethod(user, method)) throw new AppError('This method is already enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  const data = { method };

  if (method === 'totp') {
    const secret = generateTotpSecret();
    user.twoFactorTempSecret = encryptSecret(secret);
    const otpauthUrl = buildOtpAuthUrl(user.email, secret);
    data.secret = secret;
    data.otpauthUrl = otpauthUrl;
    data.qrCodeDataUrl = await createQrDataUrl(otpauthUrl);
  } else {
    const otp = generateEmailOtp();
    storeUserOtp(user, otp, 'setup');
    data.maskedEmail = maskEmail(user.email);
    await sendTwoFactorOtpEmail(user.email, otp, 'setup');
  }

  await user.save();
  res.json({ success: true, data });
});

export const confirmAddMethod = asyncHandler(async (req, res) => {
  const { password, method, totpToken, emailToken } = req.body;
  if (!['totp', 'email'].includes(method)) throw new AppError('Invalid method', 400);

  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) throw new AppError('Two-factor authentication is not enabled', 400);
  if (hasTwoFactorMethod(user, method)) throw new AppError('This method is already enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  if (method === 'totp') {
    if (!totpToken) throw new AppError('Authenticator code is required', 400);
    if (!user.twoFactorTempSecret) throw new AppError('Start authenticator setup first', 400);
    if (!verifyTotpSetupCode(user, totpToken)) throw new AppError('Invalid authenticator code', 400);
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
  } else {
    if (!emailToken) throw new AppError('Email verification code is required', 400);
    if (!verifyUserOtp(user, emailToken, 'setup')) {
      throw new AppError('Invalid or expired email verification code', 400);
    }
  }

  clearUserOtp(user);
  const methods = normalizeMethods([...getTwoFactorMethods(user), method]);
  user.twoFactorMethods = methods;
  user.twoFactorMethod = undefined;
  await user.save();

  await logActivity(user._id, 'settings_updated', `Added 2FA method: ${method}`, req);
  res.json({ success: true, message: `${METHOD_LABEL(method)} added`, data: { methods } });
});

export const requestRemoveMethod = asyncHandler(async (req, res) => {
  const { password, method } = req.body;
  if (!['totp', 'email'].includes(method)) throw new AppError('Invalid method', 400);

  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) throw new AppError('Two-factor authentication is not enabled', 400);
  if (!hasTwoFactorMethod(user, method)) throw new AppError('This method is not enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  const data = { method, methods: getTwoFactorMethods(user) };
  if (hasTwoFactorMethod(user, 'email')) {
    data.maskedEmail = await sendRemoveOtp(user);
    data.message = 'Verification code sent to your email';
  }

  res.json({ success: true, ...(data.message ? { message: data.message } : {}), data });
});

export const removeMethod = asyncHandler(async (req, res) => {
  const { password, method, token } = req.body;
  if (!['totp', 'email'].includes(method)) throw new AppError('Invalid method', 400);

  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) throw new AppError('Two-factor authentication is not enabled', 400);
  if (!hasTwoFactorMethod(user, method)) throw new AppError('This method is not enabled', 400);
  if (!(await verifyPassword(user.password, password))) {
    throw new AppError('Password is incorrect', 400);
  }

  if (!verifyRemoveCode(user, token)) {
    throw new AppError('Invalid or expired verification code', 400);
  }

  clearUserOtp(user);
  const remaining = getTwoFactorMethods(user).filter((m) => m !== method);
  if (method === 'totp') {
    user.twoFactorSecret = undefined;
    user.twoFactorTempSecret = undefined;
  }

  if (!remaining.length) {
    clearTwoFactorData(user);
    await user.save();
    await logActivity(user._id, 'settings_updated', 'Two-factor authentication disabled', req);
    return res.json({ success: true, message: 'Two-factor authentication disabled', data: { enabled: false, methods: [] } });
  }

  user.twoFactorMethods = remaining;
  user.twoFactorMethod = undefined;
  await user.save();

  await logActivity(user._id, 'settings_updated', `Removed 2FA method: ${method}`, req);
  res.json({
    success: true,
    message: `${METHOD_LABEL(method)} removed`,
    data: { enabled: true, methods: remaining },
  });
});
