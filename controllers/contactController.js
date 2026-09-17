const Joi = require('joi');
const contactService = require('../services/contactService');

const schema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().required(),
  subject: Joi.string().trim().min(3).max(150).required(),
  message: Joi.string().trim().min(10).max(3000).required(),
});

const submit = async (req, res, next) => {
  try {
    const { value, error } = schema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map((d) => d.message) });
    await contactService.submit(value);
    res.status(202).json({ success: true, message: 'Message received. Our support team will respond soon.' });
  } catch (error) { next(error); }
};
module.exports = { submit };
