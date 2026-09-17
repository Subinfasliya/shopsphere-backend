let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

const getBaseUrl = () => process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const parseResponse = async (response) => {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  return { response, data };
};

const getAccessToken = async () => {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60_000) return cachedAccessToken;

  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const { data } = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(data.error_description || 'Unable to authenticate with PayPal');
    error.status = response.status;
    error.paypal = data;
    throw error;
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(data.expires_in || 900) * 1000;
  return cachedAccessToken;
};

const paypalFetch = async (path, options = {}) => {
  const response = await fetch(`${getBaseUrl()}${path}`, options);
  const { data } = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(data.message || 'PayPal API request failed');
    error.status = response.status;
    error.paypal = data;
    throw error;
  }

  return data;
};

const paypalRequest = async (path, method, body, requestId) => {
  const accessToken = await getAccessToken();
  return paypalFetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
};

const createOrder = async ({ amount, currency, referenceId, description }) => paypalRequest(
  '/v2/checkout/orders',
  'POST',
  {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: referenceId,
      custom_id: referenceId,
      invoice_id: referenceId,
      description,
      amount: { currency_code: currency, value: amount.toFixed(2) },
    }],
    application_context: { user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' },
  },
  `shopsphere-${referenceId}-${Date.now()}`
);

const captureOrder = async (paypalOrderId) => paypalRequest(
  `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
  'POST',
  null,
  `shopsphere-capture-${paypalOrderId}-${Date.now()}`
);

const verifyWebhookSignature = async ({ headers, webhookEvent }) => {
  if (!process.env.PAYPAL_WEBHOOK_ID) return false;
  const accessToken = await getAccessToken();
  const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: webhookEvent,
    }),
  });
  return result.verification_status === 'SUCCESS';
};

module.exports = { createOrder, captureOrder, verifyWebhookSignature };
