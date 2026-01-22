/**
 * Only Used Tesla — Checkout Demo (UI-only)
 * ----------------------------------------
 * This file intentionally uses small, framework-free JavaScript
 * to demonstrate the mobile checkout journey and validations.
 *
 * Key additions in v2:
 * - REQUIRED VIN (17 chars) with friendly validation
 * - VIN auto-formatting: 4-4-4-5 spacing for readability
 * - Step 3 is now "Preview your ad" before payment
 * - Step 5 messaging: queued for brief review
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEY = "out_checkout_demo_v2";

  const plans = {
    standard: { name: "Standard", days: 7, price: 49 },
    pro: { name: "Pro", days: 14, price: 89 },
    max: { name: "Max", days: 30, price: 149 },
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
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 1200);
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

    save(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function hintForStep(step) {
    switch (step) {
      case 1: return "You’re off to a great start.";
      case 2: return "You’re doing great. Keep it simple.";
      case 3: return "Quick preview before payment.";
      case 4: return "Secure checkout.";
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

  // VIN rules: 17 chars, digits + capital letters except I, O, Q.
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
      if (!vin) {
        ok = false;
        setFieldState("vin", false, "Please enter your VIN (17 characters).");
      } else if (vin.length !== 17) {
        ok = false;
        setFieldState("vin", false, "VINs are 17 characters — almost there.");
      } else if (!isVinValid(vin)) {
        ok = false;
        setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use the letters I, O, or Q.");
      } else {
        setFieldState("vin", true, "");
      }

      // Required: model
      if (!String(f.model).trim()) {
        ok = false;
        setFieldState("model", false, "Please choose a model.");
      } else setFieldState("model", true, "");

      // Required: year
      if (!String(f.year).trim()) {
        ok = false;
        setFieldState("year", false, "Please choose a year.");
      } else setFieldState("year", true, "");

      // Required: price
      if (!String(f.price).trim() || Number(f.price) <= 0) {
        ok = false;
        setFieldState("price", false, "Please add a price (numbers only).");
      } else setFieldState("price", true, "");

      // Required: zip
      const zip = String(f.zip).trim();
      if (!zip || zip.length < 5) {
        ok = false;
        setFieldState("zip", false, "Please enter a valid ZIP code.");
      } else setFieldState("zip", true, "");

      // Required: state
      if (!String(f.state).trim()) {
        ok = false;
        setFieldState("state", false, "Please choose a state.");
      } else setFieldState("state", true, "");

      // Required: summary (min 50 chars)
      const summary = String(f.summary || "");
      if (summary.trim().length < 50) {
        ok = false;
        setFieldState("summary", false, "Add a bit more detail — at least 50 characters.");
      } else if (summary.length > 500) {
        ok = false;
        setFieldState("summary", false, "Please keep the summary under 500 characters.");
      } else setFieldState("summary", true, "");
    }

    if (step === 4) {
      const email = String(state.fields.email || "").trim();
      if (!isEmailValid(email)) {
        ok = false;
        setFieldState("email", false, "Please enter a valid email address.");
      } else setFieldState("email", true, "");
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

    // Build title/sub for preview
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
    save(true);
  }

  // ----------- Stripe simulation -----------
  async function simulateStripeRedirect() {
    showToast("Opening Stripe checkout…");
    await new Promise((r) => setTimeout(r, 650));

    setStep(5);

    const ref = `OUT-DEMO-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const refEl = $("[data-ref]");
    if (refEl) refEl.textContent = ref;
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

        // Safety
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

    // Pay
    $("[data-pay]").addEventListener("click", () => {
      const ok = validateStep(4);
      if (!ok) return;
      simulateStripeRedirect();
    });

    // Start over
    $("[data-start-over]").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    });

    // Demo dashboard button
    $("[data-view-dashboard]").addEventListener("click", () => {
      alert("Manage-your-ad is the next build step.\n\nNext: add edit listing, pause ad, renew, and reporting.");
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

    // Plan selection
    $$("[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => setPlan(btn.dataset.plan));
    });

    // Inputs (generic)
    $$("[data-field]").forEach((el) => {
      const key = el.dataset.field;

      // Initialize values from state into the DOM
      if (el.type === "checkbox") {
        el.checked = Boolean(state.fields[key]);
      } else {
        // VIN is displayed formatted
        if (key === "vin") {
          el.value = formatVinDisplay(state.fields.vin);
        } else {
          el.value = state.fields[key] ?? "";
        }
      }

      const handler = () => {
        if (el.type === "checkbox") {
          state.fields[key] = el.checked;
        } else {
          if (key === "vin") {
            // Format as user types
            const formatted = formatVinDisplay(el.value);
            el.value = formatted;
            state.fields.vin = normalizeVin(formatted); // store normalized
          } else {
            state.fields[key] = el.value;
          }
        }

        // Live counter + validation glow on summary
        if (key === "summary") {
          updateSummaryCounter();
          const good = String(state.fields.summary || "").trim().length >= 50 && String(state.fields.summary || "").length <= 500;
          setFieldState("summary", good, good ? "" : "Add at least 50 characters.");
        }

        // VIN live validation: show green when valid; show red if length == 17 but invalid.
        if (key === "vin") {
          const vin = normalizeVin(state.fields.vin);
          if (!vin) {
            clearFieldState("vin");
          } else if (vin.length < 17) {
            // keep neutral while typing
            clearFieldState("vin");
          } else if (vin.length === 17 && isVinValid(vin)) {
            setFieldState("vin", true, "");
          } else {
            setFieldState("vin", false, "That VIN doesn’t look right. VINs don’t use I, O, or Q.");
          }
        }

        // Soft real-time email validation on checkout
        if (key === "email") {
          const good = isEmailValid(state.fields.email || "");
          if (!String(state.fields.email || "").trim()) {
            const fieldWrap = $('[data-validate="email"]');
            fieldWrap.classList.remove("is-valid", "is-invalid");
            return;
          }
          setFieldState("email", good, good ? "" : "That email doesn’t look right — please double-check.");
        }

        // Soft validations for selects/required fields (except VIN handled above)
        if (["model","year","price","zip","state"].includes(key)) {
          const wrap = $(`[data-validate="${key}"]`);
          if (!wrap) return;

          const val = String(state.fields[key] || "").trim();
          if (!val) {
            wrap.classList.remove("is-valid", "is-invalid");
          } else {
            wrap.classList.add("is-valid");
            wrap.classList.remove("is-invalid");
            const msgEl = $("[data-msg]", wrap);
            if (msgEl) msgEl.textContent = "";
          }
        }

        updateAdPreview();
        updateOrder();

        // Draft save feedback (not too noisy)
        const status = $("[data-draft-status]");
        if (status) status.textContent = "Draft saved.";
        save(false);
        if (state.step === 2) showToast("Saved");
        if (status) setTimeout(() => (status.textContent = "Draft saving is on."), 1100);
      };

      el.addEventListener("input", handler);
      el.addEventListener("change", handler);

      // On blur, if VIN exists but not valid, show an error (nice clarity)
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

  // Initialize listing type UI
  setListingType(state.listingType);

  // Initialize plan selection UI
  setPlan(state.fields.plan);

  updateSummaryCounter();
  updateAdPreview();
  updateOrder();

  wire();
  setStep(state.step);
})();
