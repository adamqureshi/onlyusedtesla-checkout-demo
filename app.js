/**
 * Only Used Tesla — Checkout Demo (Embedded Payments)
 * ---------------------------------------------------
 * This is a UI prototype that shows how embedded Stripe payments would look.
 *
 * Stripe product recommended for this UX:
 * - Stripe Elements (Payment Element) + PaymentIntents API (server)
 *
 * What this demo does:
 * - Builds the order summary UI and allows editing the package on the payment screen.
 * - If you provide a Stripe publishable key + backend endpoints, it will mount Payment Element.
 *
 * Back-end endpoints expected (examples included in /server):
 * - POST /api/create-payment-intent  -> { clientSecret, paymentIntentId }
 * - POST /api/update-payment-intent  -> { ok }
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEY = "out_checkout_demo_v3";

  const plans = {
    standard: { name: "Standard", days: 7, price: 49, amount: 4900 },
    pro: { name: "Pro", days: 14, price: 89, amount: 8900 },
    max: { name: "Max", days: 30, price: 149, amount: 14900 },
  };

  const state = {
    step: 1,
    listingType: "sell",
    fields: {
      listOnSite: true,
      boostWithAd: true,
      cashOffer: false,

      vin: "",
      model: "",
      year: "",
      miles: "",
      price: "",
      zip: "",
      state: "",
      autopilot: false,
      summary: "",

      plan: "standard",

      email: "",
      magicLink: true,
    },
  };

  // Stripe runtime state (only used if configured)
  let stripe = null;
  let elements = null;
  let paymentElement = null;
  let paymentIntentId = null;
  let clientSecret = null;
  let stripeReady = false;
  let stripeMounted = false;

  // ----------- Restore / persist -----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        state.step = saved.step ?? state.step;
        state.listingType = saved.listingType ?? state.listingType;
        state.fields = { ...state.fields, ...(saved.fields || {}) };
      }
    } catch (e) {}
  }

  let toastTimer = null;
  function showToast(msg = "Saved") {
    const toast = $("[data-toast]");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 1200);
  }

  function save(show = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (show) showToast("Saved");
    } catch (e) {}
  }

  function resetDraft() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  // ----------- Step navigation -----------
  function setStep(nextStep) {
    state.step = Math.max(1, Math.min(5, nextStep));

    $$("[data-step]").forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.step) === state.step);
    });

    // Back button
    const backBtn = $("[data-back]");
    backBtn.disabled = state.step === 1;

    // Stepper
    $$("[data-step-index]").forEach((el) => {
      const i = Number(el.dataset.stepIndex);
      el.classList.toggle("is-active", i === state.step);
      el.classList.toggle("is-complete", i < state.step);
    });

    // Update CTA hint
    $$("[data-cta-hint]").forEach((el) => {
      el.textContent = `Step ${state.step} of 5 — ${hintForStep(state.step)}`;
    });

    updateSummaryCounter();
    updateAdPreview();
    updateOrder();
    updatePlanDialogSelection();

    save(false);
    window.scrollTo({ top: 0, behavior: "instant" });

    // If we land on step 4, attempt to mount Stripe Payment Element (if configured)
    if (state.step === 4) {
      ensureStripeMounted().catch(() => {});
    }
  }

  function hintForStep(step) {
    switch (step) {
      case 1: return "You’re off to a great start.";
      case 2: return "You’re doing great. Keep it simple.";
      case 3: return "Quick preview before payment.";
      case 4: return "You’re still on Only Used Tesla.";
      case 5: return "Submitted. Nice work.";
      default: return "";
    }
  }

  // ----------- Validation helpers -----------
  function setFieldState(validateKey, ok, message = "") {
    const fieldWrap = $(`[data-validate="${validateKey}"]`);
    if (!fieldWrap) return;

    fieldWrap.classList.toggle("is-valid", ok);
    fieldWrap.classList.toggle("is-invalid", !ok);

    const msgEl = $("[data-msg]", fieldWrap);
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldState(validateKey) {
    const fieldWrap = $(`[data-validate="${validateKey}"]`);
    if (!fieldWrap) return;
    fieldWrap.classList.remove("is-valid", "is-invalid");
    const msgEl = $("[data-msg]", fieldWrap);
    if (msgEl) msgEl.textContent = "";
  }

  function isEmailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  // VIN: 17 chars, digits + capital letters except I, O, Q.
  function normalizeVin(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function isVinValid(vinRaw) {
    const vin = normalizeVin(vinRaw);
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
  }

  // Display spacing: 4-4-4-5
  function formatVinDisplay(vinRaw) {
    const vin = normalizeVin(vinRaw).slice(0, 17);
    const parts = [];
    parts.push(vin.slice(0, 4));
    parts.push(vin.slice(4, 8));
    parts.push(vin.slice(8, 12));
    parts.push(vin.slice(12, 17));
    return parts.filter(Boolean).join(" ");
  }

  function validateStep(step) {
    let ok = true;

    if (step === 2) {
      const f = state.fields;

      // VIN required
      const vin = normalizeVin(f.vin);
      if (!vin) { ok = false; setFieldState("vin", false, "Please enter your VIN (17 characters)."); }
      else if (vin.length !== 17) { ok = false; setFieldState("vin", false, "VINs are 17 characters — almost there."); }
      else if (!isVinValid(vin)) { ok = false; setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use the letters I, O, or Q."); }
      else { setFieldState("vin", true, ""); }

      // Required: model
      if (!String(f.model).trim()) { ok = false; setFieldState("model", false, "Please choose a model."); }
      else setFieldState("model", true, "");

      // Required: year
      if (!String(f.year).trim()) { ok = false; setFieldState("year", false, "Please choose a year."); }
      else setFieldState("year", true, "");

      // Required: price
      if (!String(f.price).trim() || Number(f.price) <= 0) { ok = false; setFieldState("price", false, "Please add a price (numbers only)."); }
      else setFieldState("price", true, "");

      // Required: zip
      const zip = String(f.zip).trim();
      if (!zip || zip.length < 5) { ok = false; setFieldState("zip", false, "Please enter a valid ZIP code."); }
      else setFieldState("zip", true, "");

      // Required: state
      if (!String(f.state).trim()) { ok = false; setFieldState("state", false, "Please choose a state."); }
      else setFieldState("state", true, "");

      // Required: summary (min 50 chars)
      const summary = String(f.summary || "");
      if (summary.trim().length < 50) { ok = false; setFieldState("summary", false, "Add a bit more detail — at least 50 characters."); }
      else if (summary.length > 500) { ok = false; setFieldState("summary", false, "Please keep the summary under 500 characters."); }
      else setFieldState("summary", true, "");
    }

    if (step === 4) {
      const email = String(state.fields.email || "").trim();
      if (!isEmailValid(email)) { ok = false; setFieldState("email", false, "Please enter a valid email address."); }
      else setFieldState("email", true, "");
    }

    return ok;
  }

  // ----------- UI updates -----------
  function updateSummaryCounter() {
    const max = 500;
    const summary = String(state.fields.summary || "");
    const countEl = $("[data-summary-count]");
    const maxEl = $("[data-summary-max]");
    if (countEl) countEl.textContent = String(summary.length);
    if (maxEl) maxEl.textContent = String(max);
  }

  function maskedVinForPreview(vinRaw) {
    const vin = normalizeVin(vinRaw);
    if (!vin) return "VIN —";
    if (vin.length < 6) return `VIN ${vin}`;
    const last6 = vin.slice(-6);
    return `VIN •••••••••••${last6}`;
  }

  function updateAdPreview() {
    const f = state.fields;

    const title = `${f.year || "—"} ${f.model || "Tesla"}${f.autopilot ? " · Autopilot" : ""}`;
    const subParts = [];
    if (f.price) subParts.push(`$${Number(f.price).toLocaleString()}`);
    if (f.zip) subParts.push(f.zip);
    if (f.state) subParts.push(f.state);
    const sub = subParts.length ? subParts.join(" · ") : "—";
    const body = String(f.summary || "").trim() || "—";

    const titleEl = $("[data-ad-title]");
    const subEl = $("[data-ad-sub]");
    const bodyEl = $("[data-ad-body]");
    const vinEl = $("[data-ad-vin]");
    const apEl = $("[data-ad-ap]");

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
    if (bodyEl) bodyEl.textContent = body;
    if (vinEl) vinEl.textContent = maskedVinForPreview(f.vin);
    if (apEl) apEl.textContent = f.autopilot ? "Autopilot On" : "Autopilot Off";
  }

  function updateOrder() {
    const plan = plans[state.fields.plan] || plans.standard;

    const planEl = $("[data-order-plan]");
    const planSubEl = $("[data-order-plan-sub]");
    const priceEl = $("[data-order-price]");
    const totalEl = $("[data-order-total]");
    const receiptPlanEl = $("[data-receipt-plan]");
    const receiptTotalEl = $("[data-receipt-total]");

    if (planEl) planEl.textContent = plan.name;
    if (planSubEl) planSubEl.textContent = `${plan.days} days`;
    if (priceEl) priceEl.textContent = `$${plan.price.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${plan.price.toFixed(2)}`;
    if (receiptPlanEl) receiptPlanEl.textContent = plan.name;
    if (receiptTotalEl) receiptTotalEl.textContent = `$${plan.price.toFixed(2)}`;

    // Update pay button label (optional clarity)
    const payBtn = $("[data-pay]");
    if (payBtn && state.step === 4) {
      payBtn.textContent = `Pay $${plan.price.toFixed(0)} & submit for review`;
    }
  }

  function setListingType(choice) {
    state.listingType = choice;
    $$("[data-choice]").forEach((btn) => {
      const selected = btn.dataset.choice === choice;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });
    save(true);
  }

  function setPlan(planKey) {
    if (!plans[planKey]) return;
    state.fields.plan = planKey;

    // Step 3 package cards
    $$("[data-plan]").forEach((btn) => {
      const selected = btn.dataset.plan === planKey;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });

    updateOrder();
    updatePlanDialogSelection();
    save(true);
  }

  function updatePlanDialogSelection() {
    $$("[data-plan-dialog-choice]").forEach((btn) => {
      const selected = btn.dataset.planDialogChoice === state.fields.plan;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });
  }

  // ----------- Embedded Stripe (Payment Element) scaffolding -----------
  function apiBase() {
    return (window.ONLYUSEDTESLA_API_BASE || "").replace(/\/$/, "");
  }

  function stripePk() {
    return String(window.ONLYUSEDTESLA_STRIPE_PK || "").trim();
  }

  function setStripeError(msg) {
    const el = $("[data-stripe-error]");
    if (el) el.textContent = msg || "";
  }

  function showPaymentShell(showReal) {
    const placeholder = $("[data-payment-placeholder]");
    const shell = $("[data-payment-shell]");
    if (!placeholder || !shell) return;

    placeholder.hidden = Boolean(showReal);
    shell.hidden = !Boolean(showReal);
  }

  function listingSnapshotForMetadata() {
    const f = state.fields;
    return {
      vin: normalizeVin(f.vin),
      model: String(f.model || ""),
      year: String(f.year || ""),
      zip: String(f.zip || ""),
      state: String(f.state || ""),
    };
  }

  async function createPaymentIntent(planKey) {
    const plan = plans[planKey] || plans.standard;

    const res = await fetch(`${apiBase()}/api/create-payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: planKey,
        email: String(state.fields.email || "").trim(),
        listing: listingSnapshotForMetadata(),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Unable to create PaymentIntent");
    }

    const data = await res.json();
    if (!data.clientSecret) throw new Error("Missing clientSecret from server");
    return data;
  }

  async function updatePaymentIntent(planKey) {
    if (!paymentIntentId) return;

    const res = await fetch(`${apiBase()}/api/update-payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentIntentId,
        plan: planKey,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Unable to update PaymentIntent");
    }

    return await res.json();
  }

  async function ensureStripeMounted() {
    // Only mount once per session (unless you rebuild it)
    if (stripeMounted) return;

    const pk = stripePk();
    if (!pk) {
      // Not configured: stay in placeholder mode
      showPaymentShell(false);
      return;
    }

    if (!window.Stripe) {
      showPaymentShell(false);
      setStripeError("Stripe.js didn’t load. Please check your network and script tag.");
      return;
    }

    try {
      showPaymentShell(true);
      setStripeError("");

      // Create a PaymentIntent (server-side) and get the client secret.
      const created = await createPaymentIntent(state.fields.plan);
      paymentIntentId = created.paymentIntentId || null;
      clientSecret = created.clientSecret;

      // Initialize Stripe.js + Elements
      stripe = window.Stripe(pk);
      const appearance = {
        theme: "stripe",
        variables: {
          colorText: "#0f1215",
          colorDanger: "#cf2e2e",
          borderRadius: "16px",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        },
      };

      elements = stripe.elements({ clientSecret, appearance });
      paymentElement = elements.create("payment", { layout: "tabs" });
      paymentElement.mount("#payment-element");

      stripeReady = true;
      stripeMounted = true;
    } catch (err) {
      // Fall back to placeholder with a clear message
      stripeReady = false;
      stripeMounted = false;
      showPaymentShell(false);
      setStripeError("");
      console.warn(err);
    }
  }

  async function refreshStripeAmountAfterPlanChange(planKey) {
    if (!stripeReady || !elements) return;

    try {
      setStripeError("");

      // Update PaymentIntent amount server-side (don’t trust client totals).
      await updatePaymentIntent(planKey);

      // If you update the PaymentIntent, fetch updates so Elements reflects server state.
      // See Stripe docs: elements.fetchUpdates()
      await elements.fetchUpdates();
    } catch (err) {
      console.warn(err);
      setStripeError("We couldn’t update the total just now. Please try again.");
    }
  }

  async function payWithStripeIfConfigured() {
    // If Stripe isn't configured, we simulate a successful payment for demo purposes.
    if (!stripeReady || !stripe || !elements || !clientSecret) {
      await simulatePayment();
      return;
    }

    setStripeError("");

    // Confirm payment. Some payment methods may redirect for authentication.
    // For card payments, this typically completes inline.
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // In production, use a dedicated success URL that can restore state.
        return_url: window.location.href.split("?")[0] + "?success=1",
      },
      redirect: "if_required",
    });

    if (error) {
      setStripeError(error.message || "Payment didn’t go through. Please try again.");
      return;
    }

    // If no redirect happened, you can optionally retrieve the intent to verify status.
    try {
      const result = await stripe.retrievePaymentIntent(clientSecret);
      const pi = result && result.paymentIntent;
      if (pi && (pi.status === "succeeded" || pi.status === "processing")) {
        setStep(5);
        stampReference();
        return;
      }
      // If requires_action etc, Stripe may have handled it. If still not succeeded, show a gentle note.
      setStripeError("Almost there — please follow any additional steps to complete payment.");
    } catch (e) {
      // If retrieval fails, still allow UI progression in demo.
      setStep(5);
      stampReference();
    }
  }

  function stampReference() {
    const ref = `OUT-DEMO-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const refEl = $("[data-ref]");
    if (refEl) refEl.textContent = ref;
  }

  async function simulatePayment() {
    showToast("Processing payment…");
    await new Promise((r) => setTimeout(r, 700));
    setStep(5);
    stampReference();
  }

  // ----------- Event wiring -----------
  function wire() {
    // Next buttons
    $$("[data-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = state.step;

        if (step === 1) return setStep(2);

        if (step === 2) {
          const ok = validateStep(2);
          if (!ok) return;
          return setStep(3);
        }

        if (step === 3) return setStep(4);

        setStep(step + 1);
      });
    });

    // Back
    $("[data-back]").addEventListener("click", () => {
      if (state.step <= 1) return;
      setStep(state.step - 1);
    });

    // Edit details from preview
    const editBtn = $("[data-edit-details]");
    if (editBtn) editBtn.addEventListener("click", () => setStep(2));

    // Open plan dialog from payment screen
    const planDialog = $("[data-plan-dialog]");
    const openPlanBtn = $("[data-open-plan]");
    if (openPlanBtn && planDialog) {
      openPlanBtn.addEventListener("click", () => {
        if (!planDialog.open) planDialog.showModal();
      });
    }

    // Plan dialog choices
    $$("[data-plan-dialog-choice]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const planKey = btn.dataset.planDialogChoice;
        setPlan(planKey);

        // If Stripe is mounted, update server total and fetch updates.
        await refreshStripeAmountAfterPlanChange(planKey);

        // Close the dialog (it’s a form method=dialog)
        if (planDialog && planDialog.open) planDialog.close();
      });
    });

    // Pay
    $("[data-pay]").addEventListener("click", async () => {
      const ok = validateStep(4);
      if (!ok) return;
      await payWithStripeIfConfigured();
    });

    // Start over
    $("[data-start-over]").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    });

    // Demo dashboard button
    $("[data-view-dashboard]").addEventListener("click", () => {
      alert("Next build step: Manage your ad.\n\n- View status (Queued, Live, Expiring)\n- Pause / Renew\n- Edit summary & photos\n- Performance reporting");
    });

    // Help dialog
    const helpDialog = $("[data-help-dialog]");
    $("[data-help]").addEventListener("click", () => {
      if (!helpDialog.open) helpDialog.showModal();
    });

    // Reset demo data
    $("[data-reset-draft]").addEventListener("click", resetDraft);

    // Listing type
    $$("[data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => setListingType(btn.dataset.choice));
    });

    // Plan selection (Step 3)
    $$("[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const planKey = btn.dataset.plan;
        setPlan(planKey);
      });
    });

    // Inputs (generic)
    $$("[data-field]").forEach((el) => {
      const key = el.dataset.field;

      // Initialize values from state into the DOM
      if (el.type === "checkbox") {
        el.checked = Boolean(state.fields[key]);
      } else {
        if (key === "vin") el.value = formatVinDisplay(state.fields.vin);
        else el.value = state.fields[key] ?? "";
      }

      const handler = () => {
        if (el.type === "checkbox") {
          state.fields[key] = el.checked;
        } else {
          if (key === "vin") {
            const formatted = formatVinDisplay(el.value);
            el.value = formatted;
            state.fields.vin = normalizeVin(formatted);
          } else {
            state.fields[key] = el.value;
          }
        }

        if (key === "summary") {
          updateSummaryCounter();
          const good = String(state.fields.summary || "").trim().length >= 50 && String(state.fields.summary || "").length <= 500;
          setFieldState("summary", good, good ? "" : "Add at least 50 characters.");
        }

        // VIN live validation
        if (key === "vin") {
          const vin = normalizeVin(state.fields.vin);
          if (!vin) clearFieldState("vin");
          else if (vin.length < 17) clearFieldState("vin");
          else if (vin.length === 17 && isVinValid(vin)) setFieldState("vin", true, "");
          else setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use I, O, or Q.");
        }

        // Email soft validation
        if (key === "email") {
          const good = isEmailValid(state.fields.email || "");
          if (!String(state.fields.email || "").trim()) {
            const fieldWrap = $('[data-validate="email"]');
            fieldWrap.classList.remove("is-valid", "is-invalid");
          } else {
            setFieldState("email", good, good ? "" : "That email doesn’t look right — please double-check.");
          }
        }

        // Soft validations for selects/required fields
        if (["model","year","price","zip","state"].includes(key)) {
          const wrap = $(`[data-validate="${key}"]`);
          if (!wrap) return;

          const val = String(state.fields[key] || "").trim();
          if (!val) wrap.classList.remove("is-valid", "is-invalid");
          else {
            wrap.classList.add("is-valid");
            wrap.classList.remove("is-invalid");
            const msgEl = $("[data-msg]", wrap);
            if (msgEl) msgEl.textContent = "";
          }
        }

        updateAdPreview();
        updateOrder();

        // Draft save feedback
        const status = $("[data-draft-status]");
        if (status) status.textContent = "Draft saved.";
        save(false);
        if (state.step === 2) showToast("Saved");
        if (status) setTimeout(() => (status.textContent = "Draft saving is on."), 1100);
      };

      el.addEventListener("input", handler);
      el.addEventListener("change", handler);

      // VIN on blur
      if (key === "vin") {
        el.addEventListener("blur", () => {
          const vin = normalizeVin(state.fields.vin);
          if (!vin) return;
          if (vin.length !== 17) return setFieldState("vin", false, "VINs are 17 characters — please double-check.");
          if (!isVinValid(vin)) return setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use I, O, or Q.");
          setFieldState("vin", true, "");
        });
      }
    });
  }

  // ----------- Init -----------
  load();

  // If returning from Stripe (success), jump to publish step.
  const params = new URLSearchParams(window.location.search);
  if (params.get("success") === "1") {
    state.step = 5;
  }

  // Initialize listing type UI
  setListingType(state.listingType);

  // Initialize plan selection UI
  setPlan(state.fields.plan);

  updateSummaryCounter();
  updateAdPreview();
  updateOrder();
  updatePlanDialogSelection();

  wire();
  setStep(state.step);
})();
