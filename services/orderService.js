const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const createError = require('../utils/createError');
const paypal = require('./paypalService');
const { normalizePaypalCurrency } = require('../utils/paypalConfig');
const { createOtp, hashOtp } = require('../utils/otpUtils');
const { sendOrderOtpEmail } = require('./emailService');

const PAYPAL_CURRENCY = normalizePaypalCurrency(process.env.PAYPAL_CURRENCY);
const INR_TO_PAYPAL = Number(process.env.INR_TO_PAYPAL_RATE || 0.012);
const PAYMENT_CURRENCY = PAYPAL_CURRENCY;
const toPaymentAmount = (amount) => Number((PAYMENT_CURRENCY === 'INR' ? amount : amount * INR_TO_PAYPAL).toFixed(2));
const ORDER_CANCEL_WINDOW_MS = Number(process.env.ORDER_CANCEL_WINDOW_MINUTES || 30) * 60 * 1000;
const ORDER_RETENTION_MS = Number(process.env.DELIVERED_ORDER_RETENTION_DAYS || 30) * 24 * 60 * 60 * 1000;
const DELIVERY_OTP_TTL_MS = 15 * 60 * 1000;
const RETURN_OTP_TTL_MS = 30 * 60 * 1000;
const RETURN_WINDOW_MS = Number(process.env.RETURN_WINDOW_DAYS || 7) * 24 * 60 * 60 * 1000;

const getCartSnapshot = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate('items.product', 'name image price stock category brand isActive');
  if (!cart || !cart.items.length) throw createError(400, 'Cart is empty');

  const orderItems = [];
  let subtotal = 0;

  for (const item of cart.items) {
    const product = item.product;
    if (!product || !product.isActive) throw createError(404, 'A product in your cart is no longer available');
    if (product.stock < item.quantity) throw createError(409, `${product.name} only has ${product.stock} unit(s) left`);

    orderItems.push({
      product: product._id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity: item.quantity,
    });
    subtotal += product.price * item.quantity;
  }

  return { cart, orderItems, subtotal };
};

const reserveInventory = async (items) => {
  const reserved = [];
  try {
    for (const item of items) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product, isActive: true, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { returnDocument: 'after' }
      );

      if (!updated) throw createError(409, `${item.name} is no longer available in the requested quantity`);
      reserved.push(item);
    }
    return reserved;
  } catch (error) {
    for (const item of reserved) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
    }
    throw error;
  }
};

const releaseInventory = async (items) => {
  for (const item of items) {
    await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
  }
};

const clearUserCart = async (userId) => Cart.findOneAndUpdate({ user: userId }, { $set: { items: [] } }, { returnDocument: 'after' });

const createCodOrder = async ({ userId, shippingAddress }) => {
  const { orderItems, subtotal } = await getCartSnapshot(userId);
  await reserveInventory(orderItems);
  const paymentItems = orderItems.map((item) => ({ ...item, price: toPaymentAmount(item.price) }));
  const paymentSubtotal = toPaymentAmount(subtotal);

  let order;
  try {
    order = await Order.create({
      user: userId,
      items: paymentItems,
      shippingAddress,
      subtotal: paymentSubtotal,
      totalPrice: paymentSubtotal,
      currency: PAYMENT_CURRENCY,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      inventoryReserved: true,
    });

    await clearUserCart(userId);
    return populateOrder(Order.findById(order._id));
  } catch (error) {
    await releaseInventory(orderItems);
    throw error;
  }
};

