const jwt = require('jsonwebtoken');
const createError = require('../utils/createError');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;
    if (!token) return next(createError(401, 'Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, {
      issuer: process.env.JWT_ISSUER || 'shopsphere-api',
      audience: process.env.JWT_AUDIENCE || 'shopsphere-web',
    });

    const user = await User.findById(decoded.sub).select('-password');
    if (!user || user.isActive === false) return next(createError(401, 'User session is no longer active'));
    if (user.sessionVersion !== decoded.sv) return next(createError(401, 'Session expired. Please sign in again.'));

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return next(createError(401, 'Access session expired'));
    if (error.name === 'JsonWebTokenError') return next(createError(401, 'Invalid access session'));
    next(error);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(createError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(createError(403, 'You do not have permission to perform this action'));
  next();
};

module.exports = { authenticate, authorize };
