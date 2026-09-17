const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const createError = require('../utils/createError');

const getDashboardStats = async () => {
  const [customers, products, orders, revenueAgg, pendingOrders, lowStock, recentOrders] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } },
    ]),
    Order.countDocuments({ orderStatus: { $in: ['placed', 'processing'] } }),
    Product.countDocuments({ isActive: true, stock: { $lte: 5 } }),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('user', 'name email')
      .populate('items.product', 'name image price'),
  ]);

  return {
    customers,
    products,
    orders,
    revenue: Number(revenueAgg[0]?.total || 0),
    pendingOrders,
    lowStock,
    recentOrders,
  };
};

const listCustomers = async ({ search = '', page = 1, limit = 20 }) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const filter = { role: 'user' };

  if (String(search).trim()) {
    const term = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter).select('-password -sessionVersion').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
    User.countDocuments(filter),
  ]);

  const customerIds = items.map((item) => item._id);
  const orderStats = await Order.aggregate([
    { $match: { user: { $in: customerIds } } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$totalPrice' } } },
  ]);
  const map = new Map(orderStats.map((row) => [row._id.toString(), row]));

  return {
    items: items.map((user) => ({
      ...user.toObject(),
      isActive: user.isActive !== false,
      orderCount: map.get(user._id.toString())?.orders || 0,
      totalSpent: Number(map.get(user._id.toString())?.spent || 0),
    })),
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
};

const getCustomer = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid customer id');
  const customer = await User.findOne({ _id: id, role: 'user' }).select('-password -sessionVersion');
  if (!customer) throw createError(404, 'Customer not found');

  const [orders, stats] = await Promise.all([
    Order.find({ user: id }).sort({ createdAt: -1 }).limit(20).populate('items.product', 'name image price'),
    Order.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$totalPrice' } } },
    ]),
  ]);

  return {
    customer: { ...customer.toObject(), isActive: customer.isActive !== false },
    orders,
    stats: {
      orders: stats[0]?.orders || 0,
      totalSpent: Number(stats[0]?.spent || 0),
    },
  };
};

const updateCustomerStatus = async (id, isActive) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid customer id');
  const user = await User.findOneAndUpdate(
    { _id: id, role: 'user' },
    { $set: { isActive: Boolean(isActive) }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after' }
  ).select('-password -sessionVersion');
  if (!user) throw createError(404, 'Customer not found');
  return user;
};

module.exports = { getDashboardStats, listCustomers, getCustomer, updateCustomerStatus };
