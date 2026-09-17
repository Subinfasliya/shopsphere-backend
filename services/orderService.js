const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const createError = require('../utils/createError');
const paypal = require('./paypalService');

const PAYPAL_CURRENCY = process.env.PAYPAL_CURRENCY || 'USD';
const INR_TO_PAYPAL = Number(process.env.INR_TO_PAYPAL_RATE || 0.012);

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

  let order;
  try {
    order = await Order.create({
      user: userId,
      items: orderItems,
      shippingAddress,
      subtotal,
      totalPrice: subtotal,
      currency: 'INR',
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

  const paypalAmount = Number((subtotal * INR_TO_PAYPAL).toFixed(2));
  if (!Number.isFinite(paypalAmount) || paypalAmount <= 0) {
    await releaseInventory(orderItems);
    throw createError(400, 'Unable to calculate the PayPal amount');
  }

  let order;
  let paypalOrder;
  try {
    order = await Order.create({
      user: userId,
      items: orderItems,
      shippingAddress,
      subtotal,
      totalPrice: subtotal,
      currency: 'INR',
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

const getUserOrders = async (userId) => populateOrder(Order.find({ user: userId })).sort({ createdAt: -1 });
const getAllOrders = async () => populateOrder(Order.find()).sort({ createdAt: -1 });

const updateOrderStatus = async (id, orderStatus) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid order id');
  const order = await Order.findByIdAndUpdate(id, { orderStatus }, { returnDocument: 'after', runValidators: true });
  if (!order) throw createError(404, 'Order not found');
  return populateOrder(Order.findById(order._id));
};

module.exports = {
  createCodOrder,
  createPayPalOrder,
  capturePayPalOrder,
  cancelPayPalOrder,
  releaseExpiredPaymentReservations,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
};
