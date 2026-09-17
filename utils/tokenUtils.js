const crypto = require('crypto');

const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { randomToken, hashToken };
