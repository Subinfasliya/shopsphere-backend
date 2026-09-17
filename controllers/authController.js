const Joi = require('joi');
const {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
} = require('../services/authService');
const {
  issueSession,
  rotateRefreshSession,
  revokeRefreshSession,
  clearAuthCookies,
} = require('../services/sessionService');

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(8).max(128).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

const forgotSchema = Joi.object({
  email: Joi.string().trim().email().required(),
});

const resetSchema = Joi.object({
  token: Joi.string().min(32).required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

const validationError = (error) => ({
  success: false,
  message: 'Validation failed',
  errors: error.details.map((d) => d.message),
});

const register = async (req, res, next) => {
  try {
    const { value, error } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json(validationError(error));

    const user = await registerUser(value);
    await issueSession({ res, user, req });
    res.status(201).json({ success: true, message: 'Registration successful', data: { user } });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { value, error } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json(validationError(error));

    const user = await loginUser(value);
    await issueSession({ res, user, req });
    res.json({ success: true, message: 'Login successful', data: { user } });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const user = await rotateRefreshSession({ res, req, rawToken: req.cookies?.refreshToken });
    if (!user) {
      clearAuthCookies(res);
      return res.json({ success: true, data: { authenticated: false, user: null } });
    }

    const safeUser = await require('../models/User').findById(user._id).select('-password -sessionVersion');
    res.json({ success: true, data: { user: safeUser } });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await revokeRefreshSession(req.cookies?.refreshToken);
    clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};

// Session bootstrap endpoint used by the frontend on initial load.
// A logged-out visitor is a valid application state, so this endpoint
// intentionally returns 200 instead of generating a 401/400 chain.
const session = async (req, res, next) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    if (!accessToken && !refreshToken) {
      clearAuthCookies(res);
      return res.json({ success: true, data: { authenticated: false, user: null } });
    }

    // Prefer the existing access session.
    if (accessToken) {
      try {
        const jwt = require('jsonwebtoken');
        const User = require('../models/User');
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET_KEY, {
          issuer: process.env.JWT_ISSUER || 'shopsphere-api',
          audience: process.env.JWT_AUDIENCE || 'shopsphere-web',
        });
        const user = await User.findById(decoded.sub).select('-password -sessionVersion');
        if (user && user.isActive !== false && user.sessionVersion === decoded.sv) {
          return res.json({ success: true, data: { authenticated: true, user } });
        }
      } catch (_error) {
        // Access token may be expired; continue to refresh below.
      }
    }

    if (!refreshToken) {
      clearAuthCookies(res);
      return res.json({ success: true, data: { authenticated: false, user: null } });
    }

    const user = await rotateRefreshSession({ res, req, rawToken: refreshToken });
    if (!user) {
      clearAuthCookies(res);
      return res.json({ success: true, data: { authenticated: false, user: null } });
    }

    const safeUser = await require('../models/User').findById(user._id).select('-password -sessionVersion');
    return res.json({ success: true, data: { authenticated: true, user: safeUser } });
  } catch (error) {
    clearAuthCookies(res);
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { value, error } = forgotSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json(validationError(error));

    const result = await requestPasswordReset(value.email);
    res.json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
      data: process.env.NODE_ENV !== 'production' && result?.developmentUrl ? { developmentUrl: result.developmentUrl } : undefined,
    });
  } catch (error) {
    next(error);
  }
};

const reset = async (req, res, next) => {
  try {
    const { value, error } = resetSchema.validate({ token: req.params.token, newPassword: req.body.newPassword }, { abortEarly: false });
    if (error) return res.status(400).json(validationError(error));

    await resetPassword(value);
    clearAuthCookies(res);
    res.json({ success: true, message: 'Password updated successfully. Please sign in again.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refresh, logout, me, session, forgotPassword, reset };
