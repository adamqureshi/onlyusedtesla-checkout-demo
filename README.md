# Only Used Tesla — Checkout Flow Demo (Mobile) v2

This is a **UI-only** prototype of a fast, “fat finger” friendly **ad checkout flow** for OnlyUsedTesla.com.

## What changed in v2

- ✅ **VIN is now required** (17 characters)
- ✅ VIN input is **spaced out automatically** for readability (4-4-4-5)
- ✅ Clear **success (green ring) / error (red ring)** validation for VIN
- ✅ Added **Preview your ad** step before payment
- ✅ Updated final message: **“queued for a brief review”** before the ad goes live

## Steps

1) Type  
2) Details (VIN + listing details)  
3) Preview (ad preview + package selection)  
4) Pay & publish (Stripe handoff UI)  
5) Publish (submitted + queued for review)

## How to run

Open `index.html` or run:

```bash
python3 -m http.server 8080
```

## Stripe integration (backend hook)

Replace the simulated redirect in `app.js` inside `simulateStripeRedirect()` with:

1. POST payload to backend
2. Backend creates Stripe Checkout Session
3. Redirect to `session.url`
