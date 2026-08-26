import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { hashToken, encrypt, decrypt } from './crypto.js';

authenticator.options = { window: 1 };

const OTP_EXPIRY_MINUTES = 10;
const ALLOWED_METHODS = ['totp', 'email'];

export const maskEmail = (email) => {
  const [localPart, domain] = email.toLowerCase().split('@');
  if (!localPart || !domain) return '***@***';
  if (localPart.length <= 1) return `*@${domain}`;
  const visible = localPart.slice(0, 1);
  const stars = '*'.repeat(Math.max(2, Math.min(localPart.length - 1, 4)));
  return `${visible}${stars}@${domain}`;
};

export const normalizeMethods = (methods) => {
  if (!Array.isArray(methods)) return [];
  return [...new Set(methods.filter((m) => ALLOWED_METHODS.includes(m)))].sort();
};

export const getTwoFactorMethods = (user) => {
  if (user.twoFactorMethods?.length) return normalizeMethods(user.twoFactorMethods);
  if (user.twoFactorMethod) return [user.twoFactorMethod];
  if (user.twoFactorSecret) return ['totp'];
  if (user.twoFactorEnabled) return ['email'];
  return [];
};

export const hasTwoFactorMethod = (user, method) => getTwoFactorMethods(user).includes(method);

export const generateEmailOtp = () => String(crypto.randomInt(100000, 1000000));

export const hashOtp = (otp) => hashToken(String(otp));

export const verifyOtp = (otp, hash) => {
  if (!otp || !hash) return false;
  const hashed = hashOtp(otp);
  try {
    return crypto.timingSafeEqual(Buffer.from(hashed, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
};

export const getOtpExpiry = () => new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

export const storeUserOtp = (user, otp, purpose) => {
  user.twoFactorOtpHash = hashOtp(otp);
  user.twoFactorOtpExpiry = getOtpExpiry();
  user.twoFactorOtpPurpose = purpose;
};

export const clearUserOtp = (user) => {
  user.twoFactorOtpHash = undefined;
  user.twoFactorOtpExpiry = undefined;
  user.twoFactorOtpPurpose = undefined;
};

export const verifyUserOtp = (user, otp, purpose) => {
  if (!user.twoFactorOtpHash || !user.twoFactorOtpExpiry) return false;
  if (user.twoFactorOtpPurpose !== purpose) return false;
  if (user.twoFactorOtpExpiry < new Date()) return false;
  return verifyOtp(otp, user.twoFactorOtpHash);
};

export const generateTotpSecret = () => authenticator.generateSecret();

export const buildOtpAuthUrl = (email, secret) => authenticator.keyuri(email, 'LockForge', secret);

export const verifyTotpToken = (token, secret) => authenticator.verify({ token: String(token), secret });

export const encryptSecret = (secret) => encrypt(secret, getStorageKey());

export const decryptSecret = (encrypted) => {
  if (!encrypted) return null;
  try {
    return decrypt(encrypted, getStorageKey());
  } catch {
    return null;
  }
};

function getStorageKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return crypto.pbkdf2Sync(secret, 'lockforge-2fa-storage', 100000, 32, 'sha512');
}

export const createQrDataUrl = async (otpauthUrl) => QRCode.toDataURL(otpauthUrl);

export const clearTotpSecrets = (user) => {
  user.twoFactorSecret = undefined;
  user.twoFactorTempSecret = undefined;
};

export const verifyTotpSetupCode = (user, token) => {
  const secret = decryptSecret(user.twoFactorTempSecret);
  return !!secret && verifyTotpToken(token, secret);
};

export const verifyLoginCode = (user, token) => {
  const methods = getTwoFactorMethods(user);
  if (methods.includes('email') && verifyUserOtp(user, token, 'login')) return true;
  if (methods.includes('totp')) {
    const secret = decryptSecret(user.twoFactorSecret);
    if (secret && verifyTotpToken(token, secret)) return true;
  }
  return false;
};

export const verifyDisableCode = (user, token) => {
  const methods = getTwoFactorMethods(user);
  if (methods.includes('email') && verifyUserOtp(user, token, 'disable')) return true;
  if (methods.includes('totp')) {
    const secret = decryptSecret(user.twoFactorSecret);
    if (secret && verifyTotpToken(token, secret)) return true;
  }
  return false;
};

export const verifyRemoveCode = (user, token) => {
  const methods = getTwoFactorMethods(user);
  if (methods.includes('email') && verifyUserOtp(user, token, 'remove')) return true;
  if (methods.includes('totp')) {
    const secret = decryptSecret(user.twoFactorSecret);
    if (secret && verifyTotpToken(token, secret)) return true;
  }
  if (methods.includes('email') && verifyUserOtp(user, token, 'disable')) return true;
  return false;
};
