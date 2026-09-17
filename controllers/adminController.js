const Joi = require('joi');
const adminService = require('../services/adminService');

const listSchema = Joi.object({
  search: Joi.string().allow('').max(100).default(''),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

const dashboard = async (req, res, next) => {
  try { res.json({ success: true, data: await adminService.getDashboardStats() }); }
  catch (error) { next(error); }
};

const customers = async (req, res, next) => {
  try {
    const { value, error } = listSchema.validate(req.query);
    if (error) return res.status(400).json({ success: false, message: 'Invalid customer query', errors: error.details.map((d) => d.message) });
    res.json({ success: true, data: await adminService.listCustomers(value) });
  } catch (error) { next(error); }
};

const customer = async (req, res, next) => {
  try { res.json({ success: true, data: await adminService.getCustomer(req.params.id) }); }
  catch (error) { next(error); }
};

const status = async (req, res, next) => {
  try {
    const { value, error } = Joi.object({ isActive: Joi.boolean().required() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    const user = await adminService.updateCustomerStatus(req.params.id, value.isActive);
    res.json({ success: true, message: 'Customer status updated', data: { user } });
  } catch (error) { next(error); }
};

module.exports = { dashboard, customers, customer, status };
