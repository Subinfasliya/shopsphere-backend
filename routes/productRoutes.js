const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/productController');
const { uploadProductImage } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', controller.list);
router.get('/categories', controller.categories);
router.post('/upload-image', authenticate, authorize('admin'), uploadProductImage, controller.uploadImage);
router.delete('/upload-image', authenticate, authorize('admin'), controller.deleteUploadedImage);
router.post('/:id/rating', authenticate, controller.rate);
router.get('/:id', controller.getOne);
router.post('/', authenticate, authorize('admin'), controller.create);
router.patch('/:id', authenticate, authorize('admin'), controller.update);
router.delete('/:id', authenticate, authorize('admin'), controller.remove);

module.exports = router;
