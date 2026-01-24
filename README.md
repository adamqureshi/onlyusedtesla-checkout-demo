# Only Used Tesla — Embedded Payments Checkout Demo (v3)

This is a **UI prototype** of a fast mobile checkout flow that keeps the user **inside your site** for payment.

## Recommended Stripe product for this UX

Use **Stripe Elements (Payment Element)** with the **Payment Intents API**.

Why:
- You control the **order summary** and the “Change package” UX
- The payment form is embedded **inside your app**
- Stripe still handles sensitive payment details through Stripe.js

## Backend endpoints expected

- `POST /api/create-payment-intent`
  - Input: `{ plan, email, listing }`
  - Output: `{ clientSecret, paymentIntentId }`

- `POST /api/update-payment-intent`
  - Input: `{ paymentIntentId, plan }`
  - Output: `{ ok }`

> Important: amounts must be calculated on the server. Don’t trust totals from the browser.

## How to enable real Stripe Payment Element in this demo

1. Put your Stripe publishable key into `index.html`:
   ```js
   window.ONLYUSEDTESLA_STRIPE_PK = "pk_test_...";
   ```

2. Run the example server in `/server` and make sure it exposes:
   - `/api/create-payment-intent`
   - `/api/update-payment-intent`

3. Open the demo and go to Step 4 — the Payment Element mounts automatically.

## Files

- `index.html` — checkout UI and mount points for Stripe Elements
- `styles.css` — grayscale, mobile-friendly styling
- `app.js` — step flow + VIN validation + Stripe mount scaffolding
- `/server` — example Node server (PaymentIntent create/update)

## Notes

Some payment methods (and 3DS authentication) may redirect for confirmation depending on the customer’s bank and payment method. For cards, the flow typically completes inline.
