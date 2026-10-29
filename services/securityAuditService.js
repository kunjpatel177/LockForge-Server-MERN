import Credential from '../models/Credential.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { decryptJSON } from '../utils/crypto.js';
import { isWeakPassword } from '../utils/passwordStrength.js';
import { sendWeeklySecurityDigestEmail } from '../utils/email.js';
import { getVaultKey } from '../middleware/vaultLock.js';

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Conduct a complete security audit for a user's vault items.
 * Updates user.securityAudit and optionally dispatches the weekly digest email if due.
 */
export const auditUserVault = async (userId, vaultKey, sendAlertIfDue = true) => {
  if (!userId || !vaultKey) return null;

  const credentials = await Credential.find({
    userId,
    isDeleted: false,
    isHidden: { $ne: true },
  });

  const passwordMap = {};
  const weakPasswords = [];
  const oldPasswords = [];
  const now = Date.now();

  credentials.forEach((cred) => {
    try {
      const data = decryptJSON(cred.encryptedData, vaultKey);
      const pwd = data?.password;
      if (!pwd) return;

      if (isWeakPassword(pwd)) {
        weakPasswords.push({ id: cred._id, serviceName: cred.serviceName });
      }
      if (now - new Date(cred.updatedAt).getTime() > SIX_MONTHS_MS) {
        oldPasswords.push({ id: cred._id, serviceName: cred.serviceName, updatedAt: cred.updatedAt });
      }
      if (!passwordMap[pwd]) passwordMap[pwd] = [];
      passwordMap[pwd].push({ id: cred._id, serviceName: cred.serviceName });
    } catch {
      // Skip item if decryption fails or malformed
    }
  });

  const reusedPasswords = Object.entries(passwordMap)
    .filter(([, items]) => items.length > 1)
    .map(([, items]) => ({
      credentials: items.map((i) => ({ id: i.id, serviceName: i.serviceName })),
    }));

  const total = credentials.length;
  const deductions = weakPasswords.length * 10 + reusedPasswords.length * 15 + oldPasswords.length * 5;
  const score = Math.max(0, Math.min(100, 100 - deductions));

  const weakServices = [...new Set(weakPasswords.map((w) => w.serviceName))].slice(0, 15);
  const reusedServices = [
    ...new Set(reusedPasswords.flatMap((group) => group.credentials.map((c) => c.serviceName))),
  ].slice(0, 15);

  const user = await User.findById(userId);
  if (user) {
    const previousAlertSentAt = user.securityAudit?.lastAlertSentAt;
    const hasIssues = weakPasswords.length > 0 || reusedPasswords.length > 0;
    const isWeeklyDue =
      !previousAlertSentAt ||
      now - new Date(previousAlertSentAt).getTime() >= SEVEN_DAYS_MS;

    user.securityAudit = {
      weakCount: weakPasswords.length,
      reusedCount: reusedPasswords.length,
      oldCount: oldPasswords.length,
      securityScore: score,
      weakServices,
      reusedServices,
      lastAuditedAt: new Date(now),
      lastAlertSentAt: previousAlertSentAt,
    };

    if (sendAlertIfDue && hasIssues && isWeeklyDue && user.email) {
      try {
        await sendWeeklySecurityDigestEmail({
          email: user.email,
          userName: user.name,
          weakCount: weakPasswords.length,
          reusedCount: reusedPasswords.length,
          securityScore: score,
          weakServices,
          reusedServices,
        });
        user.securityAudit.lastAlertSentAt = new Date(now);
      } catch (err) {
        console.error(`[SecurityAudit] Failed to send weekly alert to ${user.email}:`, err.message);
      }
    }

    await user.save();
  }

  return {
    totalCredentials: total,
    weakPasswords: weakPasswords.map(({ id, serviceName }) => ({ id, serviceName })),
    reusedPasswords,
    oldPasswords: oldPasswords.map(({ id, serviceName, updatedAt }) => ({ id, serviceName, updatedAt })),
    securityScore: score,
    weakCount: weakPasswords.length,
    reusedCount: reusedPasswords.length,
    oldCount: oldPasswords.length,
  };
};

/**
 * Periodically evaluate all registered users and send weekly security digest emails
 * if they have unresolved weak or reused passwords and 7+ days have passed.
 */
export const checkAndDispatchWeeklySecurityAlerts = async () => {
  const now = Date.now();
  const cutoff = new Date(now - SEVEN_DAYS_MS);

  try {
    // 1. First, check active unlocked sessions to refresh audit stats with active keys
    const activeSessions = await Session.find({
      isActive: true,
      vaultUnlockedUntil: { $gt: new Date(now) },
      vaultKeyEncrypted: { $exists: true, $ne: null },
    }).lean();

    const auditedUserIds = new Set();
    for (const session of activeSessions) {
      if (!session.userId) continue;
      const uidStr = String(session.userId);
      if (auditedUserIds.has(uidStr)) continue;

      try {
        const vaultKey = await getVaultKey(session._id);
        if (vaultKey) {
          await auditUserVault(session.userId, vaultKey, true);
          auditedUserIds.add(uidStr);
        }
      } catch (err) {
        console.warn(`[SecurityScheduler] Session audit failed for user ${uidStr}:`, err.message);
      }
    }

    // 2. Next, process all users who have stored weak or reused passwords and are due for alert
    const usersDueForAlert = await User.find({
      $and: [
        {
          $or: [
            { 'securityAudit.weakCount': { $gt: 0 } },
            { 'securityAudit.reusedCount': { $gt: 0 } },
          ],
        },
        {
          $or: [
            { 'securityAudit.lastAlertSentAt': null },
            { 'securityAudit.lastAlertSentAt': { $exists: false } },
            { 'securityAudit.lastAlertSentAt': { $lte: cutoff } },
          ],
        },
      ],
    });

    for (const user of usersDueForAlert) {
      // If user was already audited in step 1 above, their lastAlertSentAt was updated if needed
      const lastSent = user.securityAudit?.lastAlertSentAt;
      if (lastSent && now - new Date(lastSent).getTime() < SEVEN_DAYS_MS) {
        continue;
      }

      const weakCount = user.securityAudit?.weakCount || 0;
      const reusedCount = user.securityAudit?.reusedCount || 0;
      if (weakCount === 0 && reusedCount === 0) continue;

      try {
        await sendWeeklySecurityDigestEmail({
          email: user.email,
          userName: user.name,
          weakCount,
          reusedCount,
          securityScore: user.securityAudit?.securityScore ?? 100,
          weakServices: user.securityAudit?.weakServices || [],
          reusedServices: user.securityAudit?.reusedServices || [],
        });
        user.securityAudit.lastAlertSentAt = new Date(now);
        await user.save();
      } catch (err) {
        console.error(`[SecurityScheduler] Weekly digest dispatch failed for ${user.email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[SecurityScheduler] Error in checkAndDispatchWeeklySecurityAlerts:', err.message);
  }
};
