const crypto = require('crypto');

const csrfCookie = 'csrfToken';

const sameSite = process.env.NODE_ENV === 'production' ? 'none' : (process.env.COOKIE_SAME_SITE || 'lax');
const secure = process.env.NODE_ENV === 'production' || String(process.env.COOKIE_SECURE).toLowerCase() === 'true';

const csrfProtection = (req, res, next) => {
  let token = req.cookies?.[csrfCookie];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(csrfCookie, token, {
      httpOnly: false,
      secure,
      sameSite,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  req.csrfToken = token;
  next();
};

const requireCsrf = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const header = req.get('x-csrf-token');
  const cookieToken = req.cookies?.[csrfCookie];

  if (!header || !cookieToken || header.length !== cookieToken.length || !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookieToken))) {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  }

  return next();
};

const csrfEndpoint = (req, res) => {
  res.json({ success: true, data: { csrfToken: req.csrfToken } });
};

module.exports = { csrfProtection, requireCsrf, csrfEndpoint, csrfCookie };
