# Only Used Tesla — Checkout Demo v5 (Pricing + Add‑ons)

This prototype updates the flow to your new offer:

## Base package
- **Basic Ad — $27** (valid for 30 days)

## Add-ons
- **Vehicle history report** (radio):
  - None
  - AutoCheck +$20
  - CARFAX +$20
- **Video showcase** +$20 (1-minute max, optional; upload now or later)
- **Facebook Marketplace posting** +$25 (valid 7 days)
- **Facebook group posting** $10 per group (0–5 groups)
- **Text notifications** +$5 (requires phone + OTP verification in UI)
- **Notify me when live** (radio): Email / Text / Both (Text requires verified phone)

## Stripe (embedded)
This demo includes scaffolding for:
- Stripe.js + **Payment Element**
- PaymentIntent create/update endpoints (`/api/create-payment-intent`, `/api/update-payment-intent`)

> If no Stripe publishable key is set, the demo simulates payment.

## Notes
- VIN validation: 17 chars, excludes I/O/Q
- Video validation: <= 60 seconds, <= 200MB (adjustable in `app.js`)
- OTP is a demo flow: code is shown in a toast as **123456**


## Listing attribute
- **Full Self‑Driving (FSD)**: Not included / Subscription / Paid upfront (stays with car)


## UX change (v7)
- Photos & video are collected **after checkout** (optional) to keep the listing form fast on mobile.
- Supports up to **50 photos** in the demo counter.
