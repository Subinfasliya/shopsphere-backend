const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/productController');

const router = express.Router();

router.get('/', controller.list);
router.get('/categories', controller.categories);
router.get('/:id', controller.getOne);
router.post('/', authenticate, authorize('admin'), controller.create);
router.patch('/:id', authenticate, authorize('admin'), controller.update);
router.delete('/:id', authenticate, authorize('admin'), controller.remove);

module.exports = router;
