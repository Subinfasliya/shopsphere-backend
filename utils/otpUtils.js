const crypto = require('crypto');

const createOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

module.exports = { createOtp, hashOtp };
