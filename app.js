/**
 * Only Used Tesla — Checkout Demo (UI-only)
 * ----------------------------------------
 * This file intentionally uses small, framework-free JavaScript
 * to demonstrate the mobile checkout journey and validations.
 *
 * Integration notes for your backend dev:
 * - Replace the "simulateStripeRedirect()" with a call to your backend
 *   that creates a Stripe Checkout Session, then redirect to Stripe.
 *   Example shape:
 *     const res = await fetch('/api/stripe/create-checkout-session', { method:'POST', body: JSON.stringify(payload) })
 *     const { url } = await res.json()
 *     window.location.href = url
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEY = "out_checkout_demo_v1";

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
    } catch (e) {
      // If parsing fails, ignore. (Demo should never block.)
    }
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
    } catch (e) {
      // ignore
    }
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

    updatePreview();
    updateOrder();

    save(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function hintForStep(step) {
    switch (step) {
      case 1: return "You’re off to a great start.";
      case 2: return "You’re doing great. Keep it simple.";
      case 3: return "Pick a package that fits your timeline.";
      case 4: return "Ready to pay.";
      case 5: return "Done. Nice work.";
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

  function isEmailValid(email) {
    // Gentle validation for UX: basic check only.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  function validateStep(step) {
    let ok = true;

    if (step === 2) {
      const f = state.fields;

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

  function updatePreview() {
    const p = $("[data-listing-preview]");
    if (!p) return;

    const f = state.fields;

    const title = `${f.year || "—"} ${f.model || "Tesla"}${f.autopilot ? " · Autopilot" : ""}`;
    const subParts = [];
    if (f.price) subParts.push(`$${Number(f.price).toLocaleString()}`);
    if (f.zip) subParts.push(f.zip);
    if (f.state) subParts.push(f.state);
    const sub = subParts.length ? subParts.join(" · ") : "—";

    $(".preview-title", p).textContent = title;
    $(".preview-sub", p).textContent = sub;
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

    // If user chooses "boost existing", we can relax required listing fields in a real build.
    // For demo, we still show listing fields (because many sellers create a new listing).
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
    // Friendly UX: show a quick toast, then "complete".
    showToast("Opening Stripe checkout…");
    await new Promise((r) => setTimeout(r, 650));

    // In production: redirect to Stripe Checkout URL.
    // window.location.href = urlFromBackend;
    setStep(5);

    // Make a quick-looking reference
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

        // If Step 2 -> Step 3 and user turned off boosting, skip to Step 4
        if (step === 2) {
          const ok = validateStep(2);
          if (!ok) return;
          if (!state.fields.boostWithAd) return setStep(4);
          return setStep(3);
        }

        if (step === 3) return setStep(4);
        if (step === 1) return setStep(2);

        // For safety
        setStep(step + 1);
      });
    });

    // Back
    $("[data-back]").addEventListener("click", () => {
      if (state.step <= 1) return;
      setStep(state.step - 1);
    });

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
      alert("Dashboard is not included in this UI demo yet.\n\nNext step: build the “Manage your ad” experience after checkout.");
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
        el.value = state.fields[key] ?? "";
      }

      const handler = () => {
        if (el.type === "checkbox") {
          state.fields[key] = el.checked;
        } else {
          state.fields[key] = el.value;
        }

        // Live counter + validation glow on summary
        if (key === "summary") {
          updateSummaryCounter();
          // Soft real-time validation: green when good.
          const good = String(state.fields.summary || "").trim().length >= 50 && String(state.fields.summary || "").length <= 500;
          setFieldState("summary", good, good ? "" : "Add at least 50 characters.");
        }

        // Soft real-time email validation on checkout
        if (key === "email") {
          const good = isEmailValid(state.fields.email || "");
          if (!String(state.fields.email || "").trim()) {
            // don't show error while empty until user tries to pay
            const fieldWrap = $('[data-validate="email"]');
            fieldWrap.classList.remove("is-valid", "is-invalid");
            return;
          }
          setFieldState("email", good, good ? "" : "That email doesn’t look right — please double-check.");
        }

        // Soft validations for selects/required fields
        if (["model","year","price","zip","state"].includes(key)) {
          // Only show green when filled; avoid red while typing.
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

        updatePreview();
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
    });
  }

  // ----------- Init -----------
  load();

  // Initialize listing type UI
  setListingType(state.listingType);

  // Initialize plan selection UI
  setPlan(state.fields.plan);

  // Initialize summary counter
  updateSummaryCounter();
  updatePreview();
  updateOrder();

  wire();
  setStep(state.step);
})();
