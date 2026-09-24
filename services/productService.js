const mongoose = require('mongoose');
const Product = require('../models/Product');
const createError = require('../utils/createError');
const Review = require('../models/Review');
const Order = require('../models/Order');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildFilter = ({ search, category, minPrice, maxPrice }) => {
  const filter = { isActive: true };
  if (typeof search === 'string' && search.trim()) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { description: { $regex: term, $options: 'i' } },
      { brand: { $regex: term, $options: 'i' } },
    ];
  }
  if (typeof category === 'string' && category.trim()) filter.category = category.trim().toLowerCase();
  const min = minPrice === '' || minPrice == null ? null : Number(minPrice);
  const max = maxPrice === '' || maxPrice == null ? null : Number(maxPrice);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) throw createError(400, 'Invalid price filter');
  if (min !== null || max !== null) {
    filter.price = {};
    if (min !== null) filter.price.$gte = min;
    if (max !== null) filter.price.$lte = max;
    if (min !== null && max !== null && min > max) throw createError(400, 'Minimum price cannot be greater than maximum price');
  }
  return filter;
};

const listProducts = async ({ search = '', category = '', minPrice, maxPrice, sort = 'newest', page = 1, limit = 12 }) => {
  const filter = buildFilter({ search, category, minPrice, maxPrice });
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { price: 1, _id: 1 },
    price_desc: { price: -1, _id: 1 },
    rating: { ratings: -1, numReviews: -1 },
    name: { name: 1 },
  };
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sortMap[sort] || sortMap.newest).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    Product.countDocuments(filter),
  ]);
  return { items, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const getProductById = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid product id');
  const product = await Product.findOne({ _id: id, isActive: true }).lean();
  if (!product) throw createError(404, 'Product not found');
  return product;
};

const createProduct = async (payload) => Product.create(payload);
const updateProduct = async (id, payload) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid product id');
  const product = await Product.findByIdAndUpdate(id, payload, { returnDocument: 'after', runValidators: true });
  if (!product) throw createError(404, 'Product not found');
  return product;
};
const deleteProduct = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw createError(400, 'Invalid product id');
  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { returnDocument: 'after' });
  if (!product) throw createError(404, 'Product not found');
  return product;
};
const getCategories = async () => Product.distinct('category', { isActive: true });

const rateProduct = async ({ productId, userId, rating, comment = '' }) => {
  if (!mongoose.isValidObjectId(productId)) throw createError(400, 'Invalid product id');
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw createError(404, 'Product not found');
  const deliveredOrder = await Order.findOne({ user: userId, orderStatus: 'delivered', 'items.product': productId, returnStatus: { $in: ['none', 'rejected'] } }).select('_id');
  if (!deliveredOrder) throw createError(403, 'You can rate products only after a delivered purchase');

  await Review.findOneAndUpdate(
    { product: productId, user: userId },
    { $set: { rating, comment } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
  const [aggregate] = await Review.aggregate([{ $match: { product: new mongoose.Types.ObjectId(productId) } }, { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  product.ratings = Number((aggregate?.average || 0).toFixed(1));
  product.numReviews = aggregate?.count || 0;
  await product.save();
  return getProductById(productId);
};

module.exports = { listProducts, getProductById, createProduct, updateProduct, deleteProduct, getCategories, rateProduct };
