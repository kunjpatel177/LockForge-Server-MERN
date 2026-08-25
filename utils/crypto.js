import crypto from 'crypto';
import argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 310000;

export const hashPassword = async (password) => {
  return argon2.hash(password, { type: argon2.argon2id });
};

export const verifyPassword = async (hash, password) => {
  return argon2.verify(hash, password);
};

export const deriveKey = (masterPassword, salt) => {
  return crypto.pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
};

export const generateSalt = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

export const createMasterVerifier = (masterPassword, salt) => {
  const key = deriveKey(masterPassword, salt);
  return crypto.createHmac('sha256', salt).update(key).digest('hex');
};

export const verifyMasterPassword = (masterPassword, salt, verifier) => {
  const computed = createMasterVerifier(masterPassword, salt);
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(verifier, 'hex'));
};

export const encrypt = (plaintext, key) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

export const decrypt = (encryptedData, key) => {
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
};

export const encryptJSON = (data, key) => {
  return encrypt(JSON.stringify(data), key);
};

export const decryptJSON = (encryptedData, key) => {
  return JSON.parse(decrypt(encryptedData, key));
};

export const generateToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
