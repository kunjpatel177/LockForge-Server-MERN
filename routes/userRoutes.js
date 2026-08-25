import { Router } from 'express';
import {
  getProfile, updateProfile, changePassword, changeMasterPassword, deleteAccount,
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { changePasswordValidation, changeMasterPasswordValidation, profileValidation } from '../validators/index.js';

const router = Router();

router.use(protect);
router.get('/profile', getProfile);
router.put('/profile', profileValidation, validate, updateProfile);
router.put('/change-password', changePasswordValidation, validate, changePassword);
router.put('/change-master-password', changeMasterPasswordValidation, validate, changeMasterPassword);
router.delete('/account', deleteAccount);

export default router;
