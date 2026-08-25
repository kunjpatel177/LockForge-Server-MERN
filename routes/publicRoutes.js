import { Router } from 'express';
import { generatePassword, checkPasswordStrength } from '../controllers/securityController.js';

const router = Router();

router.post('/generate-password', generatePassword);
router.post('/check-strength', checkPasswordStrength);

export default router;
