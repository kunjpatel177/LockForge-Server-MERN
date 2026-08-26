import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  register, login, logout, refreshToken, verifyEmail, resendVerification,
  forgotPassword, resetPassword, unlockVaultHandler, lockVault, vaultStatus,
  verifyTwoFactorLogin, resendTwoFactorLogin,
} from '../controllers/authController.js';
import { protect, optionalProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerValidation, loginValidation, forgotPasswordValidation,
  resetPasswordValidation, unlockVaultValidation, verifyTwoFactorLoginValidation,
  resendTwoFactorLoginValidation,
} from '../validators/index.js';

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many attempts, try again later' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many login attempts' } });

router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/login', loginLimiter, loginValidation, validate, login);
router.post('/verify-2fa', loginLimiter, verifyTwoFactorLoginValidation, validate, verifyTwoFactorLogin);
router.post('/resend-2fa', loginLimiter, resendTwoFactorLoginValidation, validate, resendTwoFactorLogin);
router.post('/logout', optionalProtect, logout);
router.post('/refresh', refreshToken);
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', protect, resendVerification);
router.post('/forgot-password', authLimiter, forgotPasswordValidation, validate, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidation, validate, resetPassword);
router.post('/unlock-vault', protect, unlockVaultValidation, validate, unlockVaultHandler);
router.post('/lock-vault', protect, lockVault);
router.get('/vault-status', protect, vaultStatus);

export default router;
