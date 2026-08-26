import { body } from 'express-validator';
import { LIMITS } from '../config/limits.js';

const strongPassword = (field, label = 'Password') =>
  body(field)
    .isLength({ min: 8 }).withMessage(`${label} must be at least 8 characters`)
    .matches(/[A-Z]/).withMessage(`${label} must contain an uppercase letter`)
    .matches(/[a-z]/).withMessage(`${label} must contain a lowercase letter`)
    .matches(/[0-9]/).withMessage(`${label} must contain a number`)
    .matches(/[^a-zA-Z0-9]/).withMessage(`${label} must contain a special character`);

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ max: LIMITS.MAX_USER_NAME_LENGTH }).withMessage(`Name must be at most ${LIMITS.MAX_USER_NAME_LENGTH} characters`),
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
  body('serviceName').trim().notEmpty().withMessage('Service name is required')
    .isLength({ max: LIMITS.MAX_SERVICE_NAME_LENGTH }).withMessage(`Service name must be at most ${LIMITS.MAX_SERVICE_NAME_LENGTH} characters`),
  body('username').optional().trim().isLength({ max: LIMITS.MAX_CREDENTIAL_FIELD_LENGTH }),
  body('email').optional().trim().isLength({ max: LIMITS.MAX_CREDENTIAL_FIELD_LENGTH }),
  body('password').optional().isLength({ max: LIMITS.MAX_CREDENTIAL_FIELD_LENGTH }),
  body('url').optional().trim().isLength({ max: LIMITS.MAX_CREDENTIAL_FIELD_LENGTH }),
  body('notes').optional().trim().isLength({ max: LIMITS.MAX_CREDENTIAL_NOTES_LENGTH }),
  body('folderId').optional(),
  body('tags').optional().isArray({ max: LIMITS.MAX_TAGS_PER_CREDENTIAL }),
  body('tags.*').optional().trim().isLength({ max: LIMITS.MAX_TAG_LENGTH }),
  body('customFields').optional().isArray({ max: LIMITS.MAX_CUSTOM_FIELDS }),
  body('customFields.*.label').optional().trim().isLength({ max: LIMITS.MAX_CUSTOM_FIELD_LABEL_LENGTH }),
  body('customFields.*.value').optional().isLength({ max: LIMITS.MAX_CUSTOM_FIELD_VALUE_LENGTH }),
];

export const folderValidation = [
  body('name').trim().notEmpty().withMessage('Folder name is required')
    .isLength({ max: LIMITS.MAX_FOLDER_NAME_LENGTH }).withMessage(`Folder name must be at most ${LIMITS.MAX_FOLDER_NAME_LENGTH} characters`),
];

export const assignItemsValidation = [
  body('credentialIds').optional().isArray({ max: LIMITS.MAX_ASSIGN_BATCH_SIZE }),
  body('noteIds').optional().isArray({ max: LIMITS.MAX_ASSIGN_BATCH_SIZE }),
];

export const moveFolderValidation = [
  body('folderId').optional({ nullable: true }),
];

export const noteValidation = [
  body('title').trim().notEmpty().withMessage('Title is required')
    .isLength({ max: LIMITS.MAX_NOTE_TITLE_LENGTH }).withMessage(`Title must be at most ${LIMITS.MAX_NOTE_TITLE_LENGTH} characters`),
  body('content').optional().isLength({ max: LIMITS.MAX_NOTE_CONTENT_LENGTH }),
  body('folderId').optional(),
];

export const profileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: LIMITS.MAX_USER_NAME_LENGTH }),
  body('settings.theme').optional().isIn(['light', 'dark']),
  body('settings.autoLockMinutes').optional().isInt({ min: 1, max: 120 }),
];

export const deleteAccountValidation = [
  body('password').notEmpty().withMessage('Password is required'),
];

export const twoFactorTokenValidation = [
  body('token').trim().notEmpty().withMessage('Authentication code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits')
    .isNumeric().withMessage('Code must be numeric'),
];

const twoFactorMethodsValidation = [
  body('methods')
    .isArray({ min: 1, max: 2 })
    .withMessage('Select at least one verification method'),
  body('methods.*')
    .isIn(['totp', 'email'])
    .withMessage('Each method must be totp or email'),
];

const optionalSixDigitCode = (field) => body(field)
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ min: 6, max: 6 })
  .withMessage('Code must be 6 digits')
  .isNumeric()
  .withMessage('Code must be numeric');

export const twoFactorEnableValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  ...twoFactorMethodsValidation,
  optionalSixDigitCode('totpToken'),
  optionalSixDigitCode('emailToken'),
];

export const twoFactorSetupValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  ...twoFactorMethodsValidation,
];

export const twoFactorDisableRequestValidation = [
  body('password').notEmpty().withMessage('Password is required'),
];

export const twoFactorDisableValidation = [
  ...twoFactorTokenValidation,
  body('password').notEmpty().withMessage('Password is required'),
];

export const twoFactorMethodValidation = [
  body('method').isIn(['totp', 'email']).withMessage('Method must be totp or email'),
];

export const twoFactorAddSetupValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  ...twoFactorMethodValidation,
];

export const twoFactorAddMethodValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  ...twoFactorMethodValidation,
  optionalSixDigitCode('totpToken'),
  optionalSixDigitCode('emailToken'),
];

export const twoFactorRemoveMethodValidation = [
  ...twoFactorTokenValidation,
  body('password').notEmpty().withMessage('Password is required'),
  ...twoFactorMethodValidation,
];

export const twoFactorRemoveRequestValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  ...twoFactorMethodValidation,
];

export const verifyTwoFactorLoginValidation = [
  body('twoFactorToken').notEmpty().withMessage('Verification token is required'),
  ...twoFactorTokenValidation,
];

export const resendTwoFactorLoginValidation = [
  body('twoFactorToken').notEmpty().withMessage('Verification token is required'),
];
