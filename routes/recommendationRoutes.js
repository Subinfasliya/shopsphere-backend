const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { recommendations } = require('../controllers/recommendationController');

const router = express.Router();

router.get('/', authenticate, recommendations);

module.exports = router;
