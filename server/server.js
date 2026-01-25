/**
 * Only Used Tesla — Embedded Payments Demo Server (v4)
 *
 * Adds an optional "videoAddon" that affects the payment amount.
 *
 * IMPORTANT:
 * - Never trust totals from the browser. Always compute amounts server-side.
 * - In production, implement Stripe webhooks to fulfill the order reliably.
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());

const ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: ORIGIN }));

const PLANS = {
  standard: { name: "Standard", amount: 4900, currency: "usd" },
  pro: { name: "Pro", amount: 8900, currency: "usd" },
  max: { name: "Max", amount: 14900, currency: "usd" },
};

const VIDEO_ADDON = { name: "Video showcase", amount: 1900 };

function computeTotalAmount({ plan, videoAddon }) {
  const p = PLANS[plan];
  if (!p) throw new Error("Invalid plan");

  let amount = p.amount;
  if (videoAddon) amount += VIDEO_ADDON.amount;
  return { amount, currency: p.currency };
}

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * Create PaymentIntent
 * Body: { plan, videoAddon, email, listing }
 * Returns: { clientSecret, paymentIntentId }
 */
app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { plan, videoAddon, email, listing } = req.body || {};
    const { amount, currency } = computeTotalAmount({ plan, videoAddon: Boolean(videoAddon) });

    const metadata = {
      plan: String(plan),
      videoAddon: String(Boolean(videoAddon)),
      listing_vin: listing?.vin || "",
      listing_model: listing?.model || "",
      listing_year: listing?.year || "",
      listing_zip: listing?.zip || "",
      listing_state: listing?.state || "",
      buyer_email: email || "",
    };

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Update PaymentIntent amount
 * Body: { paymentIntentId, plan, videoAddon }
 * Returns: { ok: true }
 */
app.post("/api/update-payment-intent", async (req, res) => {
  try {
    const { paymentIntentId, plan, videoAddon } = req.body || {};
    if (!paymentIntentId) return res.status(400).json({ error: "Missing paymentIntentId" });

    const { amount } = computeTotalAmount({ plan, videoAddon: Boolean(videoAddon) });

    await stripe.paymentIntents.update(paymentIntentId, {
      amount,
      metadata: {
        plan: String(plan),
        videoAddon: String(Boolean(videoAddon)),
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

const port = process.env.PORT || 4242;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
