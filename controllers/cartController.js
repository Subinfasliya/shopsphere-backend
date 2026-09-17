const Joi = require('joi');
const cartService = require('../services/cartService');

const itemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(99).required(),
});

const quantitySchema = Joi.object({
  quantity: Joi.number().integer().min(0).max(99).required(),
});

const get = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user._id);
    res.json({ success: true, data: { cart } });
  } catch (error) { next(error); }
};

const add = async (req, res, next) => {
  try {
    const { value, error } = itemSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const cart = await cartService.addItem(req.user._id, value.productId, value.quantity);
    res.json({ success: true, message: 'Item added to cart', data: { cart } });
  } catch (error) { next(error); }
};

const update = async (req, res, next) => {
  try {
    const { value, error } = quantitySchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const cart = await cartService.setItemQuantity(req.user._id, req.params.productId, value.quantity);
    res.json({ success: true, data: { cart } });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(req.user._id, req.params.productId);
    res.json({ success: true, data: { cart } });
  } catch (error) { next(error); }
};

const clear = async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(req.user._id);
    res.json({ success: true, data: { cart } });
  } catch (error) { next(error); }
};

module.exports = { get, add, update, remove, clear };
