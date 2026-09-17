const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const createError = require('../utils/createError');

const getWishlist = async (userId) => Wishlist.findOne({ user: userId }).populate('products', 'name image price category brand ratings stock isActive');

const add = async (userId, productId) => {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw createError(404, 'Product not found');
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: userId },
    { $addToSet: { products: product._id } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return wishlist.populate('products', 'name image price category brand ratings stock isActive');
};

const remove = async (userId, productId) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: userId },
    { $pull: { products: productId } },
    { returnDocument: 'after' }
  );
  if (!wishlist) return { products: [] };
  return wishlist.populate('products', 'name image price category brand ratings stock isActive');
};

module.exports = { getWishlist, add, remove };
