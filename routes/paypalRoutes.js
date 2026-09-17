const express = require('express');
const controller = require('../controllers/paypalController');

const router = express.Router();
router.get('/config', controller.config);
router.post('/webhook', controller.webhook);
module.exports = router;
