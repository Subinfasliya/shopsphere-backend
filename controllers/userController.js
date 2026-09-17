const Joi = require('joi');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const createError = require('../utils/createError');
const RefreshToken = require('../models/RefreshToken');
const { clearAuthCookies } = require('../services/sessionService');

const updateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80),
  phone: Joi.string().trim().max(20).allow(''),
  address: Joi.object({
    street: Joi.string().trim().max(120).allow(''),
    city: Joi.string().trim().max(80).allow(''),
    state: Joi.string().trim().max(80).allow(''),
    postalCode: Joi.string().trim().max(20).allow(''),
    country: Joi.string().trim().max(80).allow(''),
  }),
}).min(1);

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password -sessionVersion');
    res.json({ success: true, data: { user } });
  } catch (error) { next(error); }
};

const updateProfile = async (req, res, next) => {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const user = await User.findByIdAndUpdate(req.user._id, value, { returnDocument: 'after', runValidators: true }).select('-password -sessionVersion');
    if (!user) throw createError(404, 'User not found');
    res.json({ success: true, message: 'Profile updated', data: { user } });
  } catch (error) { next(error); }
};

const changePassword = async (req, res, next) => {
  try {
    const schema = Joi.object({ currentPassword: Joi.string().required(), newPassword: Joi.string().min(8).max(128).required() });
    const { value, error } = schema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });

    const user = await User.findById(req.user._id).select('+password');
    const matches = await bcrypt.compare(value.currentPassword, user.password);
    if (!matches) throw createError(400, 'Current password is incorrect');

    user.password = await bcrypt.hash(value.newPassword, 12);
    user.passwordChangedAt = new Date();
    user.sessionVersion += 1;
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    clearAuthCookies(res);

    res.json({ success: true, message: 'Password changed. Please sign in again.' });
  } catch (error) { next(error); }
};

module.exports = { getProfile, updateProfile, changePassword };
