import { body } from 'express-validator';

const strongPassword = (field, label = 'Password') =>
  body(field)
    .isLength({ min: 8 }).withMessage(`${label} must be at least 8 characters`)
    .matches(/[A-Z]/).withMessage(`${label} must contain an uppercase letter`)
    .matches(/[a-z]/).withMessage(`${label} must contain a lowercase letter`)
    .matches(/[0-9]/).withMessage(`${label} must contain a number`)
    .matches(/[^a-zA-Z0-9]/).withMessage(`${label} must contain a special character`);

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  strongPassword('password'),
  strongPassword('masterPassword', 'Master password'),
];

export const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token is required'),
  strongPassword('password'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  strongPassword('newPassword', 'New password'),
];

export const changeMasterPasswordValidation = [
  body('currentMasterPassword').notEmpty().withMessage('Current master password is required'),
  strongPassword('newMasterPassword', 'New master password'),
];

export const unlockVaultValidation = [
  body('masterPassword').notEmpty().withMessage('Master password is required'),
];

export const credentialValidation = [
  body('serviceName').trim().notEmpty().withMessage('Service name is required'),
  body('username').optional().trim(),
  body('email').optional().trim(),
  body('password').optional(),
  body('url').optional().trim(),
  body('notes').optional().trim(),
  body('folderId').optional(),
  body('tags').optional().isArray(),
  body('customFields').optional().isArray(),
];

export const folderValidation = [
  body('name').trim().notEmpty().withMessage('Folder name is required'),
];

export const noteValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').optional(),
  body('folderId').optional(),
];

export const profileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('settings.theme').optional().isIn(['light', 'dark']),
  body('settings.autoLockMinutes').optional().isInt({ min: 1, max: 120 }),
];
