const createError = (statusCode, message, details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

module.exports = createError;
