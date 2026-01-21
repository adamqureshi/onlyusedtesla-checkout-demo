# Only Used Tesla — Checkout Flow Demo (Mobile)

This is a **UI-only** prototype of a fast, “fat finger” friendly ad checkout flow for OnlyUsedTesla.com.

## What this demo shows

- A simple **5-step flow** with a progress pill:
  1) Type  
  2) Details  
  3) Boost  
  4) Pay  
  5) Done

- **Passwordless by default** (magic link copy is included).  
  In this demo, we collect email at checkout and assume you’ll email a sign-in link after purchase.

- **Mobile-first** UX:
  - Large tap targets (min 52px)
  - Sticky bottom “Next” button
  - Simple, professional, friendly validation

- **Summary character counter** + live validation:
  - Summary becomes **green** when it’s “good” (≥ 50 characters)
  - Friendly error messaging when it’s too short

## How to run

### Option A (quick)
Open `index.html` in your browser.

### Option B (recommended)
Run a tiny local server to avoid file URL edge cases:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`

## Stripe integration (where your backend dev plugs in)

This prototype **does not** call Stripe. It simulates a redirect in `app.js`.

In production, replace `simulateStripeRedirect()` with your real flow:

1. Send payload to backend: listing details + selected plan
2. Backend creates **Stripe Checkout Session**
3. Frontend redirects to `session.url`

> This demo’s UI is intended to help your backend developer implement the screens and states quickly.

## Notes on tone

Copy is intentionally:
- Happy + professional + mature
- Clear and not robotic
- Positive validation (“You’re doing great…”) and respectful errors

## Files

- `index.html` — the single-page prototype
- `styles.css` — grayscale, accessible, mobile-first styling
- `app.js` — step navigation, validation, counters, demo persistence
