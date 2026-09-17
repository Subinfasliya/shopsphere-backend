const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/session', controller.session);
router.get('/me', authenticate, controller.me);
router.post('/forgot-password', passwordResetLimiter, controller.forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, controller.reset);

module.exports = router;
