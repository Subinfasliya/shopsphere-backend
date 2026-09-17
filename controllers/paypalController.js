const paypal = require('../services/paypalService');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

const releaseOrderInventory = async (order) => {
  if (!order?.inventoryReserved) return;
  for (const item of order.items) {
    await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
  }
  order.inventoryReserved = false;
  order.inventoryReleasedAt = new Date();
};

const webhook = async (req, res, next) => {
  try {
    const event = req.body;
    const valid = await paypal.verifyWebhookSignature({ headers: req.headers, webhookEvent: event });
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid PayPal webhook signature' });

    const paypalOrderId = event?.resource?.supplementary_data?.related_ids?.order_id ||
      event?.resource?.custom_id ||
      event?.resource?.id;
    const eventType = event?.event_type || '';
    const order = paypalOrderId ? await Order.findOne({ paypalOrderId }) : null;

    if (!order) return res.status(200).json({ success: true, ignored: true });

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event?.resource;
      const amount = Number(capture?.amount?.value);
      const currency = capture?.amount?.currency_code;
      if (currency !== order.paypalCurrency ||
          Number.isFinite(amount) === false ||
          Number(amount.toFixed(2)) !== Number(order.paypalAmount.toFixed(2))) {
        return res.status(400).json({ success: false, message: 'PayPal webhook amount verification failed' });
      }

      order.paymentStatus = 'paid';
      order.orderStatus = 'processing';
      order.inventoryReserved = false;
      order.paypalCaptureId = capture?.id || order.paypalCaptureId;
      await order.save();
      await Cart.findOneAndUpdate({ user: order.user }, { $set: { items: [] } });
    }

    if (['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'CHECKOUT.ORDER.CANCELLED'].includes(eventType)) {
      if (order.paymentStatus !== 'paid') {
        await releaseOrderInventory(order);
        order.paymentStatus = 'failed';
        order.orderStatus = 'cancelled';
        await order.save();
      }
    }

    if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(eventType)) {
      if (order.paymentStatus === 'paid') {
        order.paymentStatus = 'refunded';
        order.orderStatus = 'cancelled';
        await order.save();
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
};

const config = async (req, res) => {
  res.json({
    success: true,
    data: {
      clientId: process.env.PAYPAL_CLIENT_ID_PUBLIC || process.env.PAYPAL_CLIENT_ID || '',
      environment: process.env.PAYPAL_ENV === 'production' ? 'production' : 'sandbox',
      currency: process.env.PAYPAL_CURRENCY || 'USD',
      enabled: Boolean(process.env.PAYPAL_CLIENT_ID_PUBLIC || process.env.PAYPAL_CLIENT_ID),
    },
  });
};

module.exports = { webhook, config };
