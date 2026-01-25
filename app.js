/**
 * Only Used Tesla — Demo v4 (Video + Embedded Payments)
 * ----------------------------------------------------
 * Adds:
 * - Media tabs: Photos / Video (1 minute)
 * - Optional video add-on (+$19) that updates the order total
 * - Video file validation: duration <= 60s, size <= 200MB (adjustable)
 *
 * Stripe:
 * - Still uses Payment Element scaffolding from v3
 * - PaymentIntent create/update now includes `videoAddon`
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEY = "out_checkout_demo_v4";

  const VIDEO_ADDON = { name: "Video showcase", price: 19, amount: 1900 };
  const VIDEO_MAX_SECONDS = 60;
  const VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200MB

  const plans = {
    standard: { name: "Standard", days: 7, price: 49, amount: 4900 },
    pro: { name: "Pro", days: 14, price: 89, amount: 8900 },
    max: { name: "Max", days: 30, price: 149, amount: 14900 },
  };

  const state = {
    step: 1,
    listingType: "sell",
    mediaTab: "photos",
    media: {
      photoCount: 0,
      hasVideo: false,
      videoMeta: null,
    },
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
      videoAddon: false,

      email: "",
      magicLink: true,
    },
  };

  // Stripe runtime state
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
        state.mediaTab = saved.mediaTab ?? state.mediaTab;
        state.media = { ...state.media, ...(saved.media || {}) };
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
    updateMediaCounts();
    updateAdPreview();
    updateOrder();
    updatePlanDialogSelection();
    updateMediaTabUI();

    save(false);
    window.scrollTo({ top: 0, behavior: "instant" });

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

      const vin = normalizeVin(f.vin);
      if (!vin) { ok = false; setFieldState("vin", false, "Please enter your VIN (17 characters)."); }
      else if (vin.length !== 17) { ok = false; setFieldState("vin", false, "VINs are 17 characters — almost there."); }
      else if (!isVinValid(vin)) { ok = false; setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use the letters I, O, or Q."); }
      else { setFieldState("vin", true, ""); }

      if (!String(f.model).trim()) { ok = false; setFieldState("model", false, "Please choose a model."); }
      else setFieldState("model", true, "");

      if (!String(f.year).trim()) { ok = false; setFieldState("year", false, "Please choose a year."); }
      else setFieldState("year", true, "");

      if (!String(f.price).trim() || Number(f.price) <= 0) { ok = false; setFieldState("price", false, "Please add a price (numbers only)."); }
      else setFieldState("price", true, "");

      const zip = String(f.zip).trim();
      if (!zip || zip.length < 5) { ok = false; setFieldState("zip", false, "Please enter a valid ZIP code."); }
      else setFieldState("zip", true, "");

      if (!String(f.state).trim()) { ok = false; setFieldState("state", false, "Please choose a state."); }
      else setFieldState("state", true, "");

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

  // ----------- Media tabs -----------
  function setMediaTab(tab) {
    state.mediaTab = tab;
    updateMediaTabUI();
    save(false);
  }

  function updateMediaTabUI() {
    $$("[data-media-tab]").forEach((btn) => {
      const isActive = btn.dataset.mediaTab === state.mediaTab;
      btn.classList.toggle("is-selected", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    $$("[data-media-panel]").forEach((panel) => {
      const isActive = panel.dataset.mediaPanel === state.mediaTab;
      panel.classList.toggle("is-active", isActive);
    });
  }

  function updateMediaCounts() {
    const photoCountEl = $("[data-photo-count]");
    const videoCountEl = $("[data-video-count]");
    if (photoCountEl) photoCountEl.textContent = String(state.media.photoCount || 0);
    if (videoCountEl) videoCountEl.textContent = state.media.hasVideo ? "1" : "0";

    // Payment screen video line
    const videoLine = $("[data-video-line]");
    if (videoLine) videoLine.hidden = !state.fields.videoAddon;
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
    const videoEl = $("[data-ad-video]");

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
    if (bodyEl) bodyEl.textContent = body;
    if (vinEl) vinEl.textContent = maskedVinForPreview(f.vin);
    if (apEl) apEl.textContent = f.autopilot ? "Autopilot On" : "Autopilot Off";
    if (videoEl) videoEl.textContent = f.videoAddon ? "Video Included" : "No Video";
  }

  function calcTotalCents() {
    const plan = plans[state.fields.plan] || plans.standard;
    let total = plan.amount;
    if (state.fields.videoAddon) total += VIDEO_ADDON.amount;
    return total;
  }

  function updateOrder() {
    const plan = plans[state.fields.plan] || plans.standard;
    const totalCents = calcTotalCents();

    const planEl = $("[data-order-plan]");
    const planSubEl = $("[data-order-plan-sub]");
    const priceEl = $("[data-order-price]");
    const totalEl = $("[data-order-total]");
    const receiptPlanEl = $("[data-receipt-plan]");
    const receiptTotalEl = $("[data-receipt-total]");

    if (planEl) planEl.textContent = plan.name;
    if (planSubEl) planSubEl.textContent = `${plan.days} days`;
    if (priceEl) priceEl.textContent = `$${plan.price.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${(totalCents / 100).toFixed(2)}`;
    if (receiptPlanEl) receiptPlanEl.textContent = plan.name;
    if (receiptTotalEl) receiptTotalEl.textContent = `$${(totalCents / 100).toFixed(2)}`;

    // Video line price
    const videoPriceEl = $("[data-video-price]");
    if (videoPriceEl) videoPriceEl.textContent = `$${VIDEO_ADDON.price.toFixed(2)}`;

    // Pay button label
    const payBtn = $("[data-pay]");
    if (payBtn && state.step === 4) {
      payBtn.textContent = `Pay $${Math.round(totalCents / 100)} & submit for review`;
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

  // ----------- Video handling -----------
  function setVideoMessage(msg, isError = false) {
    const el = $("[data-video-msg]");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-error", Boolean(isError));
  }

  function showVideoPreview(file, durationSec) {
    const previewWrap = $("[data-video-preview]");
    const player = $(".video-player", previewWrap);
    const meta = $("[data-video-meta]");
    if (!previewWrap || !player) return;

    const url = URL.createObjectURL(file);
    player.src = url;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const dur = Math.round(durationSec);
    const name = file.name || "video.mov";
    if (meta) meta.textContent = `${name} · ${dur}s · ${sizeMb}MB`;

    previewWrap.hidden = false;
    setVideoMessage("Video added. Nice — this tends to boost interest.", false);
  }

  function clearVideo() {
    state.media.hasVideo = false;
    state.media.videoMeta = null;
    state.fields.videoAddon = false;

    const input = $("[data-video]");
    if (input) input.value = "";

    const previewWrap = $("[data-video-preview]");
    if (previewWrap) {
      const player = $(".video-player", previewWrap);
      if (player) {
        try { URL.revokeObjectURL(player.src); } catch (e) {}
        player.removeAttribute("src");
        player.load();
      }
      previewWrap.hidden = true;
    }

    setVideoMessage("", false);
    updateMediaCounts();
    updateAdPreview();
    updateOrder();
    syncVideoAddonCheckboxes();
    save(true);
  }

  function syncVideoAddonCheckboxes() {
    $$('[data-field="videoAddon"]').forEach((cb) => {
      cb.checked = Boolean(state.fields.videoAddon);
    });

    const videoLine = $("[data-video-line]");
    if (videoLine) videoLine.hidden = !state.fields.videoAddon;
  }

  async function validateAndSetVideoFile(file) {
    if (!file) return;

    // Size check
    if (file.size > VIDEO_MAX_BYTES) {
      setVideoMessage("That file is a bit large. Please keep it under 200MB (shorter videos load faster).", true);
      return;
    }

    // Duration check: read metadata via a temporary video element
    const temp = document.createElement("video");
    temp.preload = "metadata";

    const url = URL.createObjectURL(file);
    temp.src = url;

    await new Promise((resolve) => {
      temp.onloadedmetadata = () => resolve();
      temp.onerror = () => resolve();
    });

    const duration = Number(temp.duration || 0);
    try { URL.revokeObjectURL(url); } catch (e) {}

    if (!duration || !isFinite(duration)) {
      setVideoMessage("We couldn’t read that video. Please try another file.", true);
      return;
    }

    if (duration > VIDEO_MAX_SECONDS + 0.5) {
      setVideoMessage("Please keep the video under 60 seconds. Quick walk‑arounds work best.", true);
      return;
    }

    // Success: store meta + enable add-on
    state.media.hasVideo = true;
    state.media.videoMeta = { name: file.name, size: file.size, duration };

    state.fields.videoAddon = true; // uploading implies hosting/processing
    syncVideoAddonCheckboxes();

    showVideoPreview(file, duration);
    updateMediaCounts();
    updateAdPreview();
    updateOrder();
    save(true);
  }

  // ----------- Embedded Stripe scaffolding -----------
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
      videoAddon: Boolean(f.videoAddon),
    };
  }

  async function createPaymentIntent() {
    const res = await fetch(`${apiBase()}/api/create-payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: state.fields.plan,
        videoAddon: Boolean(state.fields.videoAddon),
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

  async function updatePaymentIntent() {
    if (!paymentIntentId) return;

    const res = await fetch(`${apiBase()}/api/update-payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentIntentId,
        plan: state.fields.plan,
        videoAddon: Boolean(state.fields.videoAddon),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Unable to update PaymentIntent");
    }

    return await res.json();
  }

  async function ensureStripeMounted() {
    if (stripeMounted) return;

    const pk = stripePk();
    if (!pk) { showPaymentShell(false); return; }

    if (!window.Stripe) {
      showPaymentShell(false);
      setStripeError("Stripe.js didn’t load. Please check your network and script tag.");
      return;
    }

    try {
      showPaymentShell(true);
      setStripeError("");

      const created = await createPaymentIntent();
      paymentIntentId = created.paymentIntentId || null;
      clientSecret = created.clientSecret;

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
      stripeReady = false;
      stripeMounted = false;
      showPaymentShell(false);
      console.warn(err);
    }
  }

  async function refreshStripeAmountAfterOrderChange() {
    if (!stripeReady || !elements) return;
    try {
      setStripeError("");
      await updatePaymentIntent();
      await elements.fetchUpdates();
    } catch (err) {
      console.warn(err);
      setStripeError("We couldn’t update the total just now. Please try again.");
    }
  }

  async function payWithStripeIfConfigured() {
    if (!stripeReady || !stripe || !elements || !clientSecret) {
      await simulatePayment();
      return;
    }

    setStripeError("");

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href.split("?")[0] + "?success=1",
      },
      redirect: "if_required",
    });

    if (error) {
      setStripeError(error.message || "Payment didn’t go through. Please try again.");
      return;
    }

    try {
      const result = await stripe.retrievePaymentIntent(clientSecret);
      const pi = result && result.paymentIntent;
      if (pi && (pi.status === "succeeded" || pi.status === "processing")) {
        setStep(5);
        stampReference();
        return;
      }
      setStripeError("Almost there — please follow any additional steps to complete payment.");
    } catch (e) {
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

    // Media tabs
    $$("[data-media-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setMediaTab(btn.dataset.mediaTab));
    });

    // Photos input (just counts in demo)
    const photosInput = $("[data-photos]");
    if (photosInput) {
      photosInput.addEventListener("change", () => {
        const files = photosInput.files ? Array.from(photosInput.files) : [];
        state.media.photoCount = Math.min(20, files.length);
        updateMediaCounts();
        save(true);
      });
    }

    // Video input
    const videoInput = $("[data-video]");
    if (videoInput) {
      videoInput.addEventListener("change", async () => {
        const file = (videoInput.files && videoInput.files[0]) ? videoInput.files[0] : null;
        if (!file) return;
        setVideoMessage("Checking video…", false);
        await validateAndSetVideoFile(file);
      });
    }

    // Replace video
    const replaceBtn = $("[data-video-replace]");
    if (replaceBtn && videoInput) {
      replaceBtn.addEventListener("click", () => videoInput.click());
    }

    // Remove video
    const removeBtn = $("[data-video-remove]");
    if (removeBtn) {
      removeBtn.addEventListener("click", clearVideo);
    }

    // Plan selection (Step 3)
    $$("[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => setPlan(btn.dataset.plan));
    });

    // Edit details from preview
    const editBtn = $("[data-edit-details]");
    if (editBtn) editBtn.addEventListener("click", () => setStep(2));

    // Payment screen "edit media"
    const editMediaBtn = $("[data-edit-media]");
    if (editMediaBtn) editMediaBtn.addEventListener("click", () => {
      setStep(2);
      setMediaTab("video");
    });

    // Plan change dialog
    const planDialog = $("[data-plan-dialog]");
    const openPlanBtn = $("[data-open-plan]");
    if (openPlanBtn && planDialog) {
      openPlanBtn.addEventListener("click", () => {
        if (!planDialog.open) planDialog.showModal();
      });
    }

    $$("[data-plan-dialog-choice]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const planKey = btn.dataset.planDialogChoice;
        setPlan(planKey);
        await refreshStripeAmountAfterOrderChange();
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

    // Demo dashboard
    $("[data-view-dashboard]").addEventListener("click", () => {
      alert("Next build step: Manage your ad.\n\n- Upload/replace video\n- Pause/renew\n- Reporting");
    });

    // Inputs (generic)
    $$("[data-field]").forEach((el) => {
      const key = el.dataset.field;

      // Initialize DOM from state
      if (el.type === "checkbox") el.checked = Boolean(state.fields[key]);
      else {
        if (key === "vin") el.value = formatVinDisplay(state.fields.vin);
        else el.value = state.fields[key] ?? "";
      }

      const handler = async () => {
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

        // Summary validation
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

        // Video add-on checkbox behavior
        if (key === "videoAddon") {
          // If turning OFF, remove video (keeps UX consistent: if you’re not paying for it, we won’t store it)
          if (!state.fields.videoAddon) {
            clearVideo();
          } else {
            // If turning ON without a video, that’s OK — user can upload later.
            syncVideoAddonCheckboxes();
            updateMediaCounts();
            updateAdPreview();
            updateOrder();
            save(true);
          }

          // If on payment screen with Stripe mounted, update amount
          if (state.step === 4) {
            await refreshStripeAmountAfterOrderChange();
          }
        }

        // Soft validations for selects/required fields
        if (["model","year","price","zip","state"].includes(key)) {
          const wrap = $(`[data-validate="${key}"]`);
          if (wrap) {
            const val = String(state.fields[key] || "").trim();
            if (!val) wrap.classList.remove("is-valid", "is-invalid");
            else {
              wrap.classList.add("is-valid");
              wrap.classList.remove("is-invalid");
              const msgEl = $("[data-msg]", wrap);
              if (msgEl) msgEl.textContent = "";
            }
          }
        }

        updateMediaCounts();
        updateAdPreview();
        updateOrder();
        syncVideoAddonCheckboxes();

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

  const params = new URLSearchParams(window.location.search);
  if (params.get("success") === "1") state.step = 5;

  setListingType(state.listingType);
  setPlan(state.fields.plan);

  updateSummaryCounter();
  updateMediaCounts();
  updateMediaTabUI();
  updateAdPreview();
  updateOrder();
  updatePlanDialogSelection();
  syncVideoAddonCheckboxes();

  wire();
  setStep(state.step);
})();
