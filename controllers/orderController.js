const Joi = require('joi');
const orderService = require('../services/orderService');

const addressSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  phone: Joi.string().trim().min(5).max(20).required(),
  street: Joi.string().trim().min(2).max(120).required(),
  city: Joi.string().trim().min(2).max(80).required(),
  state: Joi.string().trim().min(2).max(80).required(),
  postalCode: Joi.string().trim().min(2).max(20).required(),
  country: Joi.string().trim().min(2).max(80).required(),
});

const checkoutSchema = Joi.object({
  shippingAddress: addressSchema.required(),
});

const listMyOrders = async (req, res, next) => {
  try { res.json({ success: true, data: { orders: await orderService.getUserOrders(req.user._id) } }); }
  catch (error) { next(error); }
};

const createCod = async (req, res, next) => {
  try {
    const { value, error } = checkoutSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const order = await orderService.createCodOrder({ userId: req.user._id, shippingAddress: value.shippingAddress });
    res.status(201).json({ success: true, message: 'Order placed', data: { order } });
  } catch (error) { next(error); }
};

const listAllOrders = async (req, res, next) => {
  try { res.json({ success: true, data: { orders: await orderService.getAllOrders() } }); }
  catch (error) { next(error); }
};

const updateStatus = async (req, res, next) => {
  try {
    const schema = Joi.object({ orderStatus: Joi.string().valid('placed', 'processing', 'shipped', 'delivered', 'cancelled').required() });
    const { value, error } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'Invalid order status' });
    const order = await orderService.updateOrderStatus(req.params.id, value.orderStatus);
    res.json({ success: true, message: 'Order status updated', data: { order } });
  } catch (error) { next(error); }
};

const createPayPal = async (req, res, next) => {
  try {
    const { value, error } = checkoutSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const data = await orderService.createPayPalOrder({ userId: req.user._id, shippingAddress: value.shippingAddress });
    res.status(201).json({ success: true, message: 'PayPal order created', data });
  } catch (error) { next(error); }
};

const capturePayPal = async (req, res, next) => {
  try {
    const order = await orderService.capturePayPalOrder({ userId: req.user._id, paypalOrderId: req.params.paypalOrderId });
    res.json({ success: true, message: 'Payment captured and order confirmed', data: { order } });
  } catch (error) { next(error); }
};

const cancelPayPal = async (req, res, next) => {
  try {
    const order = await orderService.cancelPayPalOrder({ userId: req.user._id, paypalOrderId: req.params.paypalOrderId });
    res.json({ success: true, message: 'Payment cancelled', data: { order } });
  } catch (error) { next(error); }
};

module.exports = { listMyOrders, createCod, listAllOrders, updateStatus, createPayPal, capturePayPal, cancelPayPal };
