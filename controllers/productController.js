const Joi = require('joi');
const productService = require('../services/productService');

const productSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().min(5).max(2000).required(),
  price: Joi.number().min(0).required(),
  category: Joi.string().trim().min(2).max(80).required(),
  image: Joi.string().uri().required(),
  stock: Joi.number().integer().min(0).required(),
  brand: Joi.string().trim().max(80).allow(''),
  ratings: Joi.number().min(0).max(5),
  numReviews: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
});

const createSchema = productSchema;
const updateSchema = productSchema.fork(Object.keys(productSchema.describe().keys), (field) => field.optional()).min(1);

const list = async (req, res, next) => {
  try {
    const data = await productService.listProducts(req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json({ success: true, data: { product } });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { value, error } = createSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const product = await productService.createProduct(value);
    res.status(201).json({ success: true, message: 'Product created', data: { product } });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    const product = await productService.updateProduct(req.params.id, value);
    res.json({ success: true, message: 'Product updated', data: { product } });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await productService.deleteProduct(req.params.id);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

const categories = async (req, res, next) => {
  try {
    const data = await productService.getCategories();
    res.json({ success: true, data: { categories: data } });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, getOne, create, update, remove, categories };
