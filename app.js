/**
 * Only Used Tesla — Demo v5 (Pricing + Add-ons)
 * --------------------------------------------
 * Pricing:
 * - Basic Ad: $27 (30 days)
 * Add-ons:
 * - AutoCheck report: $20 (radio)
 * - CARFAX report: $20 (radio)
 * - Video: $20 (1 min max)
 * - Facebook Marketplace posting: $25 (7 days)
 * - Facebook groups: $10 per group (0–5)
 * - Text notifications: $5 (requires phone + OTP verify)
 * Preferences:
 * - Notify me when live: Email / Text / Both
 *
 * Embedded payments:
 * - Stripe Payment Element scaffolding (optional)
 * - PaymentIntent create/update include selected add-ons
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEY = "out_checkout_demo_v5";

  // Pricing (cents)
  const BASE_AD = { name: "Basic Ad", amount: 2700, days: 30 };
  const ADDONS = {
    video: { name: "Video showcase", amount: 2000, detail: "1‑minute HD walk‑around" },
    autocheck: { name: "AutoCheck report", amount: 2000, detail: "Vehicle history badge" },
    carfax: { name: "CARFAX report", amount: 2000, detail: "Vehicle history badge" },
    fbMarketplace: { name: "Facebook Marketplace posting", amount: 2500, detail: "Posting service (7 days)" },
    fbGroup: { name: "Facebook group posting", amount: 1000, detail: "$10 per group" },
    sms: { name: "Text notifications", amount: 500, detail: "Lead alerts by SMS" },
  };

  const VIDEO_MAX_SECONDS = 60;
  const VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200MB

  const state = {
    step: 1,
    mediaTab: "photos",
    media: {
      photoCount: 0,
      hasVideo: false,
      videoMeta: null,
    },
    fields: {
      cashOffer: false,

      vin: "",
      model: "",
      year: "",
      miles: "",
      price: "",
      zip: "",
      state: "",
      autopilot: false,
      fsd: "none", // none | subscription | included
      summary: "",

      history: "none", // none | autocheck | carfax
      videoAddon: false,
      fbMarketplace: false,
      fbGroups: 0,

      sms: false,
      phone: "",
      otp: "",
      otpSent: false,
      otpVerified: false,
      otpCode: "123456", // demo code

      notify: "email", // email | text | both

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

  // ---------- Restore / persist ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        state.step = saved.step ?? state.step;
        state.mediaTab = saved.mediaTab ?? state.mediaTab;
        state.media = { ...state.media, ...(saved.media || {}) };
        state.fields = { ...state.fields, ...(saved.fields || {}) };

        // Security-ish resets for demo (optional):
        // Keep otpVerified, but reset otp input field.
        state.fields.otp = "";
      }
    } catch (e) {}
  }

  let toastTimer = null;
  function showToast(msg = "Saved") {
    const toast = $("[data-toast]");
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 1300);
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

  // ---------- Step navigation ----------
  function setStep(nextStep) {
    state.step = Math.max(1, Math.min(5, nextStep));

    $$("[data-step]").forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.step) === state.step);
    });

    const backBtn = $("[data-back]");
    if (backBtn) backBtn.disabled = state.step === 1;

    $$("[data-step-index]").forEach((el) => {
      const i = Number(el.dataset.stepIndex);
      el.classList.toggle("is-active", i === state.step);
      el.classList.toggle("is-complete", i < state.step);
    });

    $$("[data-cta-hint]").forEach((el) => {
      el.textContent = `Step ${state.step} of 5 — ${hintForStep(state.step)}`;
    });

    updateSummaryCounter();
    updateMediaCounts();
    updateVideoStatusLine();
    updateHistoryUI();
    updateNotifyUI();
    syncCheckboxes();
    updateGroupsUI();
    updateSmsUI();
    renderOrderLines();
    updateTotalUI();
    updatePayButtonLabel();

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
      case 3: return "Optional upgrades.";
      case 4: return "Review and pay securely.";
      case 5: return "Submitted. Nice work.";
      default: return "";
    }
  }

  // ---------- Validation helpers ----------
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

  function normalizeVin(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function isVinValid(vinRaw) {
    const vin = normalizeVin(vinRaw);
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
  }

  function formatVinDisplay(vinRaw) {
    const vin = normalizeVin(vinRaw).slice(0, 17);
    const parts = [];
    parts.push(vin.slice(0, 4));
    parts.push(vin.slice(4, 8));
    parts.push(vin.slice(8, 12));
    parts.push(vin.slice(12, 17));
    return parts.filter(Boolean).join(" ");
  }

  function normalizePhone(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, 10);
  }

  function formatPhoneDisplay(raw) {
    const d = normalizePhone(raw);
    if (!d) return "";
    const a = d.slice(0, 3);
    const b = d.slice(3, 6);
    const c = d.slice(6, 10);
    if (d.length <= 3) return `(${a}`;
    if (d.length <= 6) return `(${a}) ${b}`;
    return `(${a}) ${b}-${c}`;
  }

  function isPhoneValid(raw) {
    return normalizePhone(raw).length === 10;
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
      // Email required
      const email = String(state.fields.email || "").trim();
      if (!isEmailValid(email)) { ok = false; setFieldState("email", false, "Please enter a valid email address."); }
      else setFieldState("email", true, "");

      // If SMS add-on selected, require verified phone
      if (state.fields.sms) {
        if (!isPhoneValid(state.fields.phone || "")) {
          ok = false;
          showToast("Please add a valid mobile number for text notifications.");
        } else if (!state.fields.otpVerified) {
          ok = false;
          showToast("Please verify your mobile number to enable text notifications.");
        }
      }

      // If notify includes text, require verified phone
      if ((state.fields.notify === "text" || state.fields.notify === "both") && !state.fields.otpVerified) {
        ok = false;
        showToast("To use text notifications for “ad live”, please verify your mobile number.");
      }
    }

    return ok;
  }

  // ---------- Media tabs ----------
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
  }

  function updateSummaryCounter() {
    const max = 500;
    const summary = String(state.fields.summary || "");
    const countEl = $("[data-summary-count]");
    const maxEl = $("[data-summary-max]");
    if (countEl) countEl.textContent = String(summary.length);
    if (maxEl) maxEl.textContent = String(max);
  }

  // ---------- Add-ons UI ----------
  function historyRequiresVin() {
    return isVinValid(state.fields.vin || "");
  }

  function setHistory(value) {
    if (!["none", "autocheck", "carfax"].includes(value)) return;

    if (value !== "none" && !historyRequiresVin()) {
      // Keep selection at none
      state.fields.history = "none";
      updateHistoryUI();
      showToast("Add a valid VIN to enable history reports.");
      return;
    }

    state.fields.history = value;
    updateHistoryUI();
    renderOrderLines();
    updateTotalUI();
    updatePayButtonLabel();
    save(true);
    refreshStripeAmountAfterOrderChange().catch(()=>{});
  }

  function updateHistoryUI() {
    $$("[data-history]").forEach((btn) => {
      const selected = btn.dataset.history === state.fields.history;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });
  }

  function setNotify(value) {
    if (!["email", "text", "both"].includes(value)) return;

    // If text/both chosen without verified phone, allow selection but show hint and mark disabled state
    state.fields.notify = value;
    updateNotifyUI();
    save(false);
  }

  
  function setFsd(value) {
    if (!["none", "subscription", "included"].includes(value)) return;
    state.fields.fsd = value;
    updateFsdUI();
    save(true);
  }

  function updateFsdUI() {
    $$("[data-fsd]").forEach((btn) => {
      const selected = btn.dataset.fsd === state.fields.fsd;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });

    const hint = $("[data-fsd-hint]");
    if (hint) {
      if (state.fields.fsd === "none") {
        hint.textContent = "If you’re not sure, leave this off — you can edit it later.";
      } else if (state.fields.fsd === "subscription") {
        hint.textContent = "Subscription is monthly and can usually be added by the next owner.";
      } else {
        hint.textContent = "Paid upfront means FSD stays with the Tesla when it’s sold.";
      }
    }
  }

function updateNotifyUI() {
    $$("[data-notify]").forEach((btn) => {
      const selected = btn.dataset.notify === state.fields.notify;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });

    // Disable text/both when SMS not enabled? We allow it, but we nudge.
    const hint = $("[data-notify-hint]");
    const needsPhone = state.fields.notify === "text" || state.fields.notify === "both";
    if (hint) {
      if (!needsPhone) hint.textContent = "Email is the fastest option.";
      else if (state.fields.otpVerified) hint.textContent = "Great — we’ll text you as soon as your ad is live.";
      else hint.textContent = "To use text here, turn on Text notifications and verify your mobile number.";
    }

    // Step 5 receipt
    const receiptNotify = $("[data-receipt-notify]");
    if (receiptNotify) {
      receiptNotify.textContent = state.fields.notify === "both" ? "Email + Text" : (state.fields.notify === "text" ? "Text" : "Email");
    }

    // If user chose text/both but sms toggle is off, keep choice but it won't pass validation later.
    // This reduces surprise: they see the hint.
  }

  function updateVideoStatusLine() {
    const status = $("[data-video-status]");
    if (!status) return;

    if (!state.fields.videoAddon) {
      status.textContent = "Video is off. You can add it any time.";
      return;
    }

    if (state.media.hasVideo) status.textContent = "Video uploaded. Nice — this usually increases buyer trust.";
    else status.textContent = "No video uploaded yet. You can add one now or later.";
  }

  function syncCheckboxes() {
    // For checkboxes that appear in multiple places (Step 2/3 + Order dialog)
    const keys = ["cashOffer", "videoAddon", "fbMarketplace", "sms", "magicLink"];
    keys.forEach((k) => {
      $$(`[data-field="${k}"]`).forEach((el) => {
        if (el.type === "checkbox") el.checked = Boolean(state.fields[k]);
      });
    });

    // Show/hide SMS panel
    const panel = $("[data-sms-panel]");
    if (panel) panel.hidden = !state.fields.sms;

    // If SMS toggle turned off, also ensure notify isn't stuck on text-only without a way to verify
    // We won't override choice automatically; the hint + validation handles it.
  }

  function setGroupsCount(next) {
    const v = Math.max(0, Math.min(5, Number(next)));
    state.fields.fbGroups = v;
    updateGroupsUI();
    renderOrderLines();
    updateTotalUI();
    updatePayButtonLabel();
    save(true);
    refreshStripeAmountAfterOrderChange().catch(()=>{});
  }

  function updateGroupsUI() {
    const count = Number(state.fields.fbGroups || 0);
    const totalCents = count * ADDONS.fbGroup.amount;

    $$("[data-groups-count]").forEach((el) => el.textContent = String(count));
    $$("[data-groups-total]").forEach((el) => el.textContent = totalCents ? `+$${(totalCents/100).toFixed(0)}` : "$0");
  }

  function updateSmsUI() {
    const phoneInput = $('[data-field="phone"]');
    if (phoneInput) phoneInput.value = formatPhoneDisplay(state.fields.phone);

    // OTP hint
    const otpHint = $("[data-otp-hint]");
    if (otpHint) {
      if (!state.fields.sms) otpHint.textContent = "";
      else if (state.fields.otpVerified) otpHint.textContent = "Verified. You’re all set.";
      else if (state.fields.otpSent) otpHint.textContent = "Code sent. Enter it to verify your number.";
      else otpHint.textContent = "We’ll only text you for leads and important updates.";
    }

    // OTP row visibility
    const otpRow = $("[data-otp-row]");
    if (otpRow)_toggle(otpRow, state.fields.otpSent && !state.fields.otpVerified);

    // Phone field validation styling
    const phoneWrap = $('[data-validate="phone"]');
    if (phoneWrap) {
      phoneWrap.classList.remove("is-valid","is-invalid");
      if (state.fields.sms) {
        if (!state.fields.phone) {}
        else if (isPhoneValid(state.fields.phone)) phoneWrap.classList.add("is-valid");
        else phoneWrap.classList.add("is-invalid");
      }
    }

    function _toggle(el, show){
      el.hidden = !show;
    }
  }

  // ---------- Order + totals ----------
  function calcTotalCents() {
    let total = BASE_AD.amount;

    // history
    if (state.fields.history === "autocheck") total += ADDONS.autocheck.amount;
    if (state.fields.history === "carfax") total += ADDONS.carfax.amount;

    // video
    if (state.fields.videoAddon) total += ADDONS.video.amount;

    // fb marketplace
    if (state.fields.fbMarketplace) total += ADDONS.fbMarketplace.amount;

    // fb groups
    const groups = Number(state.fields.fbGroups || 0);
    total += groups * ADDONS.fbGroup.amount;

    // sms
    if (state.fields.sms) total += ADDONS.sms.amount;

    return total;
  }

  function renderOrderLines() {
    const wrap = $("[data-order-lines]");
    if (!wrap) return;

    const lines = [];

    // history
    if (state.fields.history === "autocheck") lines.push({ title: ADDONS.autocheck.name, sub: ADDONS.autocheck.detail, amt: ADDONS.autocheck.amount });
    if (state.fields.history === "carfax") lines.push({ title: ADDONS.carfax.name, sub: ADDONS.carfax.detail, amt: ADDONS.carfax.amount });

    // video
    if (state.fields.videoAddon) lines.push({ title: "Video (1 min)", sub: ADDONS.video.detail, amt: ADDONS.video.amount });

    // marketplace
    if (state.fields.fbMarketplace) lines.push({ title: ADDONS.fbMarketplace.name, sub: ADDONS.fbMarketplace.detail, amt: ADDONS.fbMarketplace.amount });

    // groups
    const groups = Number(state.fields.fbGroups || 0);
    if (groups > 0) lines.push({ title: `Facebook groups (${groups})`, sub: "Posting service", amt: groups * ADDONS.fbGroup.amount });

    // sms
    if (state.fields.sms) lines.push({ title: ADDONS.sms.name, sub: ADDONS.sms.detail, amt: ADDONS.sms.amount });

    wrap.innerHTML = lines.map((l) => `
      <div class="order-row">
        <div>
          <div class="order-title">${escapeHtml(l.title)}</div>
          <div class="order-sub">${escapeHtml(l.sub)}</div>
        </div>
        <div class="order-right">
          <div class="order-amt">+$${(l.amt/100).toFixed(2)}</div>
        </div>
      </div>
    `).join("");
  }

  function updateTotalUI() {
    const totalCents = calcTotalCents();
    const totalEl = $("[data-order-total]");
    const receiptTotal = $("[data-receipt-total]");
    if (totalEl) totalEl.textContent = `$${(totalCents/100).toFixed(2)}`;
    if (receiptTotal) receiptTotal.textContent = `$${(totalCents/100).toFixed(2)}`;
  }

  function updatePayButtonLabel() {
    const payBtn = $("[data-pay]");
    if (!payBtn) return;
    const total = calcTotalCents();
    payBtn.textContent = `Pay $${Math.round(total/100)} & submit for review`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  // ---------- Video handling ----------
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

    // If they remove video, keep videoAddon ON if they chose it (so they can upload later),
    // but if videoAddon was auto-enabled from upload, we keep it on and let them toggle it off manually.
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
    updateVideoStatusLine();
    save(true);
  }

  async function validateAndSetVideoFile(file) {
    if (!file) return;

    if (file.size > VIDEO_MAX_BYTES) {
      setVideoMessage("That file is a bit large. Please keep it under 200MB (shorter videos load faster).", true);
      return;
    }

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
    syncCheckboxes();

    showVideoPreview(file, duration);
    updateMediaCounts();
    updateVideoStatusLine();
    renderOrderLines();
    updateTotalUI();
    updatePayButtonLabel();
    save(true);
    refreshStripeAmountAfterOrderChange().catch(()=>{});
  }

  // ---------- OTP handling ----------
  function sendOtp() {
    if (!state.fields.sms) return;

    if (!isPhoneValid(state.fields.phone)) {
      setFieldState("phone", false, "Please enter a valid 10‑digit mobile number.");
      showToast("Please enter a valid mobile number first.");
      return;
    }

    state.fields.otpSent = true;
    state.fields.otpVerified = false;
    state.fields.otp = "";

    // Demo: fixed code shown via toast (keeps UX simple for your dev)
    showToast(`Demo code: ${state.fields.otpCode}`);
    updateSmsUI();
    save(false);
  }

  function verifyOtp() {
    if (!state.fields.sms) return;
    const entered = String(state.fields.otp || "").trim();
    if (entered.length !== 6) {
      showToast("Please enter the 6‑digit code.");
      return;
    }

    if (entered !== state.fields.otpCode) {
      showToast("That code didn’t match. Try again, or resend.");
      return;
    }

    state.fields.otpVerified = true;
    state.fields.otpSent = false;
    state.fields.otp = "";
    showToast("Verified");
    updateSmsUI();
    updateNotifyUI();
    save(true);
  }

  // ---------- Embedded Stripe scaffolding ----------
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
      autopilot: Boolean(f.autopilot),
      fsd: String(f.fsd || "none"),
      addons: {
        history: f.history,
        videoAddon: Boolean(f.videoAddon),
        fbMarketplace: Boolean(f.fbMarketplace),
        fbGroups: Number(f.fbGroups || 0),
        sms: Boolean(f.sms),
        cashOffer: Boolean(f.cashOffer),
      },
      notify: f.notify,
    };
  }

  async function createPaymentIntent() {
    const res = await fetch(`${apiBase()}/api/create-payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
        listing: listingSnapshotForMetadata(),
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

  // ---------- Wiring ----------
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
    const back = $("[data-back]");
    if (back) back.addEventListener("click", () => {
      if (state.step <= 1) return;
      setStep(state.step - 1);
    });

    // Help dialog
    const helpDialog = $("[data-help-dialog]");
    const helpBtn = $("[data-help]");
    if (helpBtn && helpDialog) helpBtn.addEventListener("click", () => {
      if (!helpDialog.open) helpDialog.showModal();
    });

    // Reset demo data
    const resetBtn = $("[data-reset-draft]");
    if (resetBtn) resetBtn.addEventListener("click", resetDraft);

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

    // Replace / remove video
    const replaceBtn = $("[data-video-replace]");
    if (replaceBtn && videoInput) replaceBtn.addEventListener("click", () => videoInput.click());

    const removeBtn = $("[data-video-remove]");
    if (removeBtn) removeBtn.addEventListener("click", clearVideo);

    // History buttons
    $$("[data-history]").forEach((btn) => {
      btn.addEventListener("click", () => setHistory(btn.dataset.history));
    });

    // Notify radio buttons
    $$("[data-notify]").forEach((btn) => {
      btn.addEventListener("click", () => setNotify(btn.dataset.notify));
    });

    // Groups qty buttons (multiple instances: step 3 + order dialog)
    $$("[data-groups-inc]").forEach((btn) => btn.addEventListener("click", () => setGroupsCount(Number(state.fields.fbGroups||0) + 1)));
    $$("[data-groups-dec]").forEach((btn) => btn.addEventListener("click", () => setGroupsCount(Number(state.fields.fbGroups||0) - 1)));

    // OTP
    const sendBtn = $("[data-otp-send]");
    if (sendBtn) sendBtn.addEventListener("click", sendOtp);

    const verifyBtn = $("[data-otp-verify]");
    if (verifyBtn) verifyBtn.addEventListener("click", verifyOtp);

    // Order dialog
    const orderDialog = $("[data-order-dialog]");
    const editOrderBtn = $("[data-edit-order]");
    if (editOrderBtn && orderDialog) {
      editOrderBtn.addEventListener("click", () => {
        if (!orderDialog.open) orderDialog.showModal();
      });
      orderDialog.addEventListener("close", () => {
        // On close, refresh totals and Stripe amount
        renderOrderLines();
        updateTotalUI();
        updatePayButtonLabel();
        refreshStripeAmountAfterOrderChange().catch(()=>{});
      });
    }

    // Pay
    const payBtn = $("[data-pay]");
    if (payBtn) payBtn.addEventListener("click", async () => {
      const ok = validateStep(4);
      if (!ok) return;
      await payWithStripeIfConfigured();
    });

    // Start over
    const startOverBtn = $("[data-start-over]");
    if (startOverBtn) startOverBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    });

    // Demo dashboard
    const dashBtn = $("[data-view-dashboard]");
    if (dashBtn) dashBtn.addEventListener("click", () => {
      alert("Next build step: Manage your ad.\n\n- Edit price/summary\n- Upload/replace video\n- View leads\n- Renew/extend");
    });

    // Inputs (generic) - supports multiple fields
    $$("[data-field]").forEach((el) => {
      const key = el.dataset.field;

      // Initialize DOM from state
      if (el.type === "checkbox") el.checked = Boolean(state.fields[key]);
      else {
        if (key === "vin") el.value = formatVinDisplay(state.fields.vin);
        else if (key === "phone") el.value = formatPhoneDisplay(state.fields.phone);
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
          } else if (key === "phone") {
            const formatted = formatPhoneDisplay(el.value);
            el.value = formatted;
            state.fields.phone = normalizePhone(formatted);
            // Reset verification if phone changes
            state.fields.otpVerified = false;
            state.fields.otpSent = false;
            state.fields.otp = "";
          } else {
            state.fields[key] = el.value;
          }
        }

        // Summary live
        if (key === "summary") {
          updateSummaryCounter();
          const good = String(state.fields.summary || "").trim().length >= 50 && String(state.fields.summary || "").length <= 500;
          setFieldState("summary", good, good ? "" : "Add at least 50 characters.");
        }

        // VIN live
        if (key === "vin") {
          const vin = normalizeVin(state.fields.vin);
          if (!vin) clearFieldState("vin");
          else if (vin.length < 17) clearFieldState("vin");
          else if (vin.length === 17 && isVinValid(vin)) setFieldState("vin", true, "");
          else setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use I, O, or Q.");

          // If history is selected but VIN becomes invalid, drop back to none
          if (!historyRequiresVin() && state.fields.history !== "none") {
            state.fields.history = "none";
            updateHistoryUI();
          }
        }

        // Email soft
        if (key === "email") {
          const good = isEmailValid(state.fields.email || "");
          if (!String(state.fields.email || "").trim()) {
            const fieldWrap = $('[data-validate="email"]');
            if (fieldWrap) fieldWrap.classList.remove("is-valid", "is-invalid");
          } else {
            setFieldState("email", good, good ? "" : "That email doesn’t look right — please double-check.");
          }
        }

        // Phone live
        if (key === "phone") {
          if (!state.fields.sms) {
            clearFieldState("phone");
          } else if (!state.fields.phone) {
            clearFieldState("phone");
          } else if (isPhoneValid(state.fields.phone)) {
            setFieldState("phone", true, "");
          } else {
            setFieldState("phone", false, "Please enter a valid 10‑digit mobile number.");
          }
        }

        // Toggle-specific behavior
        if (key === "videoAddon") {
          // If turning OFF, clear video selection message but keep uploaded file (demo keeps it).
          if (!state.fields.videoAddon) {
            // user explicitly turned off -> we keep video uploaded, but order won't charge; that's ok.
            setVideoMessage("", false);
          }
          updateVideoStatusLine();
          renderOrderLines();
          updateTotalUI();
          updatePayButtonLabel();
          await refreshStripeAmountAfterOrderChange();
        }

        if (key === "fbMarketplace" || key === "sms") {
          syncCheckboxes();
          updateSmsUI();
          renderOrderLines();
          updateTotalUI();
          updatePayButtonLabel();
          await refreshStripeAmountAfterOrderChange();
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

        // Draft save feedback
        const status = $("[data-draft-status]");
        if (status && state.step === 2) status.textContent = "Draft saved.";
        save(false);
        if (state.step === 2) showToast("Saved");
        if (status) setTimeout(() => (status.textContent = "Draft saving is on."), 1100);

        // Update global UI
        updateMediaCounts();
        updateVideoStatusLine();
        updateHistoryUI();
        updateNotifyUI();
        updateGroupsUI();
        renderOrderLines();
        updateTotalUI();
        updatePayButtonLabel();
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

  // ---------- Init ----------
  load();

  const params = new URLSearchParams(window.location.search);
  if (params.get("success") === "1") state.step = 5;

  updateMediaTabUI();
  updateMediaCounts();
  updateVideoStatusLine();
  updateSummaryCounter();
  updateHistoryUI();
  updateNotifyUI();
  updateFsdUI();
  syncCheckboxes();
  updateGroupsUI();
  updateSmsUI();
  renderOrderLines();
  updateTotalUI();
  updatePayButtonLabel();

  wire();
  setStep(state.step);
})();
