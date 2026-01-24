# Example server (Node/Express)

This is a minimal example to help your backend dev implement **embedded payments** with Stripe Payment Element.

## 1) Install
```bash
cd server
npm install
```

## 2) Set env vars
Copy `.env.example` to `.env` and add your keys.

## 3) Run
```bash
npm run dev
```

Server runs on http://localhost:4242

## Endpoints

- POST `/api/create-payment-intent`
- POST `/api/update-payment-intent`

In production you should also implement webhooks (e.g. `payment_intent.succeeded`) to reliably mark the ad as paid and queue it for review.