const createPayPalOrder = async ({ userId, shippingAddress }) => {
  const existing = await Order.findOne({ user: userId, paymentMethod: 'paypal', paymentStatus: 'pending', inventoryReserved: true, paymentExpiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (existing?.paypalOrderId) {
    return { paypalOrderId: existing.paypalOrderId, orderId: existing._id, amount: existing.paypalAmount, currency: existing.paypalCurrency };
  }
  const { orderItems, subtotal } = await getCartSnapshot(userId);
  await reserveInventory(orderItems);

  const paypalAmount = toPaymentAmount(subtotal);
  if (!Number.isFinite(paypalAmount) || paypalAmount <= 0) {
    await releaseInventory(orderItems);
    throw createError(400, 'Unable to calculate the PayPal amount');
  }

  let order;
  let paypalOrder;
  try {
    const paymentItems = orderItems.map((item) => ({ ...item, price: toPaymentAmount(item.price) }));
    order = await Order.create({
      user: userId,
      items: paymentItems,
      shippingAddress,
      subtotal: paypalAmount,
      totalPrice: paypalAmount,
      currency: PAYMENT_CURRENCY,
      paymentMethod: 'paypal',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      paypalAmount,
      paypalCurrency: PAYPAL_CURRENCY,
      paymentExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      inventoryReserved: true,
    });

    paypalOrder = await paypal.createOrder({
      amount: paypalAmount,
      currency: PAYPAL_CURRENCY,
      referenceId: order._id.toString(),
      description: 'ShopSphere order',
    });

    order.paypalOrderId = paypalOrder.id;
    await order.save();

    return {
      paypalOrderId: paypalOrder.id,
      orderId: order._id,
      amount: paypalAmount,
      currency: PAYPAL_CURRENCY,
    };
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.paypalOrderId && paypalOrder?.id) {
      const existingOrder = await Order.findOne({
        user: userId,
        paypalOrderId: paypalOrder.id,
        paymentMethod: 'paypal',
        paymentStatus: 'pending',
        inventoryReserved: true,
        paymentExpiresAt: { $gt: new Date() },
      });

      if (existingOrder) {
        await releaseInventory(orderItems);
        if (order?._id) await Order.deleteOne({ _id: order._id });
        return {
          paypalOrderId: existingOrder.paypalOrderId,
          orderId: existingOrder._id,
          amount: existingOrder.paypalAmount,
          currency: existingOrder.paypalCurrency,
        };
      }
    }
    await releaseInventory(orderItems);
    if (order?._id) await Order.deleteOne({ _id: order._id });
    throw error;
  }
};

const capturePayPalOrder = async ({ userId, paypalOrderId }) => {
  const order = await Order.findOne({ user: userId, paypalOrderId });
  if (!order) throw createError(404, 'Payment order not found');
  if (order.paymentStatus === 'paid') return populateOrder(Order.findById(order._id));
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) {
    await cancelPayPalOrder({ userId, paypalOrderId });
    throw createError(400, 'This payment session expired. Please start checkout again.');
  }

  let capture;
  try {
    capture = await paypal.captureOrder(paypalOrderId);
  } catch (error) {
    const paypalIssue = error?.paypal?.details?.[0]?.issue || '';
    if (paypalIssue !== 'ORDER_ALREADY_CAPTURED') throw error;
    throw createError(409, 'This PayPal order was already captured. Refresh your orders.');
  }

  if (capture.status !== 'COMPLETED') {
    await releaseInventoryIfReserved(order);
    order.paymentStatus = 'failed';
    order.inventoryReserved = false;
    order.inventoryReleasedAt = new Date();
    order.orderStatus = 'cancelled';
    await order.save();
    throw createError(402, `PayPal payment was not completed (${capture.status || 'unknown status'})`);
  }

  const capturedAmount = Number(capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value);
  const capturedCurrency = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code;
  if (capturedCurrency !== order.paypalCurrency || Number(capturedAmount.toFixed(2)) !== Number(order.paypalAmount.toFixed(2))) {
    await releaseInventoryIfReserved(order);
    order.paymentStatus = 'failed';
    order.inventoryReserved = false;
    order.inventoryReleasedAt = new Date();
    order.orderStatus = 'cancelled';
    await order.save();
    throw createError(400, 'PayPal amount verification failed');
  }

  const captureId = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
  order.paymentStatus = 'paid';
  order.paymentMethod = 'paypal';
  order.paypalCaptureId = captureId;
  order.orderStatus = 'processing';
  order.inventoryReserved = false;
  await order.save();
  await clearUserCart(userId);

  return populateOrder(Order.findById(order._id));
};

