const { sendContactEmail } = require('./emailService');

const submit = async ({ name, email, subject, message }) => sendContactEmail({ name, email, subject, message });
module.exports = { submit };
