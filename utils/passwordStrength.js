import crypto from 'crypto';

const COMMON_PASSWORDS = new Set(['password', '123456', '12345678', 'qwerty', 'abc123', 'password1', 'admin']);

export const calculatePasswordStrength = (password) => {
  if (!password) return { score: 0, label: 'None' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = Math.min(score, 1);

  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const label = labels[Math.min(score, labels.length - 1)];
  return { score: Math.min(score, 5), label };
};

export const isWeakPassword = (password) => {
  const { score } = calculatePasswordStrength(password);
  return score <= 2;
};

export const generatePassword = (options = {}) => {
  const {
    length = 16,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
    excludeAmbiguous = false,
  } = options;

  let chars = '';
  if (lowercase) chars += excludeAmbiguous ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
  if (uppercase) chars += excludeAmbiguous ? 'ABCDEFGHJKMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (numbers) chars += excludeAmbiguous ? '23456789' : '0123456789';
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let password = '';
  for (let i = 0; i < length; i++) {
    const rand = crypto.randomInt(0, chars.length);
    password += chars[rand];
  }
  return password;
};
