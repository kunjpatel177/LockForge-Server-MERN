import PDFDocument from 'pdfkit';
import Credential from '../models/Credential.js';
import Folder from '../models/Folder.js';
import SecureNote from '../models/SecureNote.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { encryptJSON, decryptJSON, verifyMasterPassword } from '../utils/crypto.js';
import User from '../models/User.js';
import { deriveKey } from '../utils/crypto.js';
import { logActivity } from '../services/activityService.js';

export const exportBackup = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);

  const [credentials, folders, notes] = await Promise.all([
    Credential.find({ userId: req.user._id }),
    Folder.find({ userId: req.user._id }),
    SecureNote.find({ userId: req.user._id }),
  ]);

  const backupData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    credentials: credentials.map((c) => ({
      serviceName: c.serviceName,
      data: decryptJSON(c.encryptedData, key),
      folderId: c.folderId,
      isFavorite: c.isFavorite,
      tags: c.tags,
      isDeleted: c.isDeleted,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    folders: folders.map((f) => ({ name: f.name, isDefault: f.isDefault })),
    notes: notes.map((n) => ({
      data: decryptJSON(n.encryptedData, key),
      folderId: n.folderId,
      isFavorite: n.isFavorite,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
  };

  const backupKey = deriveKey(masterPassword + '_backup', user.masterSalt);
  const encrypted = encryptJSON(backupData, backupKey);

  await logActivity(req.user._id, 'backup', 'Encrypted vault backup exported', req);
  res.json({
    success: true,
    data: {
      backup: encrypted,
      exportedAt: backupData.exportedAt,
    },
  });
});

export const importBackup = asyncHandler(async (req, res) => {
  const { masterPassword, backup, replace = false } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);
  const backupKey = deriveKey(masterPassword + '_backup', user.masterSalt);

  let backupData;
  try {
    backupData = decryptJSON(backup, backupKey);
  } catch {
    throw new AppError('Invalid backup file or master password', 400);
  }

  if (replace) {
    await Promise.all([
      Credential.deleteMany({ userId: req.user._id }),
      SecureNote.deleteMany({ userId: req.user._id }),
    ]);
  }

  const folderMap = {};
  const existingFolders = await Folder.find({ userId: req.user._id });
  existingFolders.forEach((f) => { folderMap[f.name] = f._id; });

  for (const f of backupData.folders || []) {
    if (!folderMap[f.name]) {
      const folder = await Folder.create({ userId: req.user._id, name: f.name, isDefault: f.isDefault });
      folderMap[f.name] = folder._id;
    }
  }

  for (const c of backupData.credentials || []) {
    await Credential.create({
      userId: req.user._id,
      serviceName: c.serviceName,
      encryptedData: encryptJSON(c.data, key),
      folderId: c.folderId,
      isFavorite: c.isFavorite,
      tags: c.tags || [],
      isDeleted: c.isDeleted || false,
    });
  }

  for (const n of backupData.notes || []) {
    await SecureNote.create({
      userId: req.user._id,
      encryptedData: encryptJSON(n.data, key),
      folderId: n.folderId,
      isFavorite: n.isFavorite,
    });
  }

  await logActivity(req.user._id, 'restore', 'Vault restored from backup', req);
  res.json({ success: true, message: 'Backup restored successfully' });
});

export const exportPDF = asyncHandler(async (req, res) => {
  const { masterPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!verifyMasterPassword(masterPassword, user.masterSalt, user.masterVerifier)) {
    throw new AppError('Invalid master password', 401);
  }
  const key = deriveKey(masterPassword, user.masterSalt);

  const credentials = await Credential.find({ userId: req.user._id, isDeleted: false });
  const folders = await Folder.find({ userId: req.user._id });
  const folderMap = Object.fromEntries(folders.map((f) => [f._id.toString(), f.name]));

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=lockforge-export.pdf');
  doc.pipe(res);

  doc.fontSize(20).text('LockForge Vault Export', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).fillColor('red').text('WARNING: This document contains decrypted credentials. Store securely and delete after use.', { align: 'center' });
  doc.moveDown();
  doc.fillColor('black').fontSize(10).text(`Exported: ${new Date().toLocaleString()}`);
  doc.text(`User: ${user.email}`);
  doc.moveDown();

  credentials.forEach((cred, i) => {
    const data = decryptJSON(cred.encryptedData, key);
    if (i > 0) doc.moveDown();
    doc.fontSize(14).text(cred.serviceName, { underline: true });
    doc.fontSize(10);
    if (data.username) doc.text(`Username: ${data.username}`);
    if (data.email) doc.text(`Email: ${data.email}`);
    if (data.password) doc.text(`Password: ${data.password}`);
    if (data.url) doc.text(`URL: ${data.url}`);
    if (cred.folderId) doc.text(`Folder: ${folderMap[cred.folderId.toString()] || 'Unknown'}`);
    if (data.notes) doc.text(`Notes: ${data.notes}`);
    if (data.customFields?.length) {
      data.customFields.forEach((cf) => doc.text(`${cf.label}: ${cf.value}`));
    }
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  });

  await logActivity(req.user._id, 'export', 'PDF export generated', req);
  doc.end();
});
