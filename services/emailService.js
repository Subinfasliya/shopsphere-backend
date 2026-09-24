const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS.trim() },
  });
  return transporter;
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  const mailer = getTransporter();
  if (!mailer) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] Password reset URL for ${to}: ${resetUrl}`);
      return { delivered: false, developmentUrl: resetUrl };
    }
    throw new Error('Email service is not configured');
  }
  try {
    await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: 'Reset your ShopSphere password',
      text: `Hi ${name},\n\nReset your password using this link (expires in ${process.env.PASSWORD_RESET_TTL_MINUTES || 15} minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h2>Reset your ShopSphere password</h2><p>Hi ${name},</p><p>Use the button below to set a new password.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:10px">Reset password</a></p><p>This link expires in ${process.env.PASSWORD_RESET_TTL_MINUTES || 15} minutes.</p><p>If you did not request this, you can safely ignore this email.</p></div>`,
    });
    return { delivered: true };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] SMTP send failed: ${error.message}`);
      console.warn(`[DEV] Password reset URL for ${to}: ${resetUrl}`);
      return { delivered: false, developmentUrl: resetUrl, smtpError: error.message };
    }
    throw error;
  }
};

const sendContactEmail = async ({ name, email, subject, message }) => {
  const mailer = getTransporter();
  if (!mailer) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] Contact message from ${email}: ${subject}`);
      return { delivered: false };
    }
    throw new Error('Email service is not configured');
  }
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    replyTo: email,
    to: process.env.SUPPORT_EMAIL || process.env.MAIL_FROM || process.env.SMTP_USER,
    subject: `[ShopSphere Support] ${subject}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
  });
  return { delivered: true };
};

const sendOrderOtpEmail = async ({ to, name, orderId, otp, type }) => {
  const mailer = getTransporter();
  const delivery = type === 'delivery';
  const subject = delivery ? 'Confirm delivery for your ShopSphere order' : 'Confirm your ShopSphere return request';
  const purpose = delivery ? 'confirm that you received your order' : 'confirm your return request';
  const expiry = delivery ? '15 minutes' : '30 minutes';
  const text = `Hi ${name || 'there'},\n\nUse OTP ${otp} to ${purpose}. Order: ${orderId}. This code expires in ${expiry}.`;
  if (!mailer) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] ${type} OTP for ${to}, order ${orderId}: ${otp}`);
      return { delivered: false, developmentOtp: otp };
    }
    throw new Error('Email service is not configured');
  }
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h2>${subject}</h2><p>Hi ${name || 'there'},</p><p>Use this one-time password to ${purpose}:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${otp}</p><p>This code expires in ${expiry}.</p><p>Order: ${orderId}</p></div>`,
  });
  return { delivered: true };
};

const verifyEmailTransport = async () => {
  const mailer = getTransporter();
  if (!mailer) throw new Error('SMTP is not configured');
  await mailer.verify();
  return true;
};

module.exports = { sendPasswordResetEmail, sendContactEmail, sendOrderOtpEmail, verifyEmailTransport };
