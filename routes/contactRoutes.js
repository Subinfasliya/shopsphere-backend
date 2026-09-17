const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/contactController');
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
router.post('/', limiter, controller.submit);
module.exports = router;
