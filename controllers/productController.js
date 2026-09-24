const Joi = require('joi');
const productService = require('../services/productService');
const { uploadProductImage, deleteProductImage } = require('../config/cloudinary');

const productSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().min(5).max(2000).required(),
  price: Joi.number().min(0).required(),
  category: Joi.string().trim().min(2).max(80).required(),
  image: Joi.string().uri().required(),
  imagePublicId: Joi.string().trim().max(255).allow(''),
  stock: Joi.number().integer().min(0).required(),
  brand: Joi.string().trim().max(80).allow(''),
  ratings: Joi.number().min(0).max(5),
  numReviews: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
});

const createSchema = productSchema;
const updateSchema = productSchema.fork(Object.keys(productSchema.describe().keys), (field) => field.optional()).min(1);
const ratingSchema = Joi.object({ rating: Joi.number().integer().min(1).max(5).required(), comment: Joi.string().trim().max(500).allow('') });

const cleanupImage = async (publicId) => {
  if (!publicId) return;
  try { await deleteProductImage(publicId); }
  catch (error) { console.error('Cloudinary cleanup failed:', error.message); }
};

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
  const uploadedPublicId = req.body?.imagePublicId;
  try {
    const { value, error } = createSchema.validate(req.body, { abortEarly: false });
    if (error) {
      await cleanupImage(uploadedPublicId);
      return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    }
    const product = await productService.createProduct(value);
    res.status(201).json({ success: true, message: 'Product created', data: { product } });
  } catch (error) {
    await cleanupImage(uploadedPublicId);
    next(error);
  }
};

const update = async (req, res, next) => {
  const uploadedPublicId = req.body?.imagePublicId;
  let existingImagePublicId = '';
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      await cleanupImage(uploadedPublicId);
      return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    }
    const existing = await productService.getProductById(req.params.id);
    existingImagePublicId = existing.imagePublicId || '';
    const product = await productService.updateProduct(req.params.id, value);
    if (existingImagePublicId && existingImagePublicId !== value.imagePublicId) await cleanupImage(existingImagePublicId);
    res.json({ success: true, message: 'Product updated', data: { product } });
  } catch (error) {
    if (uploadedPublicId && uploadedPublicId !== existingImagePublicId) await cleanupImage(uploadedPublicId);
    next(error);
  }
};

const uploadImage = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Please select an image file' });
    const result = await uploadProductImage(req.file.buffer);
    res.status(201).json({ success: true, message: 'Image uploaded successfully', data: { imageUrl: result.secure_url, publicId: result.public_id } });
  } catch (error) {
    next(error);
  }
};

const deleteUploadedImage = async (req, res, next) => {
  try {
    const publicId = String(req.body?.publicId || '').trim();
    if (!publicId || publicId.length > 255) return res.status(400).json({ success: false, message: 'A valid image public ID is required' });
    await deleteProductImage(publicId);
    res.json({ success: true, message: 'Uploaded image removed' });
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

const rate = async (req, res, next) => {
  try {
    const { value, error } = ratingSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Rating must be an integer from 1 to 5', errors: error.details.map((item) => item.message) });
    const product = await productService.rateProduct({ productId: req.params.id, userId: req.user._id, ...value });
    res.json({ success: true, message: 'Rating saved', data: { product } });
  } catch (error) { next(error); }
};

module.exports = { list, getOne, create, update, uploadImage, deleteUploadedImage, remove, categories, rate };
