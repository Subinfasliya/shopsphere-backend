const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true, validate: (v) => v.length > 0 },
    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true, default: 'India' },
    },
    subtotal: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', enum: ['INR', 'USD'] },
    paymentMethod: { type: String, enum: ['cod', 'paypal'], default: 'cod', index: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending', index: true },
    paypalOrderId: { type: String, unique: true, sparse: true, index: true },
    paypalCaptureId: { type: String, default: null },
    paypalAmount: { type: Number, default: null },
    paypalCurrency: { type: String, default: null },
    paymentExpiresAt: { type: Date, default: null, index: true },
    inventoryReserved: { type: Boolean, default: false },
    inventoryReleasedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ['user', 'admin', null], default: null },
    deliveredAt: { type: Date, default: null, index: true },
    deliveryOtpHash: { type: String, default: null, select: false },
    deliveryOtpExpiresAt: { type: Date, default: null },
    deliveryOtpSentAt: { type: Date, default: null },
    returnStatus: { type: String, enum: ['none', 'otp_sent', 'requested', 'approved', 'completed', 'rejected'], default: 'none', index: true },
    returnOtpHash: { type: String, default: null, select: false },
    returnOtpExpiresAt: { type: Date, default: null },
    returnOtpSentAt: { type: Date, default: null },
    returnRequestedAt: { type: Date, default: null },
    returnConfirmedAt: { type: Date, default: null },
    orderStatus: {
      type: String,
      enum: ['placed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'placed',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
