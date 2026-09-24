const crypto = require('crypto');

const errorHandler = (err, req, res, next) => {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  console.error(`[${requestId}]`, err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';

  if (err instanceof require('multer').MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : 'Invalid image upload';
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((item) => item.message).join(', ');
  }
  if (err.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyPattern || {});
    message = `${fields.join(', ') || 'Resource'} already exists`;
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID';
  }

  res.set('X-Request-Id', requestId);
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    requestId,
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
};
module.exports = errorHandler;
