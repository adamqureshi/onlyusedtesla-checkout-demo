# Only Used Tesla — Demo v4 (Video + Embedded Payments)

This prototype adds a **1-minute video upload** option to the listing flow and treats video as an optional **paid add-on**.

## UX behavior

- Step 2 includes **Media tabs**: Photos / Video (1 minute)
- Video is optional, but if the user uploads a video, the **Video showcase add-on** is auto-enabled (because you’ll be storing/processing it)
- The payment screen shows a clear order list:
  - Ad package
  - Optional video add-on (+$19)
  - Total

## Why charge for video?

Even if storage itself is cheap, the real costs are usually:
- Bandwidth / CDN delivery
- Transcoding (to web-friendly formats + multiple bitrates)
- Moderation / safety review + support overhead

Charging a small add-on (or bundling into higher tiers) keeps it sustainable.

## Can we record video from iPhone on the web?

Yes, **mostly**:
- `<input type="file" accept="video/*" capture="environment">` will prompt iPhone users to record video or pick from their library.
- You cannot reliably force “exactly 60 seconds” during recording in mobile Safari, so you validate **after selection** (this demo rejects >60s).
- For full custom recording UI, you’d look at `MediaRecorder`, but iOS support can be inconsistent. Starting with file input is the simplest + most reliable.

## Stripe product for embedded payments

Use **Stripe Elements (Payment Element)** + **PaymentIntents**.

This demo expects:
- `POST /api/create-payment-intent` -> returns `{ clientSecret, paymentIntentId }`
- `POST /api/update-payment-intent` -> updates amount when plan/video changes

See `/server` for a minimal Node example.
