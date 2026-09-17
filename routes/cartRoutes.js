const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const controller = require('../controllers/cartController');

const router = express.Router();
router.use(authenticate);
router.get('/', controller.get);
router.post('/items', controller.add);
router.patch('/items/:productId', controller.update);
router.delete('/items/:productId', controller.remove);
router.delete('/', controller.clear);
module.exports = router;
