const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { getProfile, updateProfile, changePassword } = require('../controllers/userController');

const router = express.Router();

router.use(authenticate);
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.patch('/password', changePassword);

module.exports = router;
