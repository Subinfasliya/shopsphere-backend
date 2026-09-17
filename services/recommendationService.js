const { InferenceClient } = require('@huggingface/inference');
const Product = require('../models/Product');
const Order = require('../models/Order');

const cosineSimilarity = (a, b) => {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / ((Math.sqrt(normA) * Math.sqrt(normB)) || 1);
};

const productText = (product) =>
  `${product.name}. ${product.description}. ${product.category}. ${product.brand || ''}`.slice(0, 1800);

const fallbackRecommendations = async (userId) => {
  const latest = await Order.findOne({ user: userId })
    .sort({ createdAt: -1 })
    .populate('items.product', 'category');

  if (!latest?.items?.length) {
    return Product.find({ isActive: true })
      .sort({ ratings: -1, numReviews: -1, createdAt: -1 })
      .limit(6);
  }

  const categories = latest.items.map((item) => item.product?.category).filter(Boolean);
  return Product.find({
    isActive: true,
    category: { $in: categories },
  })
    .sort({ ratings: -1, numReviews: -1, createdAt: -1 })
    .limit(6);
};

const getRecommendations = async (userId) => {
  const fallback = await fallbackRecommendations(userId);
  if (!process.env.HUGGINGFACE_API_KEY || fallback.length < 2) return fallback;

  try {
    const client = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
    const source = fallback[0];
    const candidates = await Product.find({
      isActive: true,
      _id: { $nin: fallback.map((p) => p._id) },
    }).limit(40);

    if (!candidates.length) return fallback;

    const inputs = [productText(source), ...candidates.map(productText)];
    const raw = await client.featureExtraction({
      model: process.env.HUGGINGFACE_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
      inputs,
    });

    const vectors = Array.isArray(raw) ? raw.map((item) => {
      if (Array.isArray(item)) return Array.isArray(item[0]) ? item[0] : item;
      return item;
    }) : [];

    if (vectors.length !== inputs.length || !Array.isArray(vectors[0])) return fallback;

    const sourceVector = vectors[0];
    const scored = candidates.map((product, index) => ({
      product,
      score: cosineSimilarity(sourceVector, vectors[index + 1] || []),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.product);
  } catch (error) {
    console.warn('Hugging Face recommendation failed; using fallback recommendations:', error.message);
    return fallback;
  }
};

module.exports = { getRecommendations };
