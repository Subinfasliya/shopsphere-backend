const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const createError = require('../utils/createError');
const { randomToken, hashToken } = require('../utils/tokenUtils');
const { sendPasswordResetEmail } = require('./emailService');

const publicUser = async (id) => User.findById(id).select('-password -sessionVersion');

const registerUser = async ({ name, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) throw createError(409, 'Email is already registered');

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hashedPassword });
  return publicUser(user._id);
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || user.isActive === false) throw createError(401, 'Invalid email or password');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw createError(401, 'Invalid email or password');

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return publicUser(user._id);
};

const requestPasswordReset = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  // Do not reveal whether an account exists.
  if (!user) return;

  await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });

  const rawToken = randomToken(32);
  await PasswordResetToken.create({
    user: user._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + Number(process.env.PASSWORD_RESET_TTL_MINUTES || 15) * 60 * 1000),
  });

  const resetUrl = `${process.env.CLIENT_URL.split(',')[0].replace(/\/$/, '')}/reset-password/${rawToken}`;
  return sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
};

const resetPassword = async ({ token, newPassword }) => {
  const reset = await PasswordResetToken.findOne({
    tokenHash: hashToken(token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!reset) throw createError(400, 'Invalid or expired password reset link');

  const user = await User.findById(reset.user).select('+password');
  if (!user) throw createError(400, 'Invalid password reset link');

  user.password = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  user.sessionVersion += 1;
  await user.save();

  reset.usedAt = new Date();
  await reset.save();

  const RefreshToken = require('../models/RefreshToken');
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

module.exports = { registerUser, loginUser, requestPasswordReset, resetPassword };
