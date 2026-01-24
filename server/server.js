/**
 * Only Used Tesla — Embedded Payments Demo Server
 *
 * This server demonstrates the Stripe pieces your backend dev needs:
 * - Create a PaymentIntent for the selected ad package (server calculates amount)
 * - Update the PaymentIntent amount when the package changes
 *
 * IMPORTANT: Never trust totals from the browser. Always look up prices server-side.
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

// Simple server-side price table (replace with DB / Stripe Prices later)
const PLANS = {
  standard: { name: "Standard", amount: 4900, currency: "usd" },
  pro: { name: "Pro", amount: 8900, currency: "usd" },
  max: { name: "Max", amount: 14900, currency: "usd" },
};

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * Create PaymentIntent
 * Body: { plan: "standard"|"pro"|"max", email, listing: { vin, model, year, zip, state } }
 * Returns: { clientSecret, paymentIntentId }
 */
app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { plan, email, listing } = req.body || {};
    const selected = PLANS[plan];

    if (!selected) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // Put what you need for fulfillment & support into metadata (keep it small).
    const metadata = {
      plan,
      listing_vin: listing?.vin || "",
      listing_model: listing?.model || "",
      listing_year: listing?.year || "",
      listing_zip: listing?.zip || "",
      listing_state: listing?.state || "",
      buyer_email: email || "",
    };

    const intent = await stripe.paymentIntents.create({
      amount: selected.amount,
      currency: selected.currency,
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
 * Body: { paymentIntentId, plan }
 * Returns: { ok: true }
 */
app.post("/api/update-payment-intent", async (req, res) => {
  try {
    const { paymentIntentId, plan } = req.body || {};
    const selected = PLANS[plan];

    if (!paymentIntentId) return res.status(400).json({ error: "Missing paymentIntentId" });
    if (!selected) return res.status(400).json({ error: "Invalid plan" });

    await stripe.paymentIntents.update(paymentIntentId, {
      amount: selected.amount,
      metadata: { plan },
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
