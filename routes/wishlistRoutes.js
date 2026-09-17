const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const controller = require('../controllers/wishlistController');
const router = express.Router();
router.use(authenticate);
router.get('/', controller.get);
router.post('/', controller.add);
router.delete('/:productId', controller.remove);
module.exports = router;
