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
    from: `"LockForge" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

export const sendVerificationEmail = async (email, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Verify your LockForge account',
    html: `<p>Welcome to LockForge!</p><p><a href="${url}">Click here to verify your email</a></p><p>Or copy this link: ${url}</p>`,
  });
};

export const sendPasswordResetEmail = async (email, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your LockForge password',
    html: `<p>You requested a password reset.</p><p><a href="${url}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p>`,
  });
};
