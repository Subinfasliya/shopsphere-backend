const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/orderController');

const router = express.Router();
router.use(authenticate);
router.post('/cod', controller.createCod);
router.post('/paypal/create', controller.createPayPal);
router.post('/paypal/:paypalOrderId/capture', controller.capturePayPal);
router.post('/paypal/:paypalOrderId/cancel', controller.cancelPayPal);
router.post('/:id/cancel', controller.cancelOrder);
router.post('/:id/confirm-delivery', controller.confirmDelivery);
router.post('/:id/return-request', controller.requestReturn);
router.post('/:id/return-confirm', controller.confirmReturn);
router.get('/my-orders', controller.listMyOrders);
router.get('/', authorize('admin'), controller.listAllOrders);
router.patch('/:id/status', authorize('admin'), controller.updateStatus);
module.exports = router;
