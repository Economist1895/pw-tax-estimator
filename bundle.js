(() => {
  // src/constants.js
  var TAX_BRACKETS = [
    { from: 0, to: 2e4, rate: 0, base: 0 },
    { from: 2e4, to: 3e4, rate: 0.02, base: 0 },
    { from: 3e4, to: 4e4, rate: 0.035, base: 200 },
    { from: 4e4, to: 8e4, rate: 0.07, base: 550 },
    { from: 8e4, to: 12e4, rate: 0.115, base: 3350 },
    { from: 12e4, to: 16e4, rate: 0.15, base: 7950 },
    { from: 16e4, to: 2e5, rate: 0.18, base: 13950 },
    { from: 2e5, to: 24e4, rate: 0.19, base: 21150 },
    { from: 24e4, to: 28e4, rate: 0.195, base: 28750 },
    { from: 28e4, to: 32e4, rate: 0.2, base: 36550 },
    { from: 32e4, to: 5e5, rate: 0.22, base: 44550 },
    { from: 5e5, to: 1e6, rate: 0.23, base: 84150 },
    { from: 1e6, to: Infinity, rate: 0.24, base: 199150 }
  ];
  var RELIEF_CAP = 8e4;
  var DONATION_MULTIPLIER = 2.5;
  var FEDR_INCOME_CAP = 5e4;
  var PHC_FEDR_RATE = 0.6;
  var DELIVERY_MODES = [
    { id: "foot", rate: 0.2, prescribed: true },
    { id: "pmd", rate: 0.35, prescribed: true },
    { id: "van", rate: 0.6, prescribed: true },
    { id: "other", rate: 0, prescribed: false }
  ];
  var EIR_CAPS = {
    "under55": { normal: 1e3, disabled: 4e3 },
    "55to59": { normal: 6e3, disabled: 1e4 },
    "60plus": { normal: 8e3, disabled: 12e3 }
  };
  var CPF_CAP = 37740;
  var SEP_CPF_RELIEF_RATE = 0.37;
  var LIFE_INS_BUFFER = 5e3;
  var LIFE_INS_CAP = 5e3;
  var TOPUP_CAP_SELF = 8e3;
  var TOPUP_CAP_FAMILY = 8e3;
  var SRS_CAP_LOCAL = 15300;
  var SRS_CAP_FOREIGN = 35700;
  var SPOUSE_RELIEF_NORMAL = 2e3;
  var SPOUSE_RELIEF_DISABILITY = 5500;
  var GCR_AMOUNT = 3e3;
  var NSMAN_PARENT_OR_WIFE = 750;
  var NSMAN_SELF = {
    none: 0,
    noactivity: 1500,
    activity_nonkah: 3e3,
    kah_noactivity: 3500,
    kah_activity: 5e3
  };
  var QCR_AMOUNT = 4e3;
  var CHILD_DISABILITY_AMOUNT = 7500;
  var CHILD_RELIEF_CAP_PER_CHILD = 5e4;
  var WMCR_FIXED = { 1: 8e3, 2: 1e4, 3: 12e3 };
  var WMCR_PCT = { 1: 0.15, 2: 0.2, 3: 0.25 };
  var PARENT_RELIEF = {
    stays: 9e3,
    separate: 5500,
    disabilityStays: 14e3,
    disabilitySeparate: 1e4
  };
  var MAX_PARENT_DEPENDANTS = 2;
  var SIBLING_DISABILITY_AMOUNT = 5500;
  var MAX_DAYS_PER_WEEK = 7;
  var WEEKS_PER_YEAR = 52;
  var GIRO_MIN_MONTHLY = 20;
  var GIRO_MAX_MONTHS = 12;

  // src/tax.js
  function calculateTax(income) {
    if (income <= 0) return 0;
    for (const b of TAX_BRACKETS) {
      if (income <= b.to) return b.base + (income - b.from) * b.rate;
    }
    return 0;
  }
  function calcEIR(earnedIncome, ageBracket, disabled) {
    const caps = EIR_CAPS[ageBracket];
    if (!caps) return 0;
    return Math.min(earnedIncome, disabled ? caps.disabled : caps.normal);
  }
  function annualiseDailyIncome(rate, days) {
    return rate * Math.min(MAX_DAYS_PER_WEEK, days) * WEEKS_PER_YEAR;
  }
  function fedrEligible(totalIncome, hasNonPrescribedMode) {
    return !hasNonPrescribedMode && totalIncome <= FEDR_INCOME_CAP;
  }
  function calcDeliveryFEDRExpenses(modeIncomes) {
    return DELIVERY_MODES.filter((m) => m.prescribed).reduce((sum, m) => sum + (modeIncomes[m.id] || 0) * m.rate, 0);
  }
  function calcCPFRelief(mandatory, voluntary, netTradeIncome = null) {
    const m = Math.min(mandatory, CPF_CAP);
    if (netTradeIncome === null) return m;
    const relief = Math.min(m + voluntary, CPF_CAP);
    return Math.min(relief, Math.max(0, netTradeIncome) * SEP_CPF_RELIEF_RATE);
  }
  function calcLifeInsRelief(premium, insuredValue, cpfTotal, cpfContributions = cpfTotal) {
    if (cpfContributions >= LIFE_INS_BUFFER) return 0;
    if (premium <= 0 || insuredValue <= 0) return 0;
    return Math.min(LIFE_INS_CAP - cpfTotal, premium, insuredValue * 7 / 100);
  }
  function calcTopupRelief(selfAmt, familyAmt) {
    return Math.min(selfAmt, TOPUP_CAP_SELF) + Math.min(familyAmt, TOPUP_CAP_FAMILY);
  }
  function calcSrsRelief(amount, citizenship) {
    const cap = citizenship === "foreign" ? SRS_CAP_FOREIGN : SRS_CAP_LOCAL;
    return Math.min(amount, cap);
  }
  function calcSpouseRelief(key) {
    if (key === "normal") return SPOUSE_RELIEF_NORMAL;
    if (key === "disability") return SPOUSE_RELIEF_DISABILITY;
    return 0;
  }
  function calcGcrRelief(claim, isMale) {
    return !isMale && claim === "yes" ? GCR_AMOUNT : 0;
  }
  function calcNsmanSelf(key) {
    return NSMAN_SELF[key] || 0;
  }
  function resolveNsman(selfAmt, wifeAmt, parentAmt) {
    if (selfAmt > 0 && parentAmt > 0) {
      return {
        amount: Math.max(selfAmt, parentAmt),
        higher: selfAmt >= parentAmt ? "self" : "parent",
        selfAmt
      };
    }
    if (selfAmt > 0) return { amount: selfAmt };
    if (wifeAmt > 0 && parentAmt > 0) {
      return { amount: NSMAN_PARENT_OR_WIFE, capped: true };
    }
    return { amount: wifeAmt + parentAmt };
  }
  function calcGiroMonths(tax) {
    if (tax <= 0) return { months: 0, monthly: 0 };
    const months = Math.min(GIRO_MAX_MONTHS, Math.floor(tax / GIRO_MIN_MONTHLY));
    if (months <= 1) return { months: 1, monthly: tax };
    return { months, monthly: tax / months };
  }
  function buildBracketBreakdown(chargeable) {
    if (chargeable <= 0) return [];
    const out = [];
    let remaining = chargeable;
    for (const b of TAX_BRACKETS) {
      if (remaining <= 0) break;
      const slice = Math.min(remaining, b.to - b.from);
      out.push({ fromAmount: b.from, slice, rate: b.rate, tax: slice * b.rate });
      remaining -= slice;
    }
    return out;
  }
  function applyReliefCap(total) {
    return Math.min(total, RELIEF_CAP);
  }
  function childBaseAmount(child) {
    if (!child) return 0;
    if (child.ageBand === "disabled") return CHILD_DISABILITY_AMOUNT;
    if (child.ageBand === "under16" || child.ageBand === "studying") return QCR_AMOUNT;
    return 0;
  }
  function calcQCR(children2) {
    if (!Array.isArray(children2)) return 0;
    return children2.reduce((sum, c) => {
      var _a;
      return sum + childBaseAmount(c) * (((_a = c.sharePct) != null ? _a : 100) / 100);
    }, 0);
  }
  function childQualifiesForRelief(child) {
    return !!child && child.ageBand !== "noteligible" && childBaseAmount(child) > 0;
  }
  function wmcrBaseForChild(orderIndex, child, earnedIncome) {
    if (!childQualifiesForRelief(child) || !child.sgCitizen) return 0;
    const tier = Math.min(3, Math.max(1, orderIndex));
    if (child.bornFrom2024) return WMCR_FIXED[tier];
    return WMCR_PCT[tier] * Math.max(0, earnedIncome);
  }
  function calcWMCR(children2, earnedIncome, isWorkingMother2) {
    var _a;
    if (!isWorkingMother2 || !Array.isArray(children2)) return 0;
    let scOrder = 0;
    let total = 0;
    for (const c of children2) {
      if (!childQualifiesForRelief(c)) continue;
      if (!c.sgCitizen) continue;
      scOrder += 1;
      const override = parseInt(c.birthOrder, 10);
      const tier = Number.isFinite(override) && override >= 1 ? override : scOrder;
      const qcr = childBaseAmount(c) * (((_a = c.sharePct) != null ? _a : 100) / 100);
      let wmcr = wmcrBaseForChild(tier, c, earnedIncome);
      if (qcr + wmcr > CHILD_RELIEF_CAP_PER_CHILD) {
        wmcr = Math.max(0, CHILD_RELIEF_CAP_PER_CHILD - qcr);
      }
      total += wmcr;
    }
    return Math.min(total, Math.max(0, earnedIncome));
  }
  function parentBaseAmount(p) {
    if (!p) return 0;
    if (p.disability) return p.livesWithYou ? PARENT_RELIEF.disabilityStays : PARENT_RELIEF.disabilitySeparate;
    return p.livesWithYou ? PARENT_RELIEF.stays : PARENT_RELIEF.separate;
  }
  function calcParentRelief(parents2) {
    if (!Array.isArray(parents2)) return 0;
    return parents2.reduce((sum, p) => {
      var _a;
      return sum + parentBaseAmount(p) * (((_a = p.sharePct) != null ? _a : 100) / 100);
    }, 0);
  }
  function calcSiblingRelief(siblings2) {
    if (!Array.isArray(siblings2)) return 0;
    return siblings2.reduce((sum, s) => {
      var _a;
      return sum + SIBLING_DISABILITY_AMOUNT * (((_a = s.sharePct) != null ? _a : 100) / 100);
    }, 0);
  }

  // src/dom.js
  function fmt(n, decimals = 2) {
    const safe = Math.max(0, n);
    if (decimals === 0) return "$" + Math.round(safe).toLocaleString("en-SG");
    return "$" + safe.toLocaleString("en-SG", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  var fmtShort = (n) => fmt(n, 0);
  var $ = (id) => document.getElementById(id);
  function val(id) {
    const el = $(id);
    if (!el) return 0;
    const v = parseFloat(el.value);
    return isNaN(v) || v < 0 ? 0 : v;
  }
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }
  function showHide(el, show) {
    if (el) el.style.display = show ? "" : "none";
  }
  function toggleClass(el, cls, force) {
    if (el) el.classList.toggle(cls, force);
  }
  function getRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }

  // src/app.js
  var getSex = () => getRadio("aboutSex");
  var getAgeBracket = () => getRadio("aboutAge");
  var getDisabled = () => $("eirDisability") && $("eirDisability").checked;
  function applyAboutYouUI() {
    const isMale = getSex() === "male";
    toggleClass($("rs-wmcr"), "hidden", isMale);
    toggleClass($("rs-gcr"), "hidden", isMale);
    toggleClass($("rs-nsman-self-section"), "hidden", !isMale);
    toggleClass($("rs-nsman-wife-section"), "hidden", isMale);
    renderChildren();
    calcReliefs();
  }
  var phcFEDRCb = $("phcFEDR");
  var phcFEDRSec = $("phcFEDRSection");
  var phcActualSec = $("phcActualSection");
  var capBarFill = $("capBarFill");
  var capPctEl = $("capPct");
  var nsmanCapWarn = $("nsmanCapWarning");
  var nsmanCapWarnText = $("nsmanCapWarningText");
  var nsmanWPWarn = $("nsmanWifeParentWarning");
  var nsmanWPWarnText = $("nsmanWifeParentWarningText");
  var reliefBreakdown = $("r-reliefBreakdownRows");
  var rDeliveryRow = $("r-netDeliveryRow");
  var rPHCRow = $("r-netPHCRow");
  var rAdditRow = $("r-additionalRow");
  var rDonationsRow = $("r-donationsRow");
  var rReliefsRow = $("r-reliefsBlock");
  var rRebatesRow = $("r-rebatesRow");
  var modeCheckboxes = {};
  DELIVERY_MODES.forEach((m) => {
    modeCheckboxes[m.id] = $("dm-" + m.id);
  });
  var deliveryInputMode = "annual";
  var phcInputMode = "annual";
  var reliefMode = "detailed";
  var deliveryFEDRForcedOff = false;
  var incomeState = { netDelivery: 0, netPHC: 0, additional: 0, earnedIncome: 0, netTrade: 0 };
  var reliefState = {
    eir: 0,
    spouse: 0,
    qcr: 0,
    wmcr: 0,
    parent: 0,
    gcr: 0,
    sibling: 0,
    cpf: 0,
    lifeIns: 0,
    topup: 0,
    srs: 0,
    nsman: 0,
    total: 0,
    capped: 0,
    donations: 0,
    simpleMode: true,
    simpleRaw: 0
  };
  var rebatesState = { total: 0 };
  var finalTax = 0;
  var tabOrder = ["about", "income", "reliefs", "result"];
  var tabCompleted = { about: false, income: false, reliefs: false, result: false };
  function switchTab(tab) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    $("page-" + tab).classList.add("active");
    const tabBtn = $("tab-" + tab);
    tabBtn.classList.add("active");
    tabBtn.setAttribute("aria-selected", "true");
    if (tab === "result") updateResults();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  tabOrder.forEach((tab) => {
    $("tab-" + tab).addEventListener("click", () => switchTab(tab));
  });
  function markCompletedAndAdvance(currentTab, nextTab) {
    tabCompleted[currentTab] = true;
    updateTabProgress();
    switchTab(nextTab);
  }
  $("btnContinueToIncome").addEventListener("click", () => markCompletedAndAdvance("about", "income"));
  $("btnContinueToReliefs").addEventListener("click", () => markCompletedAndAdvance("income", "reliefs"));
  $("btnViewResults").addEventListener("click", () => markCompletedAndAdvance("reliefs", "result"));
  $("btnEmptyToIncome").addEventListener("click", () => switchTab("income"));
  function updateTabProgress() {
    tabOrder.forEach((tab) => {
      const btn = $("tab-" + tab);
      if (!btn) return;
      btn.classList.toggle("completed", !!tabCompleted[tab]);
    });
  }
  var resetModal = $("resetModal");
  $("resetLink").addEventListener("click", () => resetModal.classList.add("open"));
  $("resetCancelBtn").addEventListener("click", () => resetModal.classList.remove("open"));
  resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.classList.remove("open");
  });
  $("resetConfirmBtn").addEventListener("click", () => {
    document.querySelectorAll('input[type="number"]').forEach((el) => {
      el.value = "";
    });
    const seenGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach((r) => {
      if (r.name.startsWith("child-") || r.name.startsWith("parent-") || r.name.startsWith("sibling-")) return;
      if (!seenGroups[r.name]) {
        seenGroups[r.name] = true;
        r.checked = true;
      } else {
        r.checked = false;
      }
    });
    document.querySelectorAll(".radio-option").forEach((o) => o.classList.remove("selected"));
    document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach((r) => r.closest(".radio-option").classList.add("selected"));
    DELIVERY_MODES.forEach((m) => {
      if (modeCheckboxes[m.id]) modeCheckboxes[m.id].checked = false;
    });
    const delivFEDR = $("deliveryFEDR");
    if (delivFEDR) delivFEDR.checked = true;
    deliveryFEDRForcedOff = false;
    if (phcFEDRCb) phcFEDRCb.checked = true;
    const eirDis = $("eirDisability");
    if (eirDis) {
      eirDis.checked = false;
      eirDis.closest(".checkbox-card").classList.remove("selected");
    }
    setDeliveryInputMode("annual");
    setPhcInputMode("annual");
    setReliefMode("detailed");
    ["delivery", "phc", "additional"].forEach((k) => {
      const c = $("incomeCard-" + k);
      if (c) c.classList.remove("open");
    });
    document.querySelectorAll(".relief-section").forEach((s) => s.classList.remove("open"));
    document.querySelectorAll("[aria-expanded]").forEach((el) => el.setAttribute("aria-expanded", "false"));
    children.length = 0;
    parents.length = 0;
    siblings.length = 0;
    renderChildren();
    renderParents();
    renderSiblings();
    resetModal.classList.remove("open");
    tabOrder.forEach((t) => tabCompleted[t] = false);
    updateTabProgress();
    switchTab("about");
    calcIncome();
  });
  document.querySelectorAll('input[name="aboutSex"], input[name="aboutAge"]').forEach((r) => {
    r.addEventListener("change", function() {
      document.querySelectorAll(`input[name="${this.name}"]`).forEach((rb) => {
        rb.closest(".radio-option").classList.toggle("selected", rb.checked);
      });
      applyAboutYouUI();
    });
  });
  function setIncomeCardOpen(key, open) {
    const card = $("incomeCard-" + key);
    if (!card) return;
    card.classList.toggle("open", open);
    const hdr = $("incomeCardHeader-" + key);
    if (hdr) hdr.setAttribute("aria-expanded", open ? "true" : "false");
  }
  ["delivery", "phc", "additional"].forEach((key) => {
    const hdr = $("incomeCardHeader-" + key);
    hdr.addEventListener("click", () => {
      const card = $("incomeCard-" + key);
      const open = !card.classList.contains("open");
      setIncomeCardOpen(key, open);
    });
    hdr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const card = $("incomeCard-" + key);
        setIncomeCardOpen(key, !card.classList.contains("open"));
      }
    });
  });
  function setDeliveryInputMode(mode) {
    deliveryInputMode = mode;
    toggleClass($("deliveryModeAnnual"), "active", mode === "annual");
    toggleClass($("deliveryModeDaily"), "active", mode === "daily");
    DELIVERY_MODES.forEach((m) => {
      toggleClass($("dm-" + m.id + "-annual"), "hidden", mode !== "annual");
      toggleClass($("dm-" + m.id + "-daily"), "hidden", mode === "annual");
    });
    calcIncome();
  }
  $("deliveryModeAnnual").addEventListener("click", () => setDeliveryInputMode("annual"));
  $("deliveryModeDaily").addEventListener("click", () => setDeliveryInputMode("daily"));
  function getCheckedModes() {
    return DELIVERY_MODES.filter((m) => modeCheckboxes[m.id] && modeCheckboxes[m.id].checked);
  }
  function applyDeliveryModeUI() {
    const checked = getCheckedModes();
    const anyChecked = checked.length > 0;
    const hasOther = checked.some((m) => !m.prescribed);
    toggleClass($("deliveryIncomeSection"), "hidden", !anyChecked);
    DELIVERY_MODES.forEach((m) => {
      const cb = modeCheckboxes[m.id];
      const isChecked = !!(cb && cb.checked);
      toggleClass($("dm-income-" + m.id), "hidden", !isChecked);
      toggleClass($("dmcheck-" + m.id), "checked", isChecked);
    });
    toggleClass($("deliveryTotalIncomeRow"), "hidden", checked.length <= 1);
    const totalIncome = calcDeliveryTotalIncome();
    const overCap = totalIncome > FEDR_INCOME_CAP;
    const fedrBlocked = hasOther || overCap;
    toggleClass($("fedrBlockedOther"), "hidden", !hasOther);
    toggleClass($("fedrBlockedCap"), "hidden", !overCap);
    const toggleRow = $("deliveryFEDRToggleRow");
    const fedrCb = $("deliveryFEDR");
    const toggleEl = $("deliveryFEDRToggle");
    if (toggleRow) toggleClass(toggleRow, "hidden", !anyChecked);
    if (toggleEl) toggleClass(toggleEl, "disabled", fedrBlocked);
    if (fedrBlocked && fedrCb && fedrCb.checked) {
      fedrCb.checked = false;
      deliveryFEDRForcedOff = true;
    } else if (!fedrBlocked && fedrCb && deliveryFEDRForcedOff) {
      fedrCb.checked = true;
      deliveryFEDRForcedOff = false;
    }
    const useFEDR = !fedrBlocked && fedrCb && fedrCb.checked;
    toggleClass($("deliveryFEDRSection"), "hidden", !useFEDR);
    toggleClass($("deliveryActualSection"), "hidden", useFEDR || !anyChecked);
  }
  DELIVERY_MODES.forEach((m) => {
    const cb = modeCheckboxes[m.id];
    if (cb) cb.addEventListener("change", () => {
      applyDeliveryModeUI();
      calcIncome();
    });
  });
  $("deliveryFEDR").addEventListener("change", () => {
    deliveryFEDRForcedOff = false;
    applyDeliveryModeUI();
    calcIncome();
  });
  function getModeAnnualIncome(modeId) {
    if (deliveryInputMode === "annual") return val("dm-" + modeId + "-annualIncome");
    return annualiseDailyIncome(val("dm-" + modeId + "-dailyRate"), val("dm-" + modeId + "-days"));
  }
  function updateModeAnnualisedDisplay(modeId) {
    if (deliveryInputMode === "daily") {
      setText("dm-" + modeId + "-annualised", fmt(getModeAnnualIncome(modeId)));
    }
  }
  function calcDeliveryTotalIncome() {
    return getCheckedModes().reduce((sum, m) => sum + getModeAnnualIncome(m.id), 0);
  }
  function setPhcInputMode(mode) {
    phcInputMode = mode;
    toggleClass($("phcModeAnnual"), "active", mode === "annual");
    toggleClass($("phcModeDaily"), "active", mode === "daily");
    toggleClass($("phcAnnualInputSection"), "hidden", mode !== "annual");
    toggleClass($("phcDailyInputSection"), "hidden", mode === "annual");
    calcIncome();
  }
  $("phcModeAnnual").addEventListener("click", () => setPhcInputMode("annual"));
  $("phcModeDaily").addEventListener("click", () => setPhcInputMode("daily"));
  function setReliefMode(mode) {
    reliefMode = mode;
    toggleClass($("reliefModeSimpleBtn"), "active", mode === "simple");
    toggleClass($("reliefModeDetailedBtn"), "active", mode === "detailed");
    toggleClass($("reliefSimpleSection"), "hidden", mode !== "simple");
    toggleClass($("reliefDetailedSection"), "hidden", mode !== "detailed");
    calcReliefs();
  }
  $("reliefModeSimpleBtn").addEventListener("click", () => setReliefMode("simple"));
  $("reliefModeDetailedBtn").addEventListener("click", () => setReliefMode("detailed"));
  var reliefSectionIds = [
    "rs-donations",
    "rs-eir",
    "rs-spouse",
    "rs-qcr",
    "rs-wmcr",
    "rs-parent",
    "rs-gcr",
    "rs-sibling",
    "rs-cpf",
    "rs-lifeins",
    "rs-topup",
    "rs-srs",
    "rs-nsman",
    "rs-rebates"
  ];
  reliefSectionIds.forEach((id) => {
    const header = $(id + "-header");
    if (!header) return;
    function toggleOpen() {
      const sec = $(id);
      const open = !sec.classList.contains("open");
      sec.classList.toggle("open", open);
      header.setAttribute("aria-expanded", open ? "true" : "false");
    }
    header.addEventListener("click", toggleOpen);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleOpen();
      }
    });
  });
  var eirDisability = $("eirDisability");
  if (eirDisability) {
    eirDisability.addEventListener("change", function() {
      this.closest(".checkbox-card").classList.toggle("selected", this.checked);
      calcReliefs();
    });
  }
  function validateDays(inputId, errorId) {
    const input = $(inputId);
    const err = $(errorId);
    if (!input || !err) return;
    const raw = input.value.trim();
    if (raw === "") {
      input.classList.remove("input-error");
      err.classList.remove("show");
      return;
    }
    const v = parseFloat(raw);
    if (isNaN(v) || v < 0 || v > MAX_DAYS_PER_WEEK) {
      input.classList.add("input-error");
      err.classList.add("show");
      input.value = Math.min(MAX_DAYS_PER_WEEK, Math.max(0, isNaN(v) ? 0 : Math.round(v)));
      setTimeout(() => {
        input.classList.remove("input-error");
        err.classList.remove("show");
      }, 2e3);
    } else {
      if (v !== Math.floor(v)) input.value = Math.round(v);
      input.classList.remove("input-error");
      err.classList.remove("show");
    }
  }
  document.querySelectorAll('input[type="number"]').forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "-" || e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    });
    el.addEventListener("input", function() {
      if (this.value !== "" && parseFloat(this.value) < 0) this.value = 0;
      if (!this.id.includes("-days") && this.id !== "phcDaysPerWeek") {
        const v = this.value;
        if (v !== "" && v.indexOf(".") !== -1) this.value = Math.floor(parseFloat(v));
      }
    });
    el.addEventListener("focus", function() {
      if (this.value === "0" || this.value === "0.00") this.value = "";
    });
    el.addEventListener("wheel", function() {
      if (document.activeElement === this) this.blur();
    }, { passive: true });
  });
  document.addEventListener("wheel", () => {
    var _a;
    if (((_a = document.activeElement) == null ? void 0 : _a.type) === "number") document.activeElement.blur();
  }, { passive: true });
  document.addEventListener("touchmove", () => {
    var _a;
    if (((_a = document.activeElement) == null ? void 0 : _a.type) === "number") document.activeElement.blur();
  }, { passive: true });
  function updateIncomeSummary(summaryId, netAmt, hasData, emptyText) {
    const el = $(summaryId);
    if (!el) return;
    if (hasData) el.innerHTML = `Net income: <span class="net-val">${fmt(netAmt)}</span>`;
    else el.textContent = emptyText;
  }
  var children = [];
  var parents = [];
  var siblings = [];
  var dependantIdCounter = 0;
  var nextId = () => ++dependantIdCounter;
  function isWorkingMother() {
    return getSex() === "female";
  }
  function isWmcrEligible() {
    return getRadio("wmcrEligible") !== "no";
  }
  function readSharePct(kind, id) {
    var _a;
    const radio = ((_a = document.querySelector('input[name="' + kind + "-" + id + '-share"]:checked')) == null ? void 0 : _a.value) || "100";
    if (radio === "custom") {
      const el = document.getElementById(kind + "-" + id + "-shareCustomPct");
      return Math.min(100, Math.max(0, parseFloat(el == null ? void 0 : el.value) || 0));
    }
    return parseInt(radio, 10);
  }
  function readChildFromDom(id) {
    var _a, _b, _c, _d;
    const row = document.querySelector(`.dependant-row[data-kind="child"][data-id="${id}"]`);
    if (!row) return null;
    const ageBand = ((_a = row.querySelector('input[name="child-' + id + '-age"]:checked')) == null ? void 0 : _a.value) || "under16";
    const bornFrom2024 = ((_b = row.querySelector('input[name="child-' + id + '-born"]:checked')) == null ? void 0 : _b.value) === "from2024";
    const sgCitizen = ((_c = row.querySelector('input[name="child-' + id + '-sg"]:checked')) == null ? void 0 : _c.value) !== "no";
    const birthOrderRaw = (_d = row.querySelector('input[name="child-' + id + '-birthOrder"]')) == null ? void 0 : _d.value;
    const birthOrderNum = parseInt(birthOrderRaw, 10);
    const birthOrder = Number.isFinite(birthOrderNum) && birthOrderNum >= 1 ? birthOrderNum : null;
    return { id, ageBand, bornFrom2024, sgCitizen, sharePct: readSharePct("child", id), birthOrder };
  }
  function readParentFromDom(id) {
    var _a, _b;
    const row = document.querySelector(`.dependant-row[data-kind="parent"][data-id="${id}"]`);
    if (!row) return null;
    const livesWithYou = ((_a = row.querySelector('input[name="parent-' + id + '-lives"]:checked')) == null ? void 0 : _a.value) === "yes";
    const disability = ((_b = row.querySelector('input[name="parent-' + id + '-disability"]')) == null ? void 0 : _b.checked) || false;
    return { id, livesWithYou, disability, sharePct: readSharePct("parent", id) };
  }
  function readSiblingFromDom(id) {
    const row = document.querySelector(`.dependant-row[data-kind="sibling"][data-id="${id}"]`);
    if (!row) return null;
    return { id, sharePct: readSharePct("sibling", id) };
  }
  function collectChildren() {
    return children.map((c) => readChildFromDom(c.id)).filter(Boolean);
  }
  function collectParents() {
    return parents.map((p) => readParentFromDom(p.id)).filter(Boolean);
  }
  function collectSiblings() {
    return siblings.map((s) => readSiblingFromDom(s.id)).filter(Boolean);
  }
  function buildChildRowHTML(id, index) {
    const female = isWorkingMother();
    return `
    <div class="dependant-row" data-kind="child" data-id="${id}">
        <div class="dependant-row-header">
            <span class="dependant-row-title">Child ${index + 1}</span>
            <button class="dependant-remove-btn" type="button" aria-label="Remove this child">&#10005;</button>
        </div>
        <div class="dependant-row-body">
            <div class="form-group">
                <label>Child's eligibility status</label>
                <div class="radio-group">
                    <label class="radio-option selected"><input type="radio" name="child-${id}-age" value="under16" checked><div><div class="radio-label">Unmarried, below 16 years of age</div><div class="radio-sub">Annual income not exceeding $8,000. Relief: $4,000.</div></div></label>
                    <label class="radio-option"><input type="radio" name="child-${id}-age" value="studying"><div><div class="radio-label">Unmarried, aged 16 or above, studying full-time</div><div class="radio-sub">Annual income not exceeding $8,000. Relief: $4,000.</div></div></label>
                    <label class="radio-option"><input type="radio" name="child-${id}-age" value="disabled"><div><div class="radio-label">Unmarried and physically disabled or mentally impaired</div><div class="radio-sub">Any age, any income. Relief: $7,500.</div></div></label>
                    <label class="radio-option"><input type="radio" name="child-${id}-age" value="noteligible"><div><div class="radio-label">None of the above</div><div class="radio-sub">e.g. married, not studying, or annual income exceeding $8,000.</div></div></label>
                </div>
            </div>
            ${female ? `
            <div class="form-group">
                <label>Is the child a citizen of Singapore as at 31 Dec of the basis period?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;">
                    <label class="radio-option selected" style="flex:1;"><input type="radio" name="child-${id}-sg" value="yes" checked><div><div class="radio-label">Yes</div><div class="radio-sub">Qualifies for Working Mother's Child Relief (WMCR)</div></div></label>
                    <label class="radio-option" style="flex:1;"><input type="radio" name="child-${id}-sg" value="no"><div><div class="radio-label">No</div></div></label>
                </div>
            </div>
            <div class="form-group">
                <label>Was the child born on or after 1 Jan 2024?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;">
                    <label class="radio-option" style="flex:1;"><input type="radio" name="child-${id}-born" value="before2024" checked><div><div class="radio-label">No &mdash; born before 1 Jan 2024</div><div class="radio-sub">WMCR = % of earned income</div></div></label>
                    <label class="radio-option" style="flex:1;"><input type="radio" name="child-${id}-born" value="from2024"><div><div class="radio-label">Yes &mdash; born on or after 1 Jan 2024</div><div class="radio-sub">WMCR = fixed amount</div></div></label>
                </div>
            </div>
            <div class="form-group">
                <label for="child-${id}-birthOrder">Birth order of this child</label>
                <input type="number" min="1" step="1" name="child-${id}-birthOrder" id="child-${id}-birthOrder" placeholder="auto" inputmode="numeric" style="max-width:120px;">
                <div class="form-help">Counted automatically from this child's position in the list above. Enter the correct order if there are earlier children not added to this estimator &mdash; e.g. stillborn, deceased, or older children who don't qualify for Child Relief. All such children count towards the WMCR birth order.</div>
            </div>
            ` : ""}
            <div class="form-group">
                <label>What is your share of the Child Relief?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;flex-wrap:wrap;">
                    <label class="radio-option selected" style="flex:1;min-width:80px;"><input type="radio" name="child-${id}-share" value="100" checked><div><div class="radio-label">100%</div><div class="radio-sub">I am the sole claimant</div></div></label>
                    <label class="radio-option" style="flex:1;min-width:80px;"><input type="radio" name="child-${id}-share" value="custom"><div><div class="radio-label">Less than 100%</div><div class="radio-sub">Shared claim &mdash; enter your share</div></div></label>
                </div>
                <div class="hidden" id="child-${id}-customShareWrap" style="margin-top:8px;display:flex;align-items:center;gap:8px;">
                    <input type="number" inputmode="decimal" id="child-${id}-shareCustomPct" name="child-${id}-shareCustomPct" placeholder="0" min="0" max="100" step="1" style="max-width:90px;">
                    <span style="font-size:0.9rem;color:var(--text-muted);">%</span>
                </div>
            </div>
        </div>
        <div class="dependant-row-amount">
            <span class="dr-label">Child Relief for this child</span>
            <span class="dr-value" data-amount>$0</span>
        </div>
    </div>`;
  }
  function buildParentRowHTML(id, index) {
    return `
    <div class="dependant-row" data-kind="parent" data-id="${id}">
        <div class="dependant-row-header">
            <span class="dependant-row-title">Dependant ${index + 1}</span>
            <button class="dependant-remove-btn" type="button" aria-label="Remove this dependant">&#10005;</button>
        </div>
        <div class="dependant-row-body">
            <div class="form-group">
                <label>Lives with you?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;">
                    <label class="radio-option selected" style="flex:1;"><input type="radio" name="parent-${id}-lives" value="yes" checked><div><div class="radio-label">Yes</div><div class="radio-sub">Same household</div></div></label>
                    <label class="radio-option" style="flex:1;"><input type="radio" name="parent-${id}-lives" value="no"><div><div class="radio-label">No</div><div class="radio-sub">Separate household, but you provided at least $2,000 in support</div></div></label>
                </div>
            </div>
            <label class="checkbox-card">
                <input type="checkbox" name="parent-${id}-disability">
                <div class="checkbox-card-text">
                    <div class="checkbox-card-title">Permanently disabled</div>
                    <div class="checkbox-card-sub">Higher relief; age and income limits waived.</div>
                </div>
            </label>
            <div class="form-group">
                <label>What is your share of the Parent Relief?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;flex-wrap:wrap;">
                    <label class="radio-option selected" style="flex:1;min-width:80px;"><input type="radio" name="parent-${id}-share" value="100" checked><div><div class="radio-label">100%</div><div class="radio-sub">I am the sole claimant</div></div></label>
                    <label class="radio-option" style="flex:1;min-width:80px;"><input type="radio" name="parent-${id}-share" value="custom"><div><div class="radio-label">Less than 100%</div><div class="radio-sub">Shared claim &mdash; enter your share</div></div></label>
                </div>
                <div class="hidden" id="parent-${id}-customShareWrap" style="margin-top:8px;display:flex;align-items:center;gap:8px;">
                    <input type="number" inputmode="decimal" id="parent-${id}-shareCustomPct" name="parent-${id}-shareCustomPct" placeholder="0" min="0" max="100" step="1" style="max-width:90px;">
                    <span style="font-size:0.9rem;color:var(--text-muted);">%</span>
                </div>
            </div>
        </div>
        <div class="dependant-row-amount">
            <span class="dr-label">Parent Relief for this dependant</span>
            <span class="dr-value" data-amount>$0</span>
        </div>
    </div>`;
  }
  function buildSiblingRowHTML(id, index) {
    return `
    <div class="dependant-row" data-kind="sibling" data-id="${id}">
        <div class="dependant-row-header">
            <span class="dependant-row-title">Sibling ${index + 1}</span>
            <button class="dependant-remove-btn" type="button" aria-label="Remove this sibling">&#10005;</button>
        </div>
        <div class="dependant-row-body">
            <div class="form-group">
                <label>What is your share of the Sibling Relief?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;flex-wrap:wrap;">
                    <label class="radio-option selected" style="flex:1;min-width:80px;"><input type="radio" name="sibling-${id}-share" value="100" checked><div><div class="radio-label">100%</div><div class="radio-sub">I am the sole claimant</div></div></label>
                    <label class="radio-option" style="flex:1;min-width:80px;"><input type="radio" name="sibling-${id}-share" value="custom"><div><div class="radio-label">Less than 100%</div><div class="radio-sub">Shared claim &mdash; enter your share</div></div></label>
                </div>
                <div class="hidden" id="sibling-${id}-customShareWrap" style="margin-top:8px;display:flex;align-items:center;gap:8px;">
                    <input type="number" inputmode="decimal" id="sibling-${id}-shareCustomPct" name="sibling-${id}-shareCustomPct" placeholder="0" min="0" max="100" step="1" style="max-width:90px;">
                    <span style="font-size:0.9rem;color:var(--text-muted);">%</span>
                </div>
            </div>
        </div>
        <div class="dependant-row-amount">
            <span class="dr-label">Sibling Relief for this sibling</span>
            <span class="dr-value" data-amount>$5,500</span>
        </div>
    </div>`;
  }
  var KIND_CONFIG = {
    child: { listId: "childrenList", summaryId: "childrenSummary", sectionId: "rs-qcr", headerId: "rs-qcr-header", stateArr: () => children, labelOne: "Child", labelMany: "children" },
    parent: { listId: "parentsList", summaryId: "parentsSummary", sectionId: "rs-parent", headerId: "rs-parent-header", stateArr: () => parents, labelOne: "Dependant", labelMany: "dependants" },
    sibling: { listId: "siblingsList", summaryId: "siblingsSummary", sectionId: "rs-sibling", headerId: "rs-sibling-header", stateArr: () => siblings, labelOne: "Sibling", labelMany: "siblings" }
  };
  var BUILDERS = {
    child: buildChildRowHTML,
    parent: buildParentRowHTML,
    sibling: buildSiblingRowHTML
  };
  function syncRowSelectedStates(scope) {
    scope.querySelectorAll(".radio-option").forEach((o) => o.classList.remove("selected"));
    scope.querySelectorAll('input[type="radio"]:checked').forEach((r) => {
      r.closest(".radio-option").classList.add("selected");
    });
    scope.querySelectorAll(".checkbox-card").forEach((cc) => {
      const cb = cc.querySelector('input[type="checkbox"]');
      cc.classList.toggle("selected", !!(cb && cb.checked));
    });
  }
  function attachRowEvents(row, kind) {
    row.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches('input[type="radio"]')) {
        row.querySelectorAll(`input[name="${t.name}"]`).forEach((rb) => {
          rb.closest(".radio-option").classList.toggle("selected", rb.checked);
        });
        if (t.name.endsWith("-share")) {
          const wrapId = t.name.replace(/-share$/, "-customShareWrap");
          const wrap = document.getElementById(wrapId);
          if (wrap) toggleClass(wrap, "hidden", t.value !== "custom");
        }
      } else if (t.matches('input[type="checkbox"]')) {
        const cc = t.closest(".checkbox-card");
        if (cc) cc.classList.toggle("selected", t.checked);
      }
      calcReliefs();
    });
    row.addEventListener("input", (e) => {
      if (e.target.matches('input[type="number"]')) calcReliefs();
    });
    const removeBtn = row.querySelector(".dependant-remove-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        const id = parseInt(row.dataset.id, 10);
        const arr = KIND_CONFIG[kind].stateArr();
        const idx = arr.findIndex((x) => x.id === id);
        if (idx >= 0) arr.splice(idx, 1);
        row.remove();
        updateRowTitlesAndSummary(kind);
        calcReliefs();
      });
    }
  }
  function updateRowTitlesAndSummary(kind) {
    const cfg = KIND_CONFIG[kind];
    const rows = document.querySelectorAll(`.dependant-row[data-kind="${kind}"]`);
    rows.forEach((row, i) => {
      const titleEl = row.querySelector(".dependant-row-title");
      if (titleEl) titleEl.textContent = `${cfg.labelOne} ${i + 1}`;
    });
    const summary = $(cfg.summaryId);
    if (summary) {
      const n = cfg.stateArr().length;
      if (n === 0) summary.textContent = "";
      else if (kind === "parent" && n >= MAX_PARENT_DEPENDANTS) summary.textContent = `Maximum ${MAX_PARENT_DEPENDANTS} dependants reached.`;
      else if (kind === "parent") summary.textContent = `${n} of ${MAX_PARENT_DEPENDANTS} dependants added.`;
      else summary.textContent = `${n} ${n === 1 ? cfg.labelOne.toLowerCase() : cfg.labelMany} added.`;
    }
    if (kind === "parent") {
      const addBtn = $("addParentBtn");
      if (addBtn) {
        const full = parents.length >= MAX_PARENT_DEPENDANTS;
        addBtn.disabled = full;
        addBtn.style.opacity = full ? "0.4" : "";
      }
    }
  }
  function appendDependantRow(kind, dataObj) {
    const cfg = KIND_CONFIG[kind];
    const list = $(cfg.listId);
    if (!list) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = BUILDERS[kind](dataObj.id, cfg.stateArr().length - 1);
    const row = wrap.firstElementChild;
    if (!row) return;
    list.appendChild(row);
    syncRowSelectedStates(row);
    attachRowEvents(row, kind);
    updateRowTitlesAndSummary(kind);
  }
  function renderChildren() {
    rebuildList("child");
  }
  function renderParents() {
    rebuildList("parent");
  }
  function renderSiblings() {
    rebuildList("sibling");
  }
  function rebuildList(kind) {
    const cfg = KIND_CONFIG[kind];
    const list = $(cfg.listId);
    if (!list) return;
    list.innerHTML = "";
    cfg.stateArr().forEach((item) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = BUILDERS[kind](item.id, 0);
      const row = wrap.firstElementChild;
      if (!row) return;
      list.appendChild(row);
      syncRowSelectedStates(row);
      attachRowEvents(row, kind);
    });
    updateRowTitlesAndSummary(kind);
    updateDependantAmounts();
  }
  function autoOpenSection(kind) {
    const cfg = KIND_CONFIG[kind];
    const sec = $(cfg.sectionId);
    if (sec && !sec.classList.contains("open")) {
      sec.classList.add("open");
      $(cfg.headerId).setAttribute("aria-expanded", "true");
    }
  }
  function addChild() {
    const item = { id: nextId() };
    children.push(item);
    appendDependantRow("child", item);
    autoOpenSection("child");
    calcReliefs();
  }
  function addParent() {
    if (parents.length >= MAX_PARENT_DEPENDANTS) return;
    const item = { id: nextId() };
    parents.push(item);
    appendDependantRow("parent", item);
    autoOpenSection("parent");
    calcReliefs();
  }
  function addSibling() {
    const item = { id: nextId() };
    siblings.push(item);
    appendDependantRow("sibling", item);
    autoOpenSection("sibling");
    calcReliefs();
  }
  $("addChildBtn").addEventListener("click", addChild);
  $("addParentBtn").addEventListener("click", addParent);
  $("addSiblingBtn").addEventListener("click", addSibling);
  function updateDependantAmounts() {
    const cs = collectChildren();
    cs.forEach((c) => {
      const amt = childBaseAmount(c) * (c.sharePct / 100);
      const el = document.querySelector(`.dependant-row[data-kind="child"][data-id="${c.id}"] [data-amount]`);
      if (el) el.textContent = fmtShort(amt);
    });
    const ps = collectParents();
    ps.forEach((p) => {
      const amt = parentBaseAmount(p) * (p.sharePct / 100);
      const el = document.querySelector(`.dependant-row[data-kind="parent"][data-id="${p.id}"] [data-amount]`);
      if (el) el.textContent = fmtShort(amt);
    });
    const ss = collectSiblings();
    ss.forEach((s) => {
      const amt = SIBLING_DISABILITY_AMOUNT * (s.sharePct / 100);
      const el = document.querySelector(`.dependant-row[data-kind="sibling"][data-id="${s.id}"] [data-amount]`);
      if (el) el.textContent = fmtShort(amt);
    });
  }
  function ordinal(n) {
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return n + "th";
  }
  function buildWMCRBreakdownHTML(childArr, earnedIncome) {
    var _a;
    if (!isWorkingMother()) return "Not applicable (working mothers only).";
    if (!isWmcrEligible()) return "Not applicable. WMCR is only for working mothers who are married, divorced or widowed.";
    if (childArr.length === 0) return "Add a child above to compute WMCR.";
    const rows = [];
    let scOrder = 0;
    let grandTotal = 0;
    let anyQualifying = false;
    for (const c of childArr) {
      if (c.ageBand === "noteligible" || !childBaseAmount(c)) continue;
      if (!c.sgCitizen) continue;
      scOrder++;
      anyQualifying = true;
      const overrideRaw = parseInt(c.birthOrder, 10);
      const effectiveOrder = Number.isFinite(overrideRaw) && overrideRaw >= 1 ? overrideRaw : scOrder;
      const cappedTier = Math.min(3, Math.max(1, effectiveOrder));
      const ord = ordinal(effectiveOrder);
      const qcr = childBaseAmount(c) * (((_a = c.sharePct) != null ? _a : 100) / 100);
      let wmcrBase;
      let formulaLine;
      if (c.bornFrom2024) {
        wmcrBase = WMCR_FIXED[cappedTier];
        formulaLine = `Fixed (${ord} child, born on or after 1 Jan 2024) = ${fmt(wmcrBase)}`;
      } else {
        const pct = WMCR_PCT[cappedTier];
        wmcrBase = pct * Math.max(0, earnedIncome);
        formulaLine = `${(pct * 100).toFixed(0)}% &times; ${fmt(earnedIncome)} (earned income) = ${fmt(wmcrBase)}`;
      }
      let cappedWmcr = wmcrBase;
      let capLine = "";
      if (qcr + wmcrBase > CHILD_RELIEF_CAP_PER_CHILD) {
        cappedWmcr = Math.max(0, CHILD_RELIEF_CAP_PER_CHILD - qcr);
        capLine = `<div class="wmcr-step">Per-child cap ($50,000 &minus; ${fmt(qcr)} Child Relief share) = ${fmt(cappedWmcr)}</div>`;
      }
      grandTotal += cappedWmcr;
      rows.push(`<div class="wmcr-child-block">
            <div class="wmcr-child-title">Child ${scOrder} (${ord} qualifying child)</div>
            <div class="wmcr-step">${formulaLine}</div>
            ${capLine}
            <div class="wmcr-child-amount">${fmt(cappedWmcr)}</div>
        </div>`);
    }
    if (!anyQualifying) return "No qualifying children who are citizens of Singapore for WMCR.";
    const earnedCap = Math.max(0, earnedIncome);
    let capNote = "";
    let finalTotal = grandTotal;
    if (grandTotal > earnedCap) {
      finalTotal = earnedCap;
      capNote = `<div class="wmcr-step">Capped at 100% of earned income (${fmt(earnedCap)})</div>`;
    }
    const totalRow = rows.length > 1 || capNote ? `${capNote}<div class="wmcr-total">Total WMCR: <strong>${fmt(finalTotal)}</strong></div>` : "";
    return `<div class="wmcr-breakdown">${rows.join("")}${totalRow}</div>`;
  }
  function buildLifeInsBreakdownHTML(premium, insuredValue, cpfTotal, cpfContributions = cpfTotal) {
    if (cpfContributions >= LIFE_INS_BUFFER) return "&mdash;";
    if (premium <= 0 || insuredValue <= 0) {
      return '<div class="lifeins-empty">Enter premium and sum assured for qualifying life insurance above.</div>';
    }
    const headroom = LIFE_INS_BUFFER - cpfTotal;
    const sevenPct = insuredValue * 7 / 100;
    const relief = Math.min(headroom, premium, sevenPct);
    return `<div class="lifeins-breakdown">
        <div class="lifeins-intro">Relief is the lowest of the following:</div>
        <div class="lifeins-step">$5,000 &minus; ${fmtShort(cpfTotal)} (CPF contributions) = ${fmtShort(headroom)}</div>
        <div class="lifeins-step">Premium paid = ${fmtShort(premium)}</div>
        <div class="lifeins-step">7% &times; ${fmtShort(insuredValue)} (sum assured) = ${fmtShort(sevenPct)}</div>
        <div class="lifeins-amount">${fmtShort(relief)}</div>
    </div>`;
  }
  function calcIncome() {
    applyDeliveryModeUI();
    const checked = getCheckedModes();
    const hasOther = checked.some((m) => !m.prescribed);
    const dAnnual = calcDeliveryTotalIncome();
    const fedrCb = $("deliveryFEDR");
    const useFEDR = checked.length > 0 && fedrEligible(dAnnual, hasOther) && fedrCb && fedrCb.checked;
    setText("deliveryTotalIncome", fmt(dAnnual));
    checked.forEach((m) => updateModeAnnualisedDisplay(m.id));
    let dExpenses = 0;
    if (useFEDR) {
      const modeIncomes = {};
      DELIVERY_MODES.filter((m) => m.prescribed).forEach((m) => {
        const cb = modeCheckboxes[m.id];
        modeIncomes[m.id] = cb && cb.checked ? getModeAnnualIncome(m.id) : 0;
      });
      dExpenses = calcDeliveryFEDRExpenses(modeIncomes);
      DELIVERY_MODES.filter((m) => m.prescribed).forEach((m) => {
        const inc = modeIncomes[m.id];
        const exp = inc * m.rate;
        setText("fedr-" + m.id + "-base", fmt(inc));
        setText("fedr-" + m.id + "-amt", fmt(exp));
        const cb = modeCheckboxes[m.id];
        toggleClass($("fedr-" + m.id + "-row"), "hidden", !(cb && cb.checked));
      });
      setText("deliveryDeemedExpenses", fmt(dExpenses));
    } else {
      dExpenses = val("deliveryAnnualExpenses");
    }
    const netDelivery = checked.length > 0 ? Math.floor(Math.max(0, dAnnual - dExpenses)) : 0;
    const pAnnual = phcInputMode === "annual" ? val("phcAnnualDirect") : annualiseDailyIncome(val("phcDailyIncome"), val("phcDaysPerWeek"));
    let pExpenses = 0;
    if (phcFEDRCb.checked) {
      pExpenses = pAnnual * PHC_FEDR_RATE;
      setText("phcDeemedBase", fmt(pAnnual));
      setText("phcDeemedExpenses", fmt(pExpenses));
    } else {
      pExpenses = val("phcAnnualExpenses");
    }
    const netPHC = Math.floor(Math.max(0, pAnnual - pExpenses));
    const pIncomeRow = $("annualPHCIncomeRow");
    if (pIncomeRow) pIncomeRow.classList.toggle("hidden", phcInputMode === "annual");
    setText("annualPHCIncome", fmt(pAnnual));
    setText("netPHCIncome", fmt(netPHC));
    const additionalEmployment = val("additionalEmployment");
    const additionalSelfEmploy = val("additionalSelfEmploy");
    const additionalOther = val("additionalOther");
    const additional = additionalEmployment + additionalSelfEmploy + additionalOther;
    setText("netDeliveryIncome", fmt(netDelivery));
    updateIncomeSummary("deliverySummary", netDelivery, checked.length > 0, "Enter your delivery income");
    updateIncomeSummary("phcSummary", netPHC, pAnnual > 0, "Income from driving a taxi or private hire car (PHC)");
    updateIncomeSummary("additionalSummary", additional, additional > 0, "Net taxable income from other sources (employment, other trade, rental)");
    const earnedIncome = netDelivery + netPHC + additionalEmployment + additionalSelfEmploy;
    const netTrade = netDelivery + netPHC + additionalSelfEmploy;
    incomeState = { netDelivery, netPHC, additional, earnedIncome, netTrade };
    calcReliefs();
  }
  function getNsmanSelfAmount() {
    if (getSex() !== "male") return 0;
    return calcNsmanSelf(getRadio("nsmanSelf"));
  }
  function getNsmanWifeAmount() {
    if (getSex() === "male") return 0;
    return getRadio("nsmanWife") === "yes" ? NSMAN_PARENT_OR_WIFE : 0;
  }
  function getNsmanParentAmount() {
    return getRadio("nsmanParent") === "yes" ? NSMAN_PARENT_OR_WIFE : 0;
  }
  function calcRebates() {
    const total = val("totalRebates");
    setText("rebatesDisplay", fmt(total));
    setText("rs-rebates-amt", fmtShort(total));
    rebatesState = { total };
  }
  function calcReliefs() {
    const donations = val("approvedDonations");
    const donationDeduct = donations * DONATION_MULTIPLIER;
    setText("donationDeduction", fmt(donationDeduct));
    setText("rs-donations-amt", fmtShort(donationDeduct));
    if (reliefMode === "simple") {
      const simpleRaw = val("simpleTotalRelief");
      const simpleTotal = applyReliefCap(simpleRaw);
      setText("simpleReliefDisplay", fmt(simpleTotal));
      reliefState = {
        eir: 0,
        spouse: 0,
        qcr: 0,
        wmcr: 0,
        parent: 0,
        gcr: 0,
        sibling: 0,
        cpf: 0,
        lifeIns: 0,
        topup: 0,
        srs: 0,
        nsman: 0,
        total: simpleTotal,
        capped: simpleTotal,
        donations: donationDeduct,
        simpleMode: true,
        simpleRaw
      };
      calcRebates();
      finishCalc();
      return;
    }
    const earnedIncome = incomeState.earnedIncome || 0;
    const eirAmt = calcEIR(earnedIncome, getAgeBracket(), getDisabled());
    setText("rs-eir-amt", fmtShort(eirAmt));
    const eirDisplay = $("eirAutoDisplay");
    if (eirDisplay) {
      const age = getAgeBracket();
      const ageLabel = age === "under55" ? "Below 55" : age === "55to59" ? "55 to 59" : "60 and above";
      const disLabel = getDisabled() ? ", disability" : "";
      eirDisplay.textContent = `${fmt(eirAmt)} (${ageLabel}${disLabel})`;
    }
    const spouseAmt = calcSpouseRelief(getRadio("spouseRelief"));
    setText("rs-spouse-amt", fmtShort(spouseAmt));
    const isMale = getSex() === "male";
    const childArr = collectChildren();
    const qcrAmt = calcQCR(childArr);
    setText("rs-qcr-amt", fmtShort(qcrAmt));
    const wmcrAmt = calcWMCR(childArr, earnedIncome, !isMale && isWmcrEligible());
    setText("rs-wmcr-amt", fmtShort(wmcrAmt));
    const wmcrDisp = $("wmcrAutoDisplay");
    if (wmcrDisp) wmcrDisp.innerHTML = buildWMCRBreakdownHTML(childArr, earnedIncome);
    const parentArr = collectParents();
    const parentAmt = calcParentRelief(parentArr);
    setText("rs-parent-amt", fmtShort(parentAmt));
    const gcrAmt = calcGcrRelief(getRadio("gcrClaim"), isMale);
    setText("rs-gcr-amt", fmtShort(gcrAmt));
    const siblingArr = collectSiblings();
    const siblingAmt = calcSiblingRelief(siblingArr);
    setText("rs-sibling-amt", fmtShort(siblingAmt));
    const cpfMandatory = val("cpfMandatory");
    const cpfVoluntary = val("cpfVoluntary");
    const cpfContributions = cpfMandatory + cpfVoluntary;
    const increasedContributions = getRadio("cpfOperator") !== "no";
    const netTrade = incomeState.netTrade || 0;
    const cpfTotal = calcCPFRelief(cpfMandatory, cpfVoluntary, increasedContributions ? null : netTrade);
    setText("rs-cpf-amt", fmtShort(cpfTotal));
    const sepUncapped = Math.min(cpfContributions, CPF_CAP);
    const sepCapBinds = !increasedContributions && cpfTotal < sepUncapped;
    toggleClass($("cpfSepCapNote"), "hidden", !sepCapBinds);
    if (sepCapBinds) {
      setText(
        "cpfSepCapNoteText",
        `Relief capped at 37% \xD7 ${fmt(netTrade)} (net trade income) = ${fmt(cpfTotal)}.`
      );
    }
    toggleClass($("cpfVoluntaryNote"), "hidden", !(increasedContributions && cpfVoluntary > 0));
    const lifeInsEligible = cpfContributions < LIFE_INS_BUFFER;
    const lifeInsPremium = val("lifeInsPremium");
    const lifeInsInsured = val("lifeInsInsured");
    const lifeIns = calcLifeInsRelief(lifeInsPremium, lifeInsInsured, cpfTotal, cpfContributions);
    setText("rs-lifeins-amt", fmtShort(lifeIns));
    toggleClass($("lifeInsIneligible"), "hidden", lifeInsEligible);
    toggleClass($("lifeInsInputs"), "hidden", !lifeInsEligible);
    const lifeInsDisp = $("lifeInsBreakdown");
    if (lifeInsDisp) lifeInsDisp.innerHTML = buildLifeInsBreakdownHTML(lifeInsPremium, lifeInsInsured, cpfTotal, cpfContributions);
    const topup = calcTopupRelief(val("topupSelf"), val("topupFamily"));
    setText("rs-topup-amt", fmtShort(topup));
    const srs = calcSrsRelief(val("srsContribution"), getRadio("srsCitizen"));
    setText("rs-srs-amt", fmtShort(srs));
    const nsmanResult = resolveNsman(
      getNsmanSelfAmount(),
      getNsmanWifeAmount(),
      getNsmanParentAmount()
    );
    setText("rs-nsman-amt", fmtShort(nsmanResult.amount));
    let warningMsg = "", wifeParentMsg = "";
    if (nsmanResult.higher === "self") {
      warningMsg = `As you qualify for NSman Self Relief, the law does not allow a further claim as a parent of an NSman. Only NSman Self Relief (<strong>$${nsmanResult.selfAmt.toLocaleString("en-SG")}</strong>) is applied.`;
    } else if (nsmanResult.higher === "parent") {
      warningMsg = `The law does not allow NSman Self Relief and NSman Parent Relief to be claimed together. Only NSman Parent Relief (<strong>$${NSMAN_PARENT_OR_WIFE}</strong>) is applied.`;
    } else if (nsmanResult.capped) {
      wifeParentMsg = `Although your husband and your child are both NSmen, the law allows only one claim \u2014 <strong>$${NSMAN_PARENT_OR_WIFE}</strong> is applied.`;
    }
    toggleClass(nsmanCapWarn, "hidden", !warningMsg);
    if (warningMsg) nsmanCapWarnText.innerHTML = warningMsg;
    toggleClass(nsmanWPWarn, "hidden", !wifeParentMsg);
    if (wifeParentMsg) nsmanWPWarnText.innerHTML = wifeParentMsg;
    const total = eirAmt + spouseAmt + qcrAmt + wmcrAmt + parentAmt + gcrAmt + siblingAmt + cpfTotal + lifeIns + topup + srs + nsmanResult.amount;
    const capped = applyReliefCap(total);
    setText("reliefTotalDisplay", fmtShort(capped));
    setText("reliefCapRemaining", fmtShort(Math.max(0, RELIEF_CAP - total)));
    const pct = Math.min(100, total / RELIEF_CAP * 100);
    capBarFill.style.width = pct + "%";
    capBarFill.className = "cap-bar-fill" + (total > RELIEF_CAP ? " over" : "");
    capPctEl.textContent = Math.round(pct) + "%";
    capPctEl.className = "cap-pct" + (total > RELIEF_CAP ? " over" : "");
    reliefState = {
      eir: eirAmt,
      spouse: spouseAmt,
      qcr: qcrAmt,
      wmcr: wmcrAmt,
      parent: parentAmt,
      gcr: gcrAmt,
      sibling: siblingAmt,
      cpf: cpfTotal,
      lifeIns,
      topup,
      srs,
      nsman: nsmanResult.amount,
      total,
      capped,
      donations: donationDeduct,
      simpleMode: false
    };
    updateDependantAmounts();
    calcRebates();
    finishCalc();
  }
  function finishCalc() {
    const tax = computeFinalTax();
    finalTax = tax;
    updateSmartPrompts();
  }
  function hasAnyData() {
    if (incomeState.netDelivery > 0 || incomeState.netPHC > 0 || incomeState.additional > 0) return true;
    if (reliefState.simpleMode && reliefState.simpleRaw > 0) return true;
    if (!reliefState.simpleMode && reliefState.total > 0) return true;
    if (rebatesState.total > 0) return true;
    if (children.length || parents.length || siblings.length) return true;
    return false;
  }
  function computeFinalTax() {
    const total = incomeState.netDelivery + incomeState.netPHC + incomeState.additional;
    const assessable = Math.max(0, total - reliefState.donations);
    const chargeable = Math.max(0, assessable - reliefState.capped);
    const grossTax = calculateTax(chargeable);
    const rebates = Math.min(rebatesState.total, grossTax);
    return Math.max(0, grossTax - rebates);
  }
  function updateSmartPrompts() {
    const panel = $("smartPromptsPanel");
    if (!panel) return;
    if (reliefMode !== "detailed") {
      panel.classList.add("hidden");
      return;
    }
    const tips = [];
    if (isWorkingMother() && children.length > 0 && getRadio("gcrClaim") === "no") {
      tips.push("If your child is cared for by the child&rsquo;s grandparent, you may qualify for <strong>Grandparent Caregiver Relief</strong> ($3,000).");
    }
    const cpfEntered = val("cpfMandatory") + val("cpfVoluntary") > 0;
    if (incomeState.earnedIncome > 0 && reliefState.cpf === 0 && !cpfEntered && !reliefState.simpleMode) {
      tips.push("Don&rsquo;t forget your <strong>CPF / MediSave contributions</strong> &mdash; they&rsquo;re a major relief for platform workers.");
    }
    if (tips.length === 0) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      return;
    }
    panel.classList.remove("hidden");
    panel.innerHTML = `<strong>You may also be eligible for:</strong><ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>`;
  }
  function buildTaxBreakdownHtml(chargeable) {
    return buildBracketBreakdown(chargeable).map((r) => {
      const ratePct = r.rate * 100 % 1 === 0 ? (r.rate * 100).toFixed(0) + "%" : (r.rate * 100).toFixed(1) + "%";
      const desc = r.fromAmount === 0 ? `First ${fmtShort(r.slice)} @ ${r.rate === 0 ? "0%" : ratePct}` : `Next ${fmtShort(r.slice)} @ ${ratePct}`;
      return `<div class="tax-bracket-row"><span class="tbr-desc">${desc}</span><span class="tbr-amt">${fmt(r.tax)}</span></div>`;
    }).join("");
  }
  function updateResults() {
    const s = incomeState, r = reliefState, rb = rebatesState;
    const total = s.netDelivery + s.netPHC + s.additional;
    const empty = !hasAnyData();
    toggleClass($("resultsEmptyState"), "hidden", !empty);
    toggleClass($("resultsSummaryCard"), "hidden", empty);
    toggleClass($("resultsComputationCard"), "hidden", empty);
    if (empty) return;
    const donDeduct = r.donations;
    const assessable = Math.max(0, total - donDeduct);
    const reliefs = r.capped;
    const chargeable = Math.max(0, assessable - reliefs);
    const grossTax = calculateTax(chargeable);
    const rebates = Math.min(rb.total, grossTax);
    const tax = Math.max(0, grossTax - rebates);
    const giro = calcGiroMonths(tax);
    [
      [rDeliveryRow, s.netDelivery > 0],
      [rPHCRow, s.netPHC > 0],
      [rAdditRow, s.additional > 0],
      [rDonationsRow, donDeduct > 0],
      [rReliefsRow, reliefs > 0],
      [rRebatesRow, rebates > 0]
    ].forEach(([el, show]) => showHide(el, show));
    setText("r-netDelivery", fmt(s.netDelivery));
    setText("r-netPHC", fmt(s.netPHC));
    setText("r-additional", fmt(s.additional));
    setText("r-donations", fmt(donDeduct));
    setText("r-assessable", fmt(assessable));
    setText("r-chargeable", fmt(chargeable));
    setText("r-grossTaxPayable", fmt(grossTax));
    setText("r-rebates", fmt(rebates));
    setText("r-taxPayable", fmt(tax));
    setText("r-taxPayable2", fmt(tax));
    const effective = assessable > 0 ? tax / assessable * 100 : 0;
    setText("r-effectiveRate", effective.toFixed(1) + "%");
    const bracketEl = $("r-taxBracketRows");
    if (bracketEl) bracketEl.innerHTML = buildTaxBreakdownHtml(chargeable);
    const giroEl = $("r-taxMonthly");
    const giroSpanEl = $("r-taxMonthlySpan");
    if (tax <= 0) {
      if (giroEl) giroEl.textContent = "$0.00";
      if (giroSpanEl) giroSpanEl.textContent = "";
    } else if (giro.months <= 1) {
      if (giroEl) giroEl.textContent = fmt(tax) + " (lump sum)";
      if (giroSpanEl) giroSpanEl.textContent = "1 month";
    } else {
      if (giroEl) giroEl.textContent = fmt(giro.monthly) + " / month";
      if (giroSpanEl) giroSpanEl.textContent = giro.months + " months";
    }
    const reliefRawEl = $("r-reliefRaw");
    const reliefCapRow = $("r-reliefCapRow");
    const reliefCapAmt = $("r-reliefCapAmt");
    const reliefCapWarn = $("r-reliefCapWarningInline");
    if (r.simpleMode) {
      reliefBreakdown.innerHTML = r.capped > 0 ? `<div class="result-row rc-row"><span class="result-label rc-deduct">Personal reliefs (entered directly)</span><span class="result-value rc-deduct">${fmt(r.capped)}</span></div>` : "";
      if (reliefRawEl) reliefRawEl.textContent = fmt(r.capped);
      if (reliefCapRow) reliefCapRow.classList.add("hidden");
      if (reliefCapWarn) reliefCapWarn.innerHTML = r.simpleRaw > RELIEF_CAP ? `<div class="warning-box" style="margin:4px 0;"><span class="icon">&#9888;&#65039;</span><span>Your entered reliefs ($${Math.round(r.simpleRaw).toLocaleString("en-SG")}) exceed the $${RELIEF_CAP.toLocaleString("en-SG")} cap. Capped at $${RELIEF_CAP.toLocaleString("en-SG")}.</span></div>` : "";
      return;
    }
    const breakdown = [
      { label: "Earned Income Relief", amt: r.eir },
      { label: "Spouse Relief", amt: r.spouse },
      { label: "Child Relief", amt: r.qcr },
      { label: "Working Mother's Child Relief (WMCR)", amt: r.wmcr },
      { label: "Parent Relief", amt: r.parent },
      { label: "Grandparent Caregiver Relief", amt: r.gcr },
      { label: "Sibling Relief", amt: r.sibling },
      { label: "CPF Relief", amt: r.cpf },
      { label: "Life Insurance Relief", amt: r.lifeIns },
      { label: "CPF Cash Top-up Relief", amt: r.topup },
      { label: "Supplementary Retirement Scheme (SRS)", amt: r.srs },
      { label: "NSman Relief (Self / Wife / Parent)", amt: r.nsman }
    ].filter((x) => x.amt > 0);
    reliefBreakdown.innerHTML = breakdown.map(
      (b) => `<div class="result-row"><span class="result-label rc-deduct">${b.label}</span><span class="result-value rc-deduct">${fmt(b.amt)}</span></div>`
    ).join("");
    if (reliefRawEl) reliefRawEl.textContent = fmt(r.total);
    const isCapped = r.total > RELIEF_CAP;
    if (reliefCapRow) reliefCapRow.classList.toggle("hidden", !isCapped);
    if (isCapped && reliefCapAmt) reliefCapAmt.textContent = fmt(r.capped);
    if (reliefCapWarn) reliefCapWarn.innerHTML = isCapped ? `<div class="warning-box" style="margin:4px 0;"><span class="icon">&#9888;&#65039;</span><span>Your total reliefs ($${Math.round(r.total).toLocaleString("en-SG")}) exceed the $${RELIEF_CAP.toLocaleString("en-SG")} annual cap. Only $${RELIEF_CAP.toLocaleString("en-SG")} will be applied.</span></div>` : "";
  }
  $("btnPrintResults").addEventListener("click", () => {
    updateResults();
    window.print();
  });
  phcFEDRCb.addEventListener("change", () => {
    toggleClass(phcFEDRSec, "hidden", !phcFEDRCb.checked);
    toggleClass(phcActualSec, "hidden", phcFEDRCb.checked);
    calcIncome();
  });
  document.querySelectorAll('#page-income input[type="number"], #page-income select').forEach((el) => {
    el.addEventListener("input", calcIncome);
    el.addEventListener("change", calcIncome);
  });
  $("phcDaysPerWeek").addEventListener("blur", () => validateDays("phcDaysPerWeek", "phcDaysError"));
  $("phcDaysPerWeek").addEventListener("input", () => validateDays("phcDaysPerWeek", "phcDaysError"));
  DELIVERY_MODES.forEach((m) => {
    const daysEl = $("dm-" + m.id + "-days");
    if (daysEl) {
      daysEl.addEventListener("blur", () => validateDays("dm-" + m.id + "-days", "dm-" + m.id + "-daysErr"));
      daysEl.addEventListener("input", () => validateDays("dm-" + m.id + "-days", "dm-" + m.id + "-daysErr"));
    }
  });
  document.querySelectorAll('#page-reliefs input[type="number"]').forEach((el) => {
    el.addEventListener("input", calcReliefs);
    el.addEventListener("change", calcReliefs);
  });
  ["nsmanSelf", "nsmanWife", "nsmanParent"].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
      r.addEventListener("change", () => {
        if (name === "nsmanSelf") {
          toggleClass($("rs-nsman-wife-section"), "hidden", getNsmanSelfAmount() > 0 || getSex() === "male");
        }
        calcReliefs();
      });
    });
  });
  ["spouseRelief", "gcrClaim", "srsCitizen", "wmcrEligible", "cpfOperator"].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
      r.addEventListener("change", calcReliefs);
    });
  });
  document.querySelectorAll('.radio-option input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", function() {
      document.querySelectorAll(`input[name="${this.name}"]`).forEach((r) => {
        r.closest(".radio-option").classList.toggle("selected", r.checked);
      });
    });
  });
  document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach((r) => {
    r.closest(".radio-option").classList.add("selected");
  });
  window.addEventListener("beforeunload", (e) => {
    if (hasAnyData()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  applyAboutYouUI();
  renderChildren();
  renderParents();
  renderSiblings();
  calcIncome();
  updateTabProgress();
})();
