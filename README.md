# ShopSphere E-Commerce Backend

Production-oriented Node.js + Express + MongoDB backend for the MERN e-commerce assignment.

## Features

- HttpOnly access + refresh cookie sessions with refresh-token rotation
- Server-side authentication state; no access token in localStorage
- CSRF protection for state-changing browser requests
- bcryptjs password hashing
- Email password reset with short-lived, one-time hashed reset tokens
- MongoDB cart persisted per authenticated user
- Server-authoritative pricing, stock checks and order snapshots
- Cash-on-delivery checkout
- PayPal Checkout using PayPal Orders API + capture flow
- Optional PayPal webhook signature verification
- Admin/user role authorization
- Product CRUD, search, filtering, sorting, pagination
- Hugging Face recommendation service with deterministic fallback
- Helmet, CORS, rate limiting, centralized errors and graceful shutdown

## Setup

```bash
npm install
copy .env.example .env
npm run seed
npm run dev
```

## Authentication endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password/:token`

The browser receives session cookies marked HttpOnly. The refresh token is stored hashed in MongoDB and rotated on refresh.

## Cart endpoints

- `GET /api/v1/cart`
- `POST /api/v1/cart/items`
- `PATCH /api/v1/cart/items/:productId`
- `DELETE /api/v1/cart/items/:productId`
- `DELETE /api/v1/cart`

## Checkout and PayPal

- `POST /api/v1/orders/cod`
- `POST /api/v1/orders/paypal/create`
- `POST /api/v1/orders/paypal/:paypalOrderId/capture`
- `POST /api/v1/orders/paypal/:paypalOrderId/cancel`
- `POST /api/v1/paypal/webhook`

The final PayPal amount is calculated on the server from the MongoDB cart, not from a browser-supplied price. The app catalog remains INR while PayPal uses configurable `PAYPAL_CURRENCY` and `INR_TO_PAYPAL_RATE`; this is necessary because PayPal's current currency list does not include INR and PayPal states that domestic INR receiving in India is unavailable. See PayPal's current currency documentation.

## Demo admin

```text
Email: admin@example.com
Password: Admin@12345
```

Change this before production.
