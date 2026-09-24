const Joi = require("joi");
const orderService = require("../services/orderService");

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
  try {
    res.json({
      success: true,
      data: { orders: await orderService.getUserOrders(req.user._id) },
    });
  } catch (error) {
    next(error);
  }
};

const createCod = async (req, res, next) => {
  try {
    const { value, error } = checkoutSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error)
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          errors: error.details.map((d) => d.message),
        });
    const order = await orderService.createCodOrder({
      userId: req.user._id,
      shippingAddress: value.shippingAddress,
    });
    res
      .status(201)
      .json({ success: true, message: "Order placed", data: { order } });
  } catch (error) {
    next(error);
  }
};

const listAllOrders = async (req, res, next) => {
  try {
    const schema = Joi.object({ page: Joi.number().integer().min(1), limit: Joi.number().integer().min(1).max(50) });
    const { value, error } = schema.validate(req.query);
    if (error) return res.status(400).json({ success: false, message: 'Invalid pagination parameters' });
    res.json({
      success: true,
      data: await orderService.getAllOrders(value),
    });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const schema = Joi.object({
      orderStatus: Joi.string()
        .valid("placed", "processing", "shipped", "delivered", "cancelled")
        .required(),
    });
    const { value, error } = schema.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ success: false, message: "Invalid order status" });
    const order = value.orderStatus === 'delivered'
      ? await orderService.requestDeliveryConfirmation(req.params.id)
      : await orderService.updateOrderStatus(req.params.id, value.orderStatus);
    res.json({
      success: true,
      message: value.orderStatus === 'delivered' ? 'Delivery OTP sent to the customer' : "Order status updated",
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};

const createPayPal = async (req, res, next) => {
  try {
    const { value, error } = checkoutSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error)
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          errors: error.details.map((d) => d.message),
        });
    const data = await orderService.createPayPalOrder({
      userId: req.user._id,
      shippingAddress: value.shippingAddress,
    });
    res
      .status(201)
      .json({ success: true, message: "PayPal order created", data });
  } catch (error) {

     console.error("===== PAYPAL ERROR =====");

  console.error("Status:", error.response?.status);

  console.error(
    "PayPal Data:",
    JSON.stringify(error.response?.data, null, 2)
  );

  console.error("Message:", error.message);

    next(error);
  }
};

const capturePayPal = async (req, res, next) => {
  try {
    const order = await orderService.capturePayPalOrder({
      userId: req.user._id,
      paypalOrderId: req.params.paypalOrderId,
    });
    res.json({
      success: true,
      message: "Payment captured and order confirmed",
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};

const cancelPayPal = async (req, res, next) => {
  try {
    const order = await orderService.cancelPayPalOrder({
      userId: req.user._id,
      paypalOrderId: req.params.paypalOrderId,
    });
    res.json({ success: true, message: "Payment cancelled", data: { order } });
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const order = await orderService.cancelUserOrder({ userId: req.user._id, orderId: req.params.id });
    res.json({ success: true, message: 'Order cancelled', data: { order } });
  } catch (error) {
    next(error);
  }
};

const confirmDelivery = async (req, res, next) => {
  try {
    const schema = Joi.object({ otp: Joi.string().pattern(/^\d{6}$/).required() });
    const { value, error } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'A valid six-digit delivery OTP is required' });
    const order = await orderService.confirmDelivery({ userId: req.user._id, orderId: req.params.id, otp: value.otp });
    res.json({ success: true, message: 'Delivery confirmed successfully', data: { order } });
  } catch (error) { next(error); }
};

const requestReturn = async (req, res, next) => {
  try {
    const order = await orderService.requestReturn({ userId: req.user._id, orderId: req.params.id });
    res.json({ success: true, message: 'Return OTP sent to your email', data: { order } });
  } catch (error) { next(error); }
};

const confirmReturn = async (req, res, next) => {
  try {
    const schema = Joi.object({ otp: Joi.string().pattern(/^\d{6}$/).required() });
    const { value, error } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'A valid six-digit return OTP is required' });
    const order = await orderService.confirmReturn({ userId: req.user._id, orderId: req.params.id, otp: value.otp });
    res.json({ success: true, message: 'Return request submitted', data: { order } });
  } catch (error) { next(error); }
};

module.exports = {
  listMyOrders,
  createCod,
  listAllOrders,
  updateStatus,
  createPayPal,
  capturePayPal,
  cancelPayPal,
  cancelOrder,
  confirmDelivery,
  requestReturn,
  confirmReturn,
};
