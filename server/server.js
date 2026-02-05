/**
 * Only Used Tesla — Embedded Payments Demo Server (v5 pricing)
 *
 * Base: Basic Ad $27
 * Add-ons:
 * - history: autocheck/carfax (+$20)
 * - videoAddon (+$20)
 * - fbMarketplace (+$25)
 * - fbGroups (0-5) * $10
 * - sms (+$5)
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

const PRICES = {
  base: 2700,
  history: 2000,      // autocheck OR carfax
  video: 2000,
  fbMarketplace: 2500,
  fbGroup: 1000,
  sms: 500
};

function computeTotalAmount(listing) {
  const addons = listing?.addons || {};
  const history = (addons.history || "none");

  let amount = PRICES.base;

  if (history === "autocheck" || history === "carfax") amount += PRICES.history;
  if (addons.videoAddon) amount += PRICES.video;
  if (addons.fbMarketplace) amount += PRICES.fbMarketplace;

  const groups = Math.max(0, Math.min(5, Number(addons.fbGroups || 0)));
  amount += groups * PRICES.fbGroup;

  if (addons.sms) amount += PRICES.sms;

  return { amount, currency: "usd" };
}

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * Create PaymentIntent
 * Body: { email, listing }
 * Returns: { clientSecret, paymentIntentId }
 */
app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { email, listing } = req.body || {};
    const { amount, currency } = computeTotalAmount(listing);

    const metadata = {
      buyer_email: email || "",
      listing_vin: listing?.vin || "",
      listing_model: listing?.model || "",
      listing_year: listing?.year || "",
      listing_zip: listing?.zip || "",
      listing_state: listing?.state || "",
      addons_history: String(listing?.addons?.history || "none"),
      addons_video: String(Boolean(listing?.addons?.videoAddon)),
      addons_fb_marketplace: String(Boolean(listing?.addons?.fbMarketplace)),
      addons_fb_groups: String(Number(listing?.addons?.fbGroups || 0)),
      addons_sms: String(Boolean(listing?.addons?.sms)),
      cash_offer: String(Boolean(listing?.addons?.cashOffer)),
      notify: String(listing?.notify || "email"),
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
 * Body: { paymentIntentId, listing }
 * Returns: { ok: true }
 */
app.post("/api/update-payment-intent", async (req, res) => {
  try {
    const { paymentIntentId, listing } = req.body || {};
    if (!paymentIntentId) return res.status(400).json({ error: "Missing paymentIntentId" });

    const { amount } = computeTotalAmount(listing);

    await stripe.paymentIntents.update(paymentIntentId, {
      amount,
      metadata: {
        addons_history: String(listing?.addons?.history || "none"),
        addons_video: String(Boolean(listing?.addons?.videoAddon)),
        addons_fb_marketplace: String(Boolean(listing?.addons?.fbMarketplace)),
        addons_fb_groups: String(Number(listing?.addons?.fbGroups || 0)),
        addons_sms: String(Boolean(listing?.addons?.sms)),
        notify: String(listing?.notify || "email"),
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
