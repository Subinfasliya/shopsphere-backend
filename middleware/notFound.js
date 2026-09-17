const createError = require('../utils/createError');

const notFound = (req, res, next) => {
  next(createError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = notFound;
