const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const createError = require('../utils/createError');

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
};

const getCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  return cart.populate('items.product', 'name image price stock category brand isActive');
};

const addItem = async (userId, productId, quantity = 1) => {
  if (!mongoose.isValidObjectId(productId)) throw createError(400, 'Invalid product id');
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw createError(404, 'Product not found');

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw createError(400, 'Quantity must be between 1 and 99');

  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((entry) => entry.product.toString() === productId.toString());
  const nextQuantity = (item?.quantity || 0) + qty;

  if (nextQuantity > product.stock) throw createError(400, `Only ${product.stock} units are available for ${product.name}`);

  if (item) item.quantity = nextQuantity;
  else cart.items.push({ product: product._id, quantity: qty });

  await cart.save();
  return getCart(userId);
};

const setItemQuantity = async (userId, productId, quantity) => {
  if (!mongoose.isValidObjectId(productId)) throw createError(400, 'Invalid product id');
  const qty = Number(quantity);
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((entry) => entry.product.toString() === productId.toString());
  if (!item) throw createError(404, 'Cart item not found');

  if (qty <= 0) {
    cart.items = cart.items.filter((entry) => entry.product.toString() !== productId.toString());
  } else {
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) throw createError(404, 'Product not found');
    if (qty > product.stock) throw createError(400, `Only ${product.stock} units are available for ${product.name}`);
    if (qty > 99) throw createError(400, 'Maximum quantity is 99');
    item.quantity = qty;
  }

  await cart.save();
  return getCart(userId);
};

const removeItem = async (userId, productId) => {
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((entry) => entry.product.toString() !== productId.toString());
  await cart.save();
  return getCart(userId);
};

const clearCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();
  return cart.populate('items.product', 'name image price stock category brand isActive');
};

module.exports = { getCart, addItem, setItemQuantity, removeItem, clearCart };
