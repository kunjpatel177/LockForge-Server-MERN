import { Router } from 'express';
import {
  getProfile, updateProfile, changePassword, changeMasterPassword, deleteAccount,
} from '../controllers/userController.js';
import {
  getTwoFactorStatus, setupTwoFactor, enableTwoFactor,
  requestDisableTwoFactor, disableTwoFactor,
  setupAddMethod, confirmAddMethod, requestRemoveMethod, removeMethod,
} from '../controllers/twoFactorController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordValidation, changeMasterPasswordValidation, deleteAccountValidation, profileValidation,
  twoFactorEnableValidation, twoFactorSetupValidation,
  twoFactorDisableRequestValidation, twoFactorDisableValidation,
  twoFactorAddSetupValidation, twoFactorAddMethodValidation, twoFactorRemoveMethodValidation, twoFactorRemoveRequestValidation,
} from '../validators/index.js';

const router = Router();

router.use(protect);
router.get('/profile', getProfile);
router.put('/profile', profileValidation, validate, updateProfile);
router.put('/change-password', changePasswordValidation, validate, changePassword);
router.put('/change-master-password', changeMasterPasswordValidation, validate, changeMasterPassword);
router.delete('/account', deleteAccountValidation, validate, deleteAccount);
router.get('/2fa/status', getTwoFactorStatus);
router.post('/2fa/setup', twoFactorSetupValidation, validate, setupTwoFactor);
router.post('/2fa/enable', twoFactorEnableValidation, validate, enableTwoFactor);
router.post('/2fa/disable/request', twoFactorDisableRequestValidation, validate, requestDisableTwoFactor);
router.post('/2fa/disable', twoFactorDisableValidation, validate, disableTwoFactor);
router.post('/2fa/methods/add/setup', twoFactorAddSetupValidation, validate, setupAddMethod);
router.post('/2fa/methods/add', twoFactorAddMethodValidation, validate, confirmAddMethod);
router.post('/2fa/methods/remove/request', twoFactorRemoveRequestValidation, validate, requestRemoveMethod);
router.post('/2fa/methods/remove', twoFactorRemoveMethodValidation, validate, removeMethod);

export default router;
