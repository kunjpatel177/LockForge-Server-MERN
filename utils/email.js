import nodemailer from 'nodemailer';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  return transporter;
};

export const sendEmail = async ({ to, subject, html }) => {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[Email stub] To: ${to} | Subject: ${subject}`);
    return { stub: true };
  }
  await transport.sendMail({
    from: `"LockForge Security" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

export const formatDateTime = (date = new Date()) => {
  const d = new Date(date);
  const targetDate = Number.isNaN(d.getTime()) ? new Date() : d;

  const formatted = targetDate.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return `${formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())} IST`;
};


const renderEmailWrapper = ({
  badge = 'Security Notification',
  title,
  subtitle = '',
  bodyHtml,
  previewText = '',
}) => {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: separate;
    }
    a {
      color: #4f46e5;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .container {
        width: 100% !important;
        padding: 12px !important;
      }
      .content-card {
        padding: 24px 18px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:24px 0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText || title}
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" class="container" width="560" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <!-- Brand Header -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);color:#ffffff;font-size:18px;font-weight:700;padding:10px 22px;border-radius:12px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(79,70,229,0.25);">
                      🛡️ LockForge
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td class="content-card" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:36px 32px;box-shadow:0 6px 18px rgba(15,23,42,0.04);">
              
              <!-- Badge -->
              <div style="margin-bottom:18px;">
                <span style="display:inline-block;background-color:#eef2ff;color:#4338ca;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 12px;border-radius:999px;border:1px solid #c7d2fe;">
                  ${badge}
                </span>
              </div>

              <!-- Title -->
              <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${title}
              </h1>
              ${subtitle ? `<p style="margin:0 0 24px 0;font-size:14px;color:#64748b;line-height:1.5;">${subtitle}</p>` : '<div style="height:16px;"></div>'}

              <!-- Body Content -->
              <div style="font-size:15px;line-height:1.6;color:#334155;">
                ${bodyHtml}
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 20px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;line-height:1.5;">
                This automated security notification was sent to protect your LockForge account. Replies to this email address are not monitored.
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${year} LockForge Password Manager · End-to-End Zero-Knowledge Encryption
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const sendLoginNotificationEmail = async ({
  email,
  userName,
  time,
  location,
  ipAddress,
  device,
  browser,
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const resetUrl = `${clientUrl}/forgot-password`;
  const timeFormatted = formatDateTime(time);
  const locationText = location || 'Unknown location';
  const ipText = ipAddress || 'Unknown IP';
  const deviceText = [browser, device].filter(Boolean).join(' on ') || 'Unknown device';
  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  const bodyHtml = `
    <p style="margin:0 0 18px 0;">
      ${nameGreeting}
    </p>
    <p style="margin:0 0 20px 0;">
      A successful sign-in to your <strong>LockForge</strong> account was recently detected. Please review the activity details below to ensure this was you:
    </p>

    <!-- Details Box -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#64748b;width:120px;font-weight:600;">Time (IST)</td>
          <td style="padding:6px 0;color:#0f172a;font-weight:600;">${timeFormatted}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-weight:600;">Location</td>
          <td style="padding:6px 0;color:#0f172a;font-weight:600;">📍 ${locationText}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-weight:600;">Device &amp; App</td>
          <td style="padding:6px 0;color:#0f172a;">💻 ${deviceText}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-weight:600;">IP Address</td>
          <td style="padding:6px 0;color:#0f172a;font-family:monospace;">${ipText}</td>
        </tr>
      </table>
    </div>

    <!-- Security Guidance -->
    <div style="background-color:#f0fdf4;border-left:4px solid:#16a34a;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>Was this you?</strong> If you recognize this login, no further action is required. You can safely keep using your vault.
      </p>
    </div>

    <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
      <p style="margin:0 0 12px 0;font-size:13px;color:#991b1b;line-height:1.5;">
        <strong>Don't recognize this sign-in?</strong> If you did not sign in at this time, someone else may have gained access to your account. Change your password immediately to protect your vault.
      </p>
      <div style="text-align:left;">
        <a href="${resetUrl}" style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;box-shadow:0 2px 6px rgba(220,38,38,0.25);">
          Secure My Account
        </a>
      </div>
    </div>
  `;

  const html = renderEmailWrapper({
    badge: 'Sign-in Alert',
    title: 'New Sign-In to Your LockForge Account',
    subtitle: 'We noticed a new session login to your account.',
    bodyHtml,
    previewText: `New sign-in detected at ${timeFormatted} from ${locationText}`,
  });

  await sendEmail({
    to: email,
    subject: `Security Alert: New sign-in to LockForge (${locationText})`,
    html,
  });
};

export const sendTwoFactorOtpEmail = async (email, otp, purpose = 'login', userName = '') => {
  const titles = {
    login: 'Your Sign-In Verification Code',
    setup: 'Verify Two-Factor Authentication Setup',
    disable: 'Confirm Disabling Two-Factor Authentication',
    remove: 'Confirm Removing Two-Factor Method',
  };
  const subjects = {
    login: 'Your LockForge sign-in code',
    setup: 'Verify your two-factor authentication setup',
    disable: 'Security alert: Confirm disabling two-factor authentication',
    remove: 'Security alert: Confirm removing two-factor method',
  };
  const descriptions = {
    login: 'Use this one-time verification code to complete your LockForge sign-in:',
    setup: 'Use this one-time verification code to enable two-factor authentication on your LockForge account:',
    disable: 'Use this one-time verification code to confirm disabling two-factor authentication on your account:',
    remove: 'Use this one-time verification code to confirm removing this authentication method:',
  };

  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${nameGreeting}</p>
    <p style="margin:0 0 20px 0;">${descriptions[purpose] || descriptions.login}</p>

    <!-- OTP Code Display -->
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background-color:#eef2ff;border:2px dashed #6366f1;border-radius:12px;padding:16px 36px;box-shadow:0 2px 8px rgba(99,102,241,0.12);">
        <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#1e1b4b;user-select:all;">
          ${otp}
        </span>
      </div>
      <div style="margin-top:12px;font-size:13px;color:#64748b;font-weight:600;">
        ⏱ Expires in 10 minutes
      </div>
    </div>

    <!-- Security Notice -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-top:24px;">
      <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">
        🔒 <strong>Security Warning:</strong> LockForge staff will never ask you for this code or your Master Password. Never share this code with anyone. If you did not request this, please change your password immediately.
      </p>
    </div>
  `;

  const html = renderEmailWrapper({
    badge: 'Two-Factor Authentication',
    title: titles[purpose] || titles.login,
    subtitle: 'One-time security verification code',
    bodyHtml,
    previewText: `Your LockForge verification code is ${otp}. Valid for 10 minutes.`,
  });

  await sendEmail({
    to: email,
    subject: subjects[purpose] || subjects.login,
    html,
  });
};

export const sendVerificationEmail = async (email, token, userName = '') => {
  const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${token}`;
  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${nameGreeting}</p>
    <p style="margin:0 0 24px 0;">
      Welcome to <strong>LockForge</strong>! Please verify your email address to complete your account setup and activate your zero-knowledge encrypted vault.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(79,70,229,0.25);">
        Verify Email Address
      </a>
    </div>

    <p style="margin:20px 0 8px 0;font-size:13px;color:#64748b;">
      If the button above does not work, copy and paste this link into your browser:
    </p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;word-break:break-all;font-size:12px;color:#4f46e5;font-family:monospace;">
      ${url}
    </div>
  `;

  const html = renderEmailWrapper({
    badge: 'Account Setup',
    title: 'Verify Your Email Address',
    subtitle: 'Complete your registration to secure your vault',
    bodyHtml,
    previewText: 'Verify your LockForge account to start securing your passwords.',
  });

  await sendEmail({
    to: email,
    subject: 'Verify your LockForge account',
    html,
  });
};

export const sendEmailChangeVerification = async (email, token, userName = '') => {
  const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email-change?token=${token}`;
  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${nameGreeting}</p>
    <p style="margin:0 0 24px 0;">
      You requested to update your LockForge account email to this address. Click below to confirm this change:
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(79,70,229,0.25);">
        Confirm New Email Address
      </a>
    </div>

    <p style="margin:20px 0 8px 0;font-size:13px;color:#64748b;">
      This link expires in 24 hours. If you did not request this change, you can safely ignore this email.
    </p>
  `;

  const html = renderEmailWrapper({
    badge: 'Email Change',
    title: 'Confirm Your New Email Address',
    subtitle: 'Verify your new primary account email',
    bodyHtml,
    previewText: 'Confirm your new LockForge email address.',
  });

  await sendEmail({
    to: email,
    subject: 'Confirm your new LockForge email',
    html,
  });
};

export const sendEmailChangeAlert = async (oldEmail, newEmail, userName = '') => {
  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${nameGreeting}</p>
    <p style="margin:0 0 18px 0;">
      A request was made to change your LockForge account email address to <strong>${newEmail}</strong>.
    </p>
    <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-top:20px;">
      <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.5;">
        ⚠️ <strong>Did not request this?</strong> If you did not initiate this change, someone may be attempting to access your account. Please log in immediately and change your password.
      </p>
    </div>
  `;

  const html = renderEmailWrapper({
    badge: 'Security Notice',
    title: 'Email Change Requested',
    subtitle: 'A request was made to update your login email',
    bodyHtml,
    previewText: `LockForge email change requested for ${newEmail}`,
  });

  await sendEmail({
    to: oldEmail,
    subject: 'LockForge email change requested',
    html,
  });
};

export const sendPasswordResetEmail = async (email, token, userName = '') => {
  const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${nameGreeting}</p>
    <p style="margin:0 0 24px 0;">
      We received a request to reset the login password for your LockForge account. Click the button below to choose a new password:
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(79,70,229,0.25);">
        Reset Password
      </a>
    </div>

    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-top:24px;">
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
        ⏱ This password reset link expires in <strong>1 hour</strong>.<br>
        If you did not request a password reset, you can safely ignore this email — your account remains secure.
      </p>
    </div>
  `;

  const html = renderEmailWrapper({
    badge: 'Password Reset',
    title: 'Reset Your LockForge Password',
    subtitle: 'Instructions to choose a new password',
    bodyHtml,
    previewText: 'Reset your LockForge password.',
  });

  await sendEmail({
    to: email,
    subject: 'Reset your LockForge password',
    html,
  });
};


export const sendWeeklySecurityDigestEmail = async ({
  email,
  userName = '',
  weakCount = 0,
  reusedCount = 0,
  securityScore = 100,
  weakServices = [],
  reusedServices = [],
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const dashboardUrl = `${clientUrl}/security-dashboard`;
  const nameGreeting = userName ? `Hello ${userName},` : 'Hello,';

  // Badge & score styling
  const scoreColor = securityScore >= 70 ? '#10b981' : securityScore >= 40 ? '#f59e0b' : '#ef4444';
  const scoreLabel = securityScore >= 70 ? 'Good' : securityScore >= 40 ? 'Needs Attention' : 'Vulnerable';

  // Format services preview lists
  const weakListHtml = weakServices && weakServices.length > 0
    ? `<div style="margin-top:10px;font-size:13px;color:#64748b;">
        <strong style="color:#475569;">Affected services:</strong> ${weakServices.slice(0, 6).map((s) => `<span style="display:inline-block;background-color:#fee2e2;color:#991b1b;padding:3px 9px;border-radius:6px;margin:2px 3px;font-weight:600;font-size:12px;">${s}</span>`).join(' ')}
        ${weakServices.length > 6 ? `<span style="color:#94a3b8;font-size:12px;font-weight:600;">+${weakServices.length - 6} more</span>` : ''}
       </div>`
    : '';

  const reusedListHtml = reusedServices && reusedServices.length > 0
    ? `<div style="margin-top:10px;font-size:13px;color:#64748b;">
        <strong style="color:#475569;">Affected services:</strong> ${reusedServices.slice(0, 6).map((s) => `<span style="display:inline-block;background-color:#fef3c7;color:#92400e;padding:3px 9px;border-radius:6px;margin:2px 3px;font-weight:600;font-size:12px;">${s}</span>`).join(' ')}
        ${reusedServices.length > 6 ? `<span style="color:#94a3b8;font-size:12px;font-weight:600;">+${reusedServices.length - 6} more</span>` : ''}
       </div>`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;color:#1e293b;">${nameGreeting}</p>
    <p style="margin:0 0 20px 0;line-height:1.6;color:#334155;font-size:14px;">
      During your automated weekly vault security audit, our system identified security vulnerabilities in your stored passwords that require your immediate attention. Reusing passwords or relying on weak passwords leaves your personal data susceptible to automated credential stuffing, dictionary attacks, and data breaches.
    </p>

    <!-- Score & Stats Banner -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:24px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:middle;width:48%;padding-right:12px;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Vault Security Score</div>
            <div style="margin-top:4px;">
              <span style="font-size:32px;font-weight:800;color:${scoreColor};line-height:1;">${securityScore}%</span>
              <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background-color:${scoreColor}18;color:${scoreColor};text-transform:uppercase;">
                ${scoreLabel}
              </span>
            </div>
          </td>
          <td style="vertical-align:middle;width:52%;border-left:1px solid #e2e8f0;padding-left:18px;">
            <div style="font-size:13px;color:#475569;line-height:1.5;">
              Weekly security review conducted on <strong>${formatDateTime(new Date())}</strong>.
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Findings Section -->
    <div style="margin-bottom:24px;">
      ${weakCount > 0 ? `
      <!-- Weak Passwords Box -->
      <div style="background-color:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:16px 18px;margin-bottom:14px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;width:32px;padding-top:2px;">
              <div style="width:26px;height:26px;border-radius:50%;background-color:#fee2e2;color:#dc2626;text-align:center;line-height:26px;font-size:14px;font-weight:800;">!</div>
            </td>
            <td style="vertical-align:top;padding-left:12px;">
              <div style="font-size:15px;font-weight:700;color:#991b1b;margin-bottom:4px;">
                ${weakCount} Weak Password${weakCount > 1 ? 's' : ''} Detected
              </div>
              <div style="font-size:13px;color:#7f1d1d;line-height:1.5;">
                These passwords do not meet recommended length and complexity standards and can be cracked quickly by modern automated cracking tools.
              </div>
              ${weakListHtml}
            </td>
          </tr>
        </table>
      </div>
      ` : ''}

      ${reusedCount > 0 ? `
      <!-- Reused Passwords Box -->
      <div style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 18px;margin-bottom:14px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;width:32px;padding-top:2px;">
              <div style="width:26px;height:26px;border-radius:50%;background-color:#fef3c7;color:#d97706;text-align:center;line-height:26px;font-size:14px;font-weight:800;">↻</div>
            </td>
            <td style="vertical-align:top;padding-left:12px;">
              <div style="font-size:15px;font-weight:700;color:#92400e;margin-bottom:4px;">
                ${reusedCount} Reused Password${reusedCount > 1 ? 's' : ''} Found
              </div>
              <div style="font-size:13px;color:#78350f;line-height:1.5;">
                Multiple services share the exact same password. If any one of these services suffers a security leak, attackers can breach all your other connected accounts.
              </div>
              ${reusedListHtml}
            </td>
          </tr>
        </table>
      </div>
      ` : ''}
    </div>

    <!-- Recommendations -->
    <div style="background-color:#f8fafc;border-left:4px solid #4f46e5;padding:14px 18px;border-radius:0 10px 10px 0;margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px;">Recommended Actions:</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#475569;line-height:1.6;">
        <li>Open your <strong>Security Dashboard</strong> to see all affected credentials.</li>
        <li>Generate a strong, unique 16+ character password with symbols and numbers for each account.</li>
        <li>Update the password on the respective service and save the new credentials in LockForge.</li>
      </ul>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin:32px 0 24px 0;">
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);color:#ffffff;font-size:15px;font-weight:700;padding:14px 34px;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(79,70,229,0.3);letter-spacing:0.3px;">
        🛡️ Open Security Dashboard
      </a>
    </div>

    <p style="margin:20px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
      You receive this email every week because at least one weak or reused password was detected in your vault.<br>
      Once all weak and reused passwords are changed, these weekly alerts will stop automatically.
    </p>
  `;

  const html = renderEmailWrapper({
    badge: 'Weekly Security Digest',
    title: 'Action Required: Weak or Reused Passwords Detected',
    subtitle: 'Weekly automated security review of your LockForge vault',
    bodyHtml,
    previewText: `LockForge Security: Action required — ${weakCount} weak and ${reusedCount} reused passwords found.`,
  });

  await sendEmail({
    to: email,
    subject: `Action Required: Weak or Reused Passwords Detected in Your LockForge Vault`,
    html,
  });
};
