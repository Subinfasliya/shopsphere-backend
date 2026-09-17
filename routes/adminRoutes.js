const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/adminController');

const router = express.Router();
router.use(authenticate, authorize('admin'));
router.get('/dashboard', controller.dashboard);
router.get('/customers', controller.customers);
router.get('/customers/:id', controller.customer);
router.patch('/customers/:id/status', controller.status);
module.exports = router;
