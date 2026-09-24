const normalizePaypalCurrency = (value) => {
  const currency = String(value || 'USD').trim().toUpperCase();
  return currency === 'IND' ? 'INR' : currency;
};

module.exports = { normalizePaypalCurrency };