const releaseInventoryIfReserved = async (order) => {
  if (!order.inventoryReserved) return;
  await releaseInventory(order.items);
  order.inventoryReserved = false;
  order.inventoryReleasedAt = new Date();
};

const cancelPayPalOrder = async ({ userId, paypalOrderId }) => {
  const order = await Order.findOne({ user: userId, paypalOrderId });
  if (!order) throw createError(404, 'Payment order not found');
  if (order.paymentStatus === 'paid') throw createError(400, 'Paid orders cannot be cancelled from checkout');

  await releaseInventoryIfReserved(order);
  order.paymentStatus = 'failed';
  order.orderStatus = 'cancelled';
  await order.save();
  return populateOrder(Order.findById(order._id));
};

const cancelUserOrder = async ({ userId, orderId }) => {
  if (!mongoose.isValidObjectId(orderId)) throw createError(400, 'Invalid order id');
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw createError(404, 'Order not found');
  if (order.orderStatus !== 'placed') throw createError(409, 'This order can no longer be cancelled');
  if (Date.now() - order.createdAt.getTime() > ORDER_CANCEL_WINDOW_MS) throw createError(409, 'The cancellation window for this order has expired');
  if (order.paymentStatus === 'paid') throw createError(409, 'Paid orders cannot be cancelled');

  await releaseInventoryIfReserved(order);
  order.paymentStatus = order.paymentMethod === 'paypal' ? 'failed' : order.paymentStatus;
  order.orderStatus = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelledBy = 'user';
  await order.save();
  return populateOrder(Order.findById(order._id));
};

const requestDeliveryConfirmation = async (orderId) => {
  const order = await Order.findById(orderId).populate('user', 'name email');
  if (!order) throw createError(404, 'Order not found');
  if (order.orderStatus !== 'shipped') throw createError(409, 'Order must be shipped before delivery confirmation');
  const otp = createOtp();
  await sendOrderOtpEmail({ to: order.user.email, name: order.user.name, orderId: order._id, otp, type: 'delivery' });
  order.deliveryOtpHash = hashOtp(otp);
  order.deliveryOtpExpiresAt = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
  order.deliveryOtpSentAt = new Date();
  await order.save();
  return populateOrder(Order.findById(order._id));
};

const confirmDelivery = async ({ userId, orderId, otp }) => {
  const order = await Order.findOne({ _id: orderId, user: userId }).select('+deliveryOtpHash');
  if (!order) throw createError(404, 'Order not found');
  if (order.orderStatus !== 'shipped' || !order.deliveryOtpHash) throw createError(409, 'Delivery confirmation is not pending');
  if (!order.deliveryOtpExpiresAt || order.deliveryOtpExpiresAt <= new Date()) throw createError(400, 'Delivery OTP has expired');
  if (hashOtp(otp) !== order.deliveryOtpHash) throw createError(400, 'Invalid delivery OTP');
  order.orderStatus = 'delivered';
  order.deliveredAt = new Date();
  order.deliveryOtpHash = null;
  order.deliveryOtpExpiresAt = null;
  await order.save();
  return populateOrder(Order.findById(order._id));
};

const requestReturn = async ({ userId, orderId }) => {
  const order = await Order.findOne({ _id: orderId, user: userId }).populate('user', 'name email');
  if (!order) throw createError(404, 'Order not found');
  if (order.orderStatus !== 'delivered' || !order.deliveredAt) throw createError(409, 'Only delivered orders can be returned');
  if (Date.now() > order.deliveredAt.getTime() + RETURN_WINDOW_MS) throw createError(409, 'The seven-day return window has expired');
  if (['otp_sent', 'requested', 'approved', 'completed'].includes(order.returnStatus)) throw createError(409, 'A return request already exists for this order');
  const otp = createOtp();
  await sendOrderOtpEmail({ to: order.user.email, name: order.user.name, orderId: order._id, otp, type: 'return' });
  order.returnOtpHash = hashOtp(otp);
  order.returnOtpExpiresAt = new Date(Date.now() + RETURN_OTP_TTL_MS);
  order.returnOtpSentAt = new Date();
  order.returnStatus = 'otp_sent';
  await order.save();
  return populateOrder(Order.findById(order._id));
};

