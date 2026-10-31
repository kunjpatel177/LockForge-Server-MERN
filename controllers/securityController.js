import { asyncHandler } from '../middleware/errorHandler.js';
import { calculatePasswordStrength } from '../utils/passwordStrength.js';
import { auditUserVault } from '../services/securityAuditService.js';

export const getSecurityDashboard = asyncHandler(async (req, res) => {
  const dashboardData = await auditUserVault(req.user._id, req.vaultKey, true);
  res.json({
    success: true,
    data: dashboardData,
  });
});

export const checkPasswordStrength = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const strength = calculatePasswordStrength(password);
  res.json({ success: true, data: strength });
});

export const generatePassword = asyncHandler(async (req, res) => {
  // const { generatePasswordWithOptions } = await import('../utils/passwordStrength.js');
  const { generatePassword } = await import('../utils/passwordStrength.js');
  const password = generatePassword(req.body);
  const strength = calculatePasswordStrength(password);
  res.json({ success: true, data: { password, strength } });
});
