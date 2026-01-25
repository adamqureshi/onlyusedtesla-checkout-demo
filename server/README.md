# Example server (Node/Express) — v4 (Video add-on)

This is a minimal example for embedded payments:

- Create PaymentIntent for plan (+ optional video add-on)
- Update PaymentIntent amount if plan or video add-on changes

## Install
```bash
cd server
npm install
```

## Configure
Copy `.env.example` to `.env` and set your Stripe secret key.

## Run
```bash
npm run dev
```

## Webhooks (recommended in production)
Use `payment_intent.succeeded` to reliably mark an ad as paid and queue it for review.