const confirmReturn = async ({ userId, orderId, otp }) => {
  const order = await Order.findOne({ _id: orderId, user: userId }).select('+returnOtpHash');
  if (!order) throw createError(404, 'Order not found');
  if (order.returnStatus !== 'otp_sent' || !order.returnOtpHash) throw createError(409, 'Return confirmation is not pending');
  if (Date.now() > order.deliveredAt.getTime() + RETURN_WINDOW_MS) throw createError(409, 'The seven-day return window has expired');
  if (!order.returnOtpExpiresAt || order.returnOtpExpiresAt <= new Date()) throw createError(400, 'Return OTP has expired');
  if (hashOtp(otp) !== order.returnOtpHash) throw createError(400, 'Invalid return OTP');
  order.returnStatus = 'requested';
  order.returnRequestedAt = new Date();
  order.returnConfirmedAt = new Date();
  order.returnOtpHash = null;
  order.returnOtpExpiresAt = null;
  await order.save();
  return populateOrder(Order.findById(order._id));
};

const releaseExpiredPaymentReservations = async () => {
  const orders = await Order.find({
    paymentMethod: 'paypal',
    paymentStatus: 'pending',
    inventoryReserved: true,
    paymentExpiresAt: { $lt: new Date() },
  }).limit(50);

  for (const order of orders) {
    await releaseInventoryIfReserved(order);
    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
    await order.save();
  }
};

const populateOrder = (query) => query
  .populate('user', 'name email phone')
  .populate('items.product', 'name image price brand category');

const getUserOrders = async (userId) => {
  const orders = await populateOrder(Order.find({ user: userId }).sort({ createdAt: -1 })).lean();
  const now = Date.now();
  return orders.map((order) => ({
    ...order,
    cancellationDeadline: new Date(order.createdAt.getTime() + ORDER_CANCEL_WINDOW_MS),
    canCancel: order.orderStatus === 'placed' && order.paymentStatus !== 'paid' && now < order.createdAt.getTime() + ORDER_CANCEL_WINDOW_MS,
  }));
};
const getAllOrders = async ({ page = 1, limit = 10 } = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const deliveredCutoff = new Date(Date.now() - ORDER_RETENTION_MS);
  const filter = { $or: [{ orderStatus: { $ne: 'delivered' } }, { orderStatus: 'delivered', deliveredAt: { $gt: deliveredCutoff } }, { orderStatus: 'delivered', deliveredAt: null, updatedAt: { $gt: deliveredCutoff } }] };
  const [orders, total] = await Promise.all([
    populateOrder(Order.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit)),
    Order.countDocuments(filter),
  ]);
  return { orders, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const updateOrderStatus = async (id, orderStatus) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid order id');
  const current = await Order.findById(id);
  if (!current) throw createError(404, 'Order not found');
  if (orderStatus === 'delivered') throw createError(409, 'Delivery must be confirmed by the customer with an OTP');
  if (current.orderStatus === 'cancelled' && orderStatus !== 'cancelled') throw createError(409, 'Cancelled orders cannot be reopened');
  const rank = { placed: 0, processing: 1, shipped: 2, delivered: 3 };
  if (orderStatus !== 'cancelled' && current.orderStatus !== 'cancelled' && rank[orderStatus] < rank[current.orderStatus]) throw createError(409, 'Order status cannot move backwards');
  const order = await Order.findByIdAndUpdate(id, { orderStatus, ...(orderStatus === 'cancelled' ? { cancelledAt: new Date(), cancelledBy: 'admin' } : {}) }, { returnDocument: 'after', runValidators: true });
  if (!order) throw createError(404, 'Order not found');
  return populateOrder(Order.findById(order._id));
};

module.exports = {
  createCodOrder,
  createPayPalOrder,
  capturePayPalOrder,
  cancelPayPalOrder,
  cancelUserOrder,
  requestDeliveryConfirmation,
  confirmDelivery,
  requestReturn,
  confirmReturn,
  releaseExpiredPaymentReservations,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
};
