const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, lowercase: true, index: true },
    image: { type: String, required: true, trim: true },
    imagePublicId: { type: String, trim: true, default: '' },
    stock: { type: Number, required: true, min: 0, default: 0 },
    brand: { type: String, trim: true, default: '' },
    ratings: { type: Number, min: 0, max: 5, default: 0 },
    numReviews: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
