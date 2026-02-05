# Example server (Node/Express) — v5 pricing

Minimal backend for embedded Stripe payment:

- Create PaymentIntent for **Basic Ad + add-ons**
- Update PaymentIntent amount when add-ons change

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

## Production notes
- Always compute totals server-side (never trust the browser).
- Implement Stripe webhooks (e.g. `payment_intent.succeeded`) to fulfill reliably.
