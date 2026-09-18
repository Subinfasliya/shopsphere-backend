require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/dbConnection');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const paypalRoutes = require('./routes/paypalRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { csrfProtection, requireCsrf, csrfEndpoint } = require('./middleware/security');
const { releaseExpiredPaymentReservations } = require('./services/orderService');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet());
app.use(compression());

const sanitizeRequest = (req, res, next) => {
  ['body', 'params', 'headers', 'query'].forEach((key) => {
    if (req[key]) mongoSanitize.sanitize(req[key]);
  });
  next();
};

const normalizeOrigin = (value = '') => value.trim().replace(/\/+$/, '');

const configuredOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((item) => normalizeOrigin(item))
  .filter(Boolean);

const allowedOrigins = [...new Set([
  ...configuredOrigins,
  'http://localhost:5173',
  'http://localhost:5174',
  'https://shopsphere-frontend-tawny.vercel.app',
  'https://shopsphere-frontend.vercel.app',
])];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Client-Request-Id'],
  optionsSuccessStatus: 204,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(sanitizeRequest);
app.use(csrfProtection);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, message: 'Too many requests. Please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, message: 'Too many authentication attempts. Please try again later.' } });

app.use('/api/v1', apiLimiter);
app.get('/api/v1/auth/csrf', csrfEndpoint);
app.use('/api/v1/auth', authLimiter, requireCsrf, authRoutes);
app.use('/api/v1/users', requireCsrf, userRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', requireCsrf, orderRoutes);
app.use('/api/v1/cart', requireCsrf, cartRoutes);
app.use('/api/v1/wishlist', requireCsrf, wishlistRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/paypal', paypalRoutes);
app.use('/api/v1/admin', requireCsrf, adminRoutes);
app.use('/api/v1/contact', requireCsrf, contactRoutes);

app.get('/api/v1/ready', async (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    success: true,
    message: 'API is healthy',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});


app.get('/api/v1/health', (req, res) => res.json({ success: true, message: 'ShopSphere API is healthy', timestamp: new Date().toISOString() }));

app.get('/', (req, res) => res.json({ success: true, message: 'ShopSphere E-Commerce API' }));

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);

const start = async () => {
  try {
    await connectDB();
    const server = app.listen(port, () => console.log(`API running on http://localhost:${port}`));
    const cleanupTimer = setInterval(() => {
      releaseExpiredPaymentReservations().catch((error) => console.error('Payment reservation cleanup failed:', error.message));
    }, 10 * 60 * 1000);
    cleanupTimer.unref();

    const shutdown = (signal) => {
      console.log(`${signal} received. Shutting down gracefully...`);
      clearInterval(cleanupTimer);
      server.close(async () => {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        process.exit(0);
      });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
};

start();
module.exports = app;
