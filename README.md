# Only Used Tesla — Checkout Demo v9 (Ad Preview + Pay, Media After Checkout)

This prototype adds a dedicated **Preview** step so sellers can see what their ad will look like **before payment** — even when photos/video are collected **after checkout**.

## Flow (mobile-first)
1. **Start** — Basic Ad ($27) + optional Cash Offer
2. **Details** — VIN + basics + summary (fast typing; media comes later)
3. **Add‑ons** — Reports, video add‑on, Facebook posting, SMS, etc.
4. **Preview** — Buyer-facing preview with a **photo placeholder**
5. **Pay** — Embedded Stripe Payment Element (demo placeholder)
6. **Upload** — Add photos (up to 50) + optional 1‑minute video after payment

## Why “Preview” works with “Media later”
- Photos/video uploads can slow down typing on some devices.
- This flow **lets the user pay quickly** with just the essentials.
- Preview is still useful because it confirms: **title, price, location, Autopilot/FSD, description**.

## Stripe (embedded, no redirect)
Use **Stripe Payment Element** with a server-created **PaymentIntent**:
- Server creates PaymentIntent with the total amount (base + add‑ons)
- Client receives `client_secret`
- Client mounts Payment Element in the Pay step

This demo shows where the Payment Element mounts (`#payment-element`).

---

### Files
- `index.html` — UI + steps
- `styles.css` — grayscale, fat-finger friendly styling
- `app.js` — state, validation, step logic, preview rendering
- `server/` — optional placeholder server notes (demo only)
