const Joi = require('joi');
const wishlistService = require('../services/wishlistService');

const productSchema = Joi.object({ productId: Joi.string().required() });
const get = async (req, res, next) => { try { res.json({ success: true, data: { wishlist: await wishlistService.getWishlist(req.user._id) } }); } catch (e) { next(e); } };
const add = async (req, res, next) => { try { const { value, error } = productSchema.validate(req.body); if (error) return res.status(400).json({ success: false, message: 'Invalid productId' }); const wishlist = await wishlistService.add(req.user._id, value.productId); res.json({ success: true, message: 'Added to wishlist', data: { wishlist } }); } catch (e) { next(e); } };
const remove = async (req, res, next) => { try { const wishlist = await wishlistService.remove(req.user._id, req.params.productId); res.json({ success: true, message: 'Removed from wishlist', data: { wishlist } }); } catch (e) { next(e); } };
module.exports = { get, add, remove };
