const recommendationService = require('../services/recommendationService');

const recommendations = async (req, res, next) => {
  try {
    const products = await recommendationService.getRecommendations(req.user._id);
    res.json({ success: true, data: { products } });
  } catch (error) {
    next(error);
  }
};

module.exports = { recommendations };
