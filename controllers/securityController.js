import Credential from '../models/Credential.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { decryptJSON } from '../utils/crypto.js';
import { isWeakPassword, calculatePasswordStrength } from '../utils/passwordStrength.js';

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export const getSecurityDashboard = asyncHandler(async (req, res) => {
  const credentials = await Credential.find({ userId: req.user._id, isDeleted: false });
  const key = req.vaultKey;

  const passwordMap = {};
  const weakPasswords = [];
  const oldPasswords = [];
  const now = Date.now();

  credentials.forEach((cred) => {
    const data = decryptJSON(cred.encryptedData, key);
    const pwd = data.password;
    if (!pwd) return;

    if (isWeakPassword(pwd)) {
      weakPasswords.push({ id: cred._id, serviceName: cred.serviceName });
    }
    if (now - new Date(cred.updatedAt).getTime() > SIX_MONTHS_MS) {
      oldPasswords.push({ id: cred._id, serviceName: cred.serviceName, updatedAt: cred.updatedAt });
    }
    if (!passwordMap[pwd]) passwordMap[pwd] = [];
    passwordMap[pwd].push({ id: cred._id, serviceName: cred.serviceName });
  });

  const reusedPasswords = Object.entries(passwordMap)
    .filter(([, items]) => items.length > 1)
    .map(([, items]) => ({ credentials: items.map((i) => ({ id: i.id, serviceName: i.serviceName })) }));

  const total = credentials.length;
  let deductions = weakPasswords.length * 10 + reusedPasswords.length * 15 + oldPasswords.length * 5;
  const score = Math.max(0, Math.min(100, 100 - deductions));

  res.json({
    success: true,
    data: {
      totalCredentials: total,
      weakPasswords: weakPasswords.map(({ id, serviceName }) => ({ id, serviceName })),
      reusedPasswords,
      oldPasswords: oldPasswords.map(({ id, serviceName, updatedAt }) => ({ id, serviceName, updatedAt })),
      securityScore: score,
      weakCount: weakPasswords.length,
      reusedCount: reusedPasswords.length,
      oldCount: oldPasswords.length,
    },
  });
});

export const checkPasswordStrength = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const strength = calculatePasswordStrength(password);
  res.json({ success: true, data: strength });
});

export const generatePassword = asyncHandler(async (req, res) => {
  const { generatePassword: gen } = await import('../utils/passwordStrength.js');
  const password = gen(req.body);
  const strength = calculatePasswordStrength(password);
  res.json({ success: true, data: { password, strength } });
});
