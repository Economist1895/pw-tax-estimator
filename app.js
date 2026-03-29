document.addEventListener('DOMContentLoaded', function () {

    // ── Tax brackets (YA2024+) ────────────────────────────────────────────────
    var brackets = [
        { from: 0,       to: 20000,    rate: 0.000, base: 0      },
        { from: 20000,   to: 30000,    rate: 0.020, base: 0      },
        { from: 30000,   to: 40000,    rate: 0.035, base: 200    },
        { from: 40000,   to: 80000,    rate: 0.070, base: 550    },
        { from: 80000,   to: 120000,   rate: 0.115, base: 3350   },
        { from: 120000,  to: 160000,   rate: 0.150, base: 7950   },
        { from: 160000,  to: 200000,   rate: 0.180, base: 13950  },
        { from: 200000,  to: 240000,   rate: 0.190, base: 21150  },
        { from: 240000,  to: 280000,   rate: 0.195, base: 28750  },
        { from: 280000,  to: 320000,   rate: 0.200, base: 36550  },
        { from: 320000,  to: 500000,   rate: 0.220, base: 44550  },
        { from: 500000,  to: 1000000,  rate: 0.230, base: 84150  },
        { from: 1000000, to: Infinity, rate: 0.240, base: 199150 }
    ];

    function calculateTax(income) {
        if (income <= 0) return 0;
        for (var i = 0; i < brackets.length; i++) {
            if (income <= brackets[i].to) {
                return brackets[i].base + (income - brackets[i].from) * brackets[i].rate;
            }
        }
        return 0;
    }

    // ── Formatters ────────────────────────────────────────────────────────────
    var fmtOpts2dp = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    var fmtOpts1dp = { minimumFractionDigits: 0, maximumFractionDigits: 1 };

    function fmt(n) {
        return '$' + Math.max(0, n).toLocaleString('en-SG', fmtOpts2dp);
    }
    function fmtShort(n) {
        return n >= 1000
            ? '$' + (n / 1000).toLocaleString('en-SG', fmtOpts1dp) + 'k'
            : '$' + Math.round(n).toLocaleString('en-SG');
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function val(id) {
        var el = $(id);
        if (!el) return 0;
        var v = parseFloat(el.value);
        return (isNaN(v) || v < 0) ? 0 : v;
    }
    function setText(id, text) {
        var el = $(id);
        if (el) el.textContent = text;
    }
    function showHide(el, show) {
        if (el) el.style.display = show ? '' : 'none';
    }
    function toggleClass(el, cls, force) {
        if (el) el.classList.toggle(cls, force);
    }
    function getRadio(name) {
        var el = document.querySelector('input[name="' + name + '"]:checked');
        return el ? el.value : '';
    }

    // ── Cached DOM nodes ──────────────────────────────────────────────────────
    var phcFEDRCb         = $('phcFEDR');
    var phcFEDRSec        = $('phcFEDRSection');
    var phcActualSec      = $('phcActualSection');
    var capBarFill        = $('capBarFill');
    var capPctEl          = $('capPct');
    var nsmanCapWarn      = $('nsmanCapWarning');
    var nsmanCapWarnText  = $('nsmanCapWarningText');
    var nsmanWPWarn       = $('nsmanWifeParentWarning');
    var nsmanWPWarnText   = $('nsmanWifeParentWarningText');
    var reliefBreakdown   = $('reliefBreakdownRows');

    // Result-page row elements (cached for show/hide)
    var rDeliveryRow  = $('r-netDeliveryRow');
    var rPHCRow       = $('r-netPHCRow');
    var rAdditRow     = $('r-additionalRow');
    var rDonationsRow = $('r-donationsRow');
    var rReliefsRow   = $('r-reliefsRow');
    var rRebatesRow   = $('r-rebatesRow');

    // ── Delivery mode config ──────────────────────────────────────────────────
    var MODES = [
        { id: 'foot',  rate: 0.20, prescribed: true  },
        { id: 'pmd',   rate: 0.35, prescribed: true  },
        { id: 'van',   rate: 0.60, prescribed: true  },
        { id: 'other', rate: 0,    prescribed: false }
    ];

    // ── State ─────────────────────────────────────────────────────────────────
    var deliveryInputMode = 'annual';
    var phcInputMode      = 'annual';
    var reliefMode        = 'simple';

    var incomeState = { netDelivery: 0, netPHC: 0, additional: 0 };
    var reliefState = {
        eir: 0, spouse: 0, qcr: 0, wmcr: 0, parent: 0, gcr: 0,
        sibling: 0, cpf: 0, lifeIns: 0, topup: 0, srs: 0, nsman: 0,
        total: 0, capped: 0, donations: 0, simpleMode: true, simpleRaw: 0
    };
    var rebatesState = { total: 0 };

    // ── Tab switching ─────────────────────────────────────────────────────────
    function switchTab(tab) {
        document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.tab-btn:not(.tab-reset)').forEach(function(b) { b.classList.remove('active'); });
        $('page-' + tab).classList.add('active');
        $('tab-'  + tab).classList.add('active');
        if (tab === 'result') updateResults();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    $('tab-income').addEventListener('click',  function() { switchTab('income');  });
    $('tab-reliefs').addEventListener('click', function() { switchTab('reliefs'); });
    $('tab-result').addEventListener('click',  function() { switchTab('result');  });

    $('btnContinueToReliefs').addEventListener('click', function() { switchTab('reliefs'); });
    $('btnViewResults').addEventListener('click',       function() { switchTab('result');  });

    // ── Reset button ──────────────────────────────────────────────────────────
    var resetModal = $('resetModal');
    $('tab-reset').addEventListener('click', function() {
        resetModal.classList.add('open');
    });
    $('resetCancelBtn').addEventListener('click', function() {
        resetModal.classList.remove('open');
    });
    resetModal.addEventListener('click', function(e) {
        if (e.target === resetModal) resetModal.classList.remove('open');
    });
    $('resetConfirmBtn').addEventListener('click', function() {
        // Clear all number inputs
        document.querySelectorAll('input[type="number"]').forEach(function(el) {
            el.value = '';
        });
        // Reset all radio buttons to their first (default) option
        var radioGroups = {};
        document.querySelectorAll('input[type="radio"]').forEach(function(r) {
            if (!radioGroups[r.name]) {
                radioGroups[r.name] = true;
                r.checked = true;
            } else {
                r.checked = false;
            }
        });
        // Sync radio highlights
        document.querySelectorAll('.radio-option').forEach(function(opt) {
            opt.classList.remove('selected');
        });
        document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach(function(r) {
            r.closest('.radio-option').classList.add('selected');
        });
        // Reset delivery mode checkboxes (all unchecked)
        MODES.forEach(function(m) {
            var cb = $('dm-' + m.id);
            if (cb) cb.checked = false;
        });
        // Reset FEDR toggles to checked (their default)
        var delivFEDR = $('deliveryFEDR');
        if (delivFEDR) delivFEDR.checked = true;
        var phcFEDR = $('phcFEDR');
        if (phcFEDR) phcFEDR.checked = true;
        // Reset input modes to defaults
        setDeliveryInputMode('annual');
        setPhcInputMode('annual');
        setReliefMode('simple');
        // Reset NSman disabled states
        setGroupDisabled('nsmanWifeGroup', false);
        setGroupDisabled('nsmanSelfGroup', false);
        // Close all income card accordions
        ['delivery', 'phc', 'additional'].forEach(function(key) {
            var card = $('incomeCard-' + key);
            if (card) card.classList.remove('open');
        });
        // Close all relief section accordions
        document.querySelectorAll('.relief-section').forEach(function(s) {
            s.classList.remove('open');
        });
        // Close modal, navigate to income, recalculate
        resetModal.classList.remove('open');
        switchTab('income');
        calcIncome();
    });

    // ── Income card toggles ───────────────────────────────────────────────────
    ['delivery', 'phc', 'additional'].forEach(function(key) {
        $('incomeCardHeader-' + key).addEventListener('click', function() {
            $('incomeCard-' + key).classList.toggle('open');
        });
    });

    // ── Delivery: global annual/daily toggle ──────────────────────────────────
    function setDeliveryInputMode(mode) {
        deliveryInputMode = mode;
        toggleClass($('deliveryModeAnnual'), 'active', mode === 'annual');
        toggleClass($('deliveryModeDaily'),  'active', mode === 'daily');
        // Show/hide per-mode annual vs daily sub-sections
        MODES.forEach(function(m) {
            var annualEl = $(('dm-' + m.id + '-annual'));
            var dailyEl  = $(('dm-' + m.id + '-daily'));
            if (annualEl) toggleClass(annualEl, 'hidden', mode !== 'annual');
            if (dailyEl)  toggleClass(dailyEl,  'hidden', mode === 'annual');
        });
        calcIncome();
    }
    $('deliveryModeAnnual').addEventListener('click', function() { setDeliveryInputMode('annual'); });
    $('deliveryModeDaily').addEventListener('click',  function() { setDeliveryInputMode('daily');  });

    // ── Delivery: mode checkbox logic ─────────────────────────────────────────
    function getCheckedModes() {
        return MODES.filter(function(m) { return $('dm-' + m.id) && $('dm-' + m.id).checked; });
    }

    function applyDeliveryModeUI() {
        var checked = getCheckedModes();
        var anyChecked = checked.length > 0;
        var hasOther = checked.some(function(m) { return !m.prescribed; });

        // Show/hide main income section
        toggleClass($('deliveryIncomeSection'), 'hidden', !anyChecked);

        // Show/hide per-mode income blocks
        MODES.forEach(function(m) {
            var block = $('dm-income-' + m.id);
            var isChecked = $('dm-' + m.id) && $('dm-' + m.id).checked;
            if (block) toggleClass(block, 'hidden', !isChecked);
            var label = $('dmcheck-' + m.id);
            if (label) toggleClass(label, 'checked', isChecked);
        });

        // Show total income row only when >1 mode checked
        toggleClass($('deliveryTotalIncomeRow'), 'hidden', checked.length <= 1);

        // FEDR eligibility — read current income values live
        var totalIncome = calcDeliveryTotalIncome();
        var overCap = totalIncome > 50000;
        var fedrBlocked = hasOther || overCap;

        // Warnings
        toggleClass($('fedrBlockedOther'), 'hidden', !hasOther);
        toggleClass($('fedrBlockedCap'),   'hidden', !overCap);

        // Always show the FEDR toggle row when modes are selected, but disable it when blocked
        var toggleRow = $('deliveryFEDRToggleRow');
        var fedrCb    = $('deliveryFEDR');
        var fedrToggleEl = $('deliveryFEDRToggle');
        if (toggleRow) toggleClass(toggleRow, 'hidden', !anyChecked);
        if (fedrToggleEl) toggleClass(fedrToggleEl, 'disabled', fedrBlocked);
        if (fedrBlocked && fedrCb) fedrCb.checked = false;

        // Show correct expense section
        var useFEDR = !fedrBlocked && fedrCb && fedrCb.checked;
        toggleClass($('deliveryFEDRSection'),   'hidden', !useFEDR);
        toggleClass($('deliveryActualSection'), 'hidden',  useFEDR || !anyChecked);
    }

    MODES.forEach(function(m) {
        var cb = $('dm-' + m.id);
        if (cb) cb.addEventListener('change', function() { applyDeliveryModeUI(); calcIncome(); });
    });

    $('deliveryFEDR').addEventListener('change', function() { applyDeliveryModeUI(); calcIncome(); });

    // ── Delivery: compute total income across modes ───────────────────────────
    function getModeAnnualIncome(modeId) {
        if (deliveryInputMode === 'annual') {
            return val('dm-' + modeId + '-annualIncome');
        } else {
            var rate = val('dm-' + modeId + '-dailyRate');
            var days = Math.min(7, val('dm-' + modeId + '-days'));
            var ann  = rate * days * 52;
            setText('dm-' + modeId + '-annualised', fmt(ann));
            return ann;
        }
    }

    function calcDeliveryTotalIncome() {
        var total = 0;
        getCheckedModes().forEach(function(m) { total += getModeAnnualIncome(m.id); });
        return total;
    }

    // ── PHC input mode ────────────────────────────────────────────────────────
    function setPhcInputMode(mode) {
        phcInputMode = mode;
        toggleClass($('phcModeAnnual'),           'active', mode === 'annual');
        toggleClass($('phcModeDaily'),            'active', mode === 'daily');
        toggleClass($('phcAnnualInputSection'),   'hidden', mode !== 'annual');
        toggleClass($('phcDailyInputSection'),    'hidden', mode === 'annual');
        calcIncome();
    }
    $('phcModeAnnual').addEventListener('click', function() { setPhcInputMode('annual'); });
    $('phcModeDaily').addEventListener('click',  function() { setPhcInputMode('daily');  });

    // ── Relief mode ───────────────────────────────────────────────────────────
    function setReliefMode(mode) {
        reliefMode = mode;
        toggleClass($('reliefModeSimpleBtn'),    'active', mode === 'simple');
        toggleClass($('reliefModeDetailedBtn'),  'active', mode === 'detailed');
        toggleClass($('reliefSimpleSection'),    'hidden', mode !== 'simple');
        toggleClass($('reliefDetailedSection'),  'hidden', mode !== 'detailed');
        calcReliefs();
    }
    $('reliefModeSimpleBtn').addEventListener('click',    function() { setReliefMode('simple');   });
    $('reliefModeDetailedBtn').addEventListener('click',  function() { setReliefMode('detailed'); });

    // ── Relief section accordions ─────────────────────────────────────────────
    var reliefSectionIds = [
        'rs-donations', 'rs-eir', 'rs-spouse', 'rs-qcr', 'rs-wmcr',
        'rs-parent', 'rs-gcr', 'rs-sibling', 'rs-cpf', 'rs-lifeins',
        'rs-topup', 'rs-srs', 'rs-nsman', 'rs-rebates'
    ];
    reliefSectionIds.forEach(function(id) {
        var header = $(id + '-header');
        if (header) {
            header.addEventListener('click', function() {
                $(id).classList.toggle('open');
            });
        }
    });

    // ── Validation ────────────────────────────────────────────────────────────
    function validateDays(inputId, errorId) {
        var input = $(inputId);
        var err   = $(errorId);
        if (!input || !err) return;
        var raw   = input.value.trim();
        if (raw === '') { input.classList.remove('input-error'); err.classList.remove('show'); return; }
        var v = parseFloat(raw);
        if (isNaN(v) || v < 0 || v > 7) {
            input.classList.add('input-error');
            err.classList.add('show');
            input.value = Math.min(7, Math.max(0, isNaN(v) ? 0 : Math.round(v)));
            setTimeout(function() { input.classList.remove('input-error'); err.classList.remove('show'); }, 2000);
        } else {
            if (v !== Math.floor(v)) input.value = Math.round(v);
            input.classList.remove('input-error');
            err.classList.remove('show');
        }
    }

    document.querySelectorAll('input[type="number"]').forEach(function(el) {
        el.addEventListener('keydown', function(e) {
            if (e.key === '-' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        });
        el.addEventListener('input', function() {
            if (this.value !== '' && parseFloat(this.value) < 0) this.value = 0;
        });
        el.addEventListener('focus', function() {
            if (this.value === '0' || this.value === '0.00') this.value = '';
        });
        el.addEventListener('wheel', function() {
            if (document.activeElement === this) this.blur();
        }, { passive: true });
    });

    // ── Income summary badges ─────────────────────────────────────────────────
    function updateIncomeSummary(summaryId, netAmt, hasData, emptyText) {
        var el = $(summaryId);
        if (!el) return;
        if (hasData) {
            el.innerHTML = 'Net income: <span class="net-val">' + fmt(netAmt) + '</span>';
        } else {
            el.textContent = emptyText;
        }
    }

    // ── Income calculation ────────────────────────────────────────────────────
    function calcIncome() {
        // Always re-evaluate mode UI first so FEDR eligibility reflects current income values
        applyDeliveryModeUI();

        // ── Delivery ──
        var checked  = getCheckedModes();
        var hasOther = checked.some(function(m) { return !m.prescribed; });
        var dAnnual  = calcDeliveryTotalIncome();
        var overCap  = dAnnual > 50000;
        var fedrBlocked = hasOther || overCap;
        var fedrCb   = $('deliveryFEDR');
        var useFEDR  = checked.length > 0 && !fedrBlocked && fedrCb && fedrCb.checked;

        // Show total row only when >1 mode
        setText('deliveryTotalIncome', fmt(dAnnual));

        var dExpenses = 0;
        if (useFEDR) {
            // Per-mode deemed expenses
            var footInc = $('dm-foot') && $('dm-foot').checked ? getModeAnnualIncome('foot') : 0;
            var pmdInc  = $('dm-pmd')  && $('dm-pmd').checked  ? getModeAnnualIncome('pmd')  : 0;
            var vanInc  = $('dm-van')  && $('dm-van').checked  ? getModeAnnualIncome('van')  : 0;
            var footExp = footInc * 0.20;
            var pmdExp  = pmdInc  * 0.35;
            var vanExp  = vanInc  * 0.60;
            dExpenses   = footExp + pmdExp + vanExp;

            setText('fedr-foot-amt', fmt(footExp));
            setText('fedr-pmd-amt',  fmt(pmdExp));
            setText('fedr-van-amt',  fmt(vanExp));
            setText('deliveryDeemedExpenses', fmt(dExpenses));

            // Show/hide per-mode rows in FEDR breakdown
            toggleClass($('fedr-foot-row'), 'hidden', !($('dm-foot') && $('dm-foot').checked));
            toggleClass($('fedr-pmd-row'),  'hidden', !($('dm-pmd')  && $('dm-pmd').checked));
            toggleClass($('fedr-van-row'),  'hidden', !($('dm-van')  && $('dm-van').checked));
        } else {
            dExpenses = val('deliveryAnnualExpenses');
        }

        var netDelivery = checked.length > 0 ? Math.max(0, dAnnual - dExpenses) : 0;

        // ── PHC / Driving ──
        var pAnnual = phcInputMode === 'annual'
            ? val('phcAnnualDirect')
            : val('phcDailyIncome') * Math.min(7, val('phcDaysPerWeek')) * 52;

        var pExpenses = 0;
        if (phcFEDRCb.checked) {
            pExpenses = pAnnual * 0.60;
            setText('phcDeemedExpenses', fmt(pExpenses));
        } else {
            pExpenses = val('phcAnnualExpenses');
        }
        var netPHC = Math.max(0, pAnnual - pExpenses);

        // PHC annual row visibility
        var pIncomeRow = $('annualPHCIncomeRow');
        if (pIncomeRow) pIncomeRow.classList.toggle('hidden', phcInputMode === 'annual');
        setText('annualPHCIncome', fmt(pAnnual));
        setText('netPHCIncome',    fmt(netPHC));

        // Additional
        var additional = val('additionalOther');

        setText('netDeliveryIncome', fmt(netDelivery));

        updateIncomeSummary('deliverySummary', netDelivery, checked.length > 0, 'Enter your delivery earnings');
        updateIncomeSummary('phcSummary',      netPHC,      pAnnual > 0, 'Enter your ride-hailing earnings');
        updateIncomeSummary('additionalSummary', additional, additional > 0, 'Enter your net taxable income from other sources');

        incomeState = { netDelivery: netDelivery, netPHC: netPHC, additional: additional };
        calcReliefs();
    }

    // ── NSman mutual-exclusion helpers ────────────────────────────────────────
    function setGroupDisabled(groupId, disabled) {
        var group = $(groupId);
        if (!group) return;
        group.querySelectorAll('.radio-option').forEach(function(opt) {
            var radio = opt.querySelector('input[type="radio"]');
            var isReset = radio && (radio.value === 'none' || radio.value === 'no');
            toggleClass(opt, 'disabled', disabled && !isReset);
        });
    }

    function syncRadioHighlights(name) {
        document.querySelectorAll('input[name="' + name + '"]').forEach(function(r) {
            r.closest('.radio-option').classList.toggle('selected', r.checked);
        });
    }

    function onNsmanSelfChange() {
        var selfActive = getRadio('nsmanSelf') !== 'none';
        if (selfActive) {
            var wifeNo = document.querySelector('input[name="nsmanWife"][value="no"]');
            if (wifeNo) { wifeNo.checked = true; syncRadioHighlights('nsmanWife'); }
        }
        setGroupDisabled('nsmanWifeGroup', selfActive);
        calcReliefs();
    }

    function onNsmanWifeChange() {
        var wifeActive = getRadio('nsmanWife') === 'yes';
        if (wifeActive) {
            var selfNone = document.querySelector('input[name="nsmanSelf"][value="none"]');
            if (selfNone) { selfNone.checked = true; syncRadioHighlights('nsmanSelf'); }
        }
        setGroupDisabled('nsmanSelfGroup', wifeActive);
        calcReliefs();
    }

    // ── Rebates calculation ───────────────────────────────────────────────────
    function calcRebates() {
        var total = val('totalRebates');
        setText('rebatesDisplay', fmt(total));
        setText('rs-rebates-amt', fmtShort(total));
        rebatesState = { total: total };
    }

    // ── Relief calculation ────────────────────────────────────────────────────
    function calcReliefs() {
        var donations      = val('approvedDonations');
        var donationDeduct = donations * 2.5;
        setText('donationDeduction', fmt(donationDeduct));
        setText('rs-donations-amt',  fmtShort(donationDeduct));

        // Simple mode
        if (reliefMode === 'simple') {
            var simpleRaw   = val('simpleTotalRelief');
            var simpleTotal = Math.min(simpleRaw, 80000);
            setText('simpleReliefDisplay', fmt(simpleTotal));
            reliefState = {
                eir: 0, spouse: 0, qcr: 0, wmcr: 0, parent: 0, gcr: 0,
                sibling: 0, cpf: 0, lifeIns: 0, topup: 0, srs: 0, nsman: 0,
                total: simpleTotal, capped: simpleTotal,
                donations: donationDeduct, simpleMode: true, simpleRaw: simpleRaw
            };
            calcRebates();
            return;
        }

        // Detailed mode
        var netIncome = incomeState.netDelivery + incomeState.netPHC + incomeState.additional;

        var eirAge = getRadio('eirAge');
        var eirMax = { under55: 1000, '55to59': 6000, '60plus': 8000,
                       dis_under55: 4000, dis_55to59: 10000, dis_60plus: 12000 };
        var eirAmt = eirMax[eirAge] !== undefined ? Math.min(netIncome, eirMax[eirAge]) : 0;
        setText('rs-eir-amt', fmtShort(eirAmt));

        var spouseVal = getRadio('spouseRelief');
        var spouseAmt = spouseVal === 'normal' ? 2000 : spouseVal === 'disability' ? 5500 : 0;
        setText('rs-spouse-amt', fmtShort(spouseAmt));

        var qcr       = val('qcrTotalAmt');   setText('rs-qcr-amt',    fmtShort(qcr));
        var wmcr      = val('wmcrTotalAmt');  setText('rs-wmcr-amt',   fmtShort(wmcr));
        var parentAmt = val('parentTotalAmt');setText('rs-parent-amt', fmtShort(parentAmt));
        var gcrAmt    = getRadio('gcrClaim') === 'yes' ? 3000 : 0;
        setText('rs-gcr-amt', fmtShort(gcrAmt));
        var siblingAmt = val('siblingAmt');   setText('rs-sibling-amt', fmtShort(siblingAmt));

        var cpfMandatory = Math.min(val('cpfMandatory'), 37740);
        var cpfTotal     = Math.min(cpfMandatory + val('cpfVoluntary'), 37740);
        setText('rs-cpf-amt', fmtShort(cpfTotal));

        var lifeInsRelief = cpfMandatory < 5000
            ? Math.min(val('lifeInsPremiums'), 5000 - cpfMandatory)
            : 0;
        setText('rs-lifeins-amt', fmtShort(lifeInsRelief));

        var topupAmt = Math.min(val('topupSelf'), 8000) + Math.min(val('topupFamily'), 8000);
        setText('rs-topup-amt', fmtShort(topupAmt));

        var srsCap = getRadio('srsCitizen') === 'foreign' ? 35700 : 15300;
        var srsAmt = Math.min(val('srsContribution'), srsCap);
        setText('rs-srs-amt', fmtShort(srsAmt));

        var nsmanSelfAmts = { none: 0, noactivity: 1500, activity_nonkah: 3000,
                              kah_noactivity: 3500, kah_activity: 5000 };
        var nsmanSelfAmt   = nsmanSelfAmts[getRadio('nsmanSelf')] || 0;
        var nsmanWifeAmt   = getRadio('nsmanWife')   === 'yes' ? 750 : 0;
        var nsmanParentAmt = getRadio('nsmanParent') === 'yes' ? 750 : 0;

        var warningMsg = '', wifeParentMsg = '', nsmanAmt = 0;

        if (nsmanSelfAmt > 0) {
            if (nsmanParentAmt > 0) {
                nsmanAmt = Math.max(nsmanSelfAmt, nsmanParentAmt);
                warningMsg = nsmanSelfAmt >= nsmanParentAmt
                    ? 'You and your child are both NSmen. Only the <strong>higher</strong> applies — NSman Self Relief (<strong>$' + nsmanSelfAmt.toLocaleString('en-SG') + '</strong>) is used instead of NSman Parent Relief ($750).'
                    : 'You and your child are both NSmen. Only the <strong>higher</strong> applies — NSman Parent Relief (<strong>$750</strong>) is used instead of NSman Self Relief ($' + nsmanSelfAmt.toLocaleString('en-SG') + ').';
            } else {
                nsmanAmt = nsmanSelfAmt;
            }
        } else if (nsmanWifeAmt > 0 && nsmanParentAmt > 0) {
            nsmanAmt = 750;
            wifeParentMsg = 'Your husband and child are both NSmen. NSman Wife Relief and NSman Parent Relief are capped at <strong>$750 combined</strong> — you may only claim one.';
        } else {
            nsmanAmt = nsmanWifeAmt + nsmanParentAmt;
        }
        setText('rs-nsman-amt', fmtShort(nsmanAmt));

        toggleClass(nsmanCapWarn, 'hidden', !warningMsg);
        if (warningMsg) nsmanCapWarnText.innerHTML = warningMsg;
        toggleClass(nsmanWPWarn, 'hidden', !wifeParentMsg);
        if (wifeParentMsg) nsmanWPWarnText.innerHTML = wifeParentMsg;

        var total  = eirAmt + spouseAmt + qcr + wmcr + parentAmt + gcrAmt + siblingAmt
                   + cpfTotal + lifeInsRelief + topupAmt + srsAmt + nsmanAmt;
        var capped = Math.min(total, 80000);

        setText('reliefTotalDisplay',  fmtShort(capped));
        setText('reliefCapRemaining',  fmtShort(Math.max(0, 80000 - total)));

        var pct = Math.min(100, total / 80000 * 100);
        capBarFill.style.width  = pct + '%';
        capBarFill.className    = 'cap-bar-fill' + (total > 80000 ? ' over' : '');
        capPctEl.textContent    = Math.round(pct) + '%';
        capPctEl.className      = 'cap-pct' + (total > 80000 ? ' over' : '');

        reliefState = {
            eir: eirAmt, spouse: spouseAmt, qcr: qcr, wmcr: wmcr, parent: parentAmt,
            gcr: gcrAmt, sibling: siblingAmt, cpf: cpfTotal, lifeIns: lifeInsRelief,
            topup: topupAmt, srs: srsAmt, nsman: nsmanAmt,
            total: total, capped: capped, donations: donationDeduct, simpleMode: false
        };

        calcRebates();
    }

    // ── Results page ──────────────────────────────────────────────────────────
    function buildTaxBreakdown(chargeable) {
        if (chargeable <= 0) {
            return '<div style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:12px 0;">No chargeable income.</div>';
        }
        var rows = '';
        var remaining = chargeable;
        var totalTax = 0;
        for (var i = 0; i < brackets.length; i++) {
            var b = brackets[i];
            if (remaining <= 0) break;
            var slice = Math.min(remaining, b.to - b.from);
            var tax   = slice * b.rate;
            totalTax += tax;
            var rateStr = (b.rate * 100) % 1 === 0
                ? (b.rate * 100).toFixed(0) + '%'
                : (b.rate * 100).toFixed(1) + '%';
            var sliceFmt = '$' + Math.round(slice).toLocaleString('en-SG');
            var taxFmt   = fmt(tax);
            var isFirst  = rows === '';
            rows += '<div class="tax-breakdown-row' + (isFirst ? ' first' : '') + '">'
                  + '<span class="tbr-slice">' + sliceFmt + ' &times; ' + rateStr + '</span>'
                  + '<span class="tbr-tax">' + taxFmt + '</span>'
                  + '</div>';
            remaining -= slice;
        }
        rows += '<div class="tbr-total-row">'
              + '<span class="tbr-total-label">Gross Tax Payable</span>'
              + '<span class="tbr-total-amt">' + fmt(totalTax) + '</span>'
              + '</div>';
        return rows;
    }

    function calcGiroMonths(tax) {
        if (tax <= 0) return { months: 0, monthly: 0 };
        // Minimum $20/month; max 12 months
        var months = Math.min(12, Math.floor(tax / 20));
        if (months <= 1) return { months: 1, monthly: tax };
        var monthly = tax / months;
        return { months: months, monthly: monthly };
    }

    function updateResults() {
        var s = incomeState;
        var r = reliefState;
        var rb = rebatesState;
        var total       = s.netDelivery + s.netPHC + s.additional;
        var donDeduct   = r.donations;
        var assessable  = Math.max(0, total - donDeduct);
        var reliefs     = r.capped;
        var chargeable  = Math.max(0, assessable - reliefs);
        var grossTax    = calculateTax(chargeable);
        var rebates     = Math.min(rb.total, grossTax);
        var tax         = Math.max(0, grossTax - rebates);

        var giro = calcGiroMonths(tax);

        showHide(rDeliveryRow,  s.netDelivery > 0);
        showHide(rPHCRow,       s.netPHC      > 0);
        showHide(rAdditRow,     s.additional  > 0);
        showHide(rDonationsRow, donDeduct     > 0);
        showHide(rReliefsRow,   reliefs       > 0);
        showHide(rRebatesRow,   rebates       > 0);

        setText('r-netDelivery', fmt(s.netDelivery));
        setText('r-netPHC',      fmt(s.netPHC));
        setText('r-additional',  fmt(s.additional));
        setText('r-donations',   '\u2212' + fmt(donDeduct));
        setText('r-assessable',  fmt(assessable));
        setText('r-reliefs',     '\u2212' + fmt(reliefs));
        setText('r-chargeable',  fmt(chargeable));
        setText('r-grossTax',    fmt(grossTax));
        setText('r-rebates',     '\u2212' + fmt(rebates));
        setText('r-taxPayable',  fmt(tax));
        setText('r-totalReliefs',fmt(reliefs));

        // GIRO row
        var giroEl     = $('r-taxMonthly');
        var giroSpanEl = $('r-taxMonthlySpan');
        if (tax <= 0) {
            if (giroEl)     giroEl.textContent     = '$0.00';
            if (giroSpanEl) giroSpanEl.textContent = '';
        } else if (giro.months <= 1) {
            if (giroEl)     giroEl.textContent     = fmt(tax) + ' (lump sum)';
            if (giroSpanEl) giroSpanEl.textContent = '1 month';
        } else {
            if (giroEl)     giroEl.textContent     = fmt(giro.monthly) + ' / month';
            if (giroSpanEl) giroSpanEl.textContent = giro.months + ' months';
        }

        // Progressive tax breakdown card
        var breakdownEl = $('taxBreakdownRows');
        if (breakdownEl) breakdownEl.innerHTML = buildTaxBreakdown(chargeable);

        // Relief breakdown
        if (r.simpleMode) {
            if (r.capped > 0) {
                var html = '<div class="result-row" style="border-top:none"><span class="result-label">Total Reliefs (entered directly)</span><span class="result-value">' + fmt(r.capped) + '</span></div>';
                if (r.simpleRaw > 80000) html += '<div class="warning-box" style="margin-top:10px;"><span class="icon">&#9888;&#65039;</span><span>Your entered reliefs ($' + Math.round(r.simpleRaw).toLocaleString('en-SG') + ') exceed the $80,000 cap. Capped at $80,000.</span></div>';
                reliefBreakdown.innerHTML = html;
            } else {
                reliefBreakdown.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:12px 0;">No reliefs entered.</div>';
            }
            return;
        }

        var breakdown = [
            { label: 'Earned Income Relief',                  amt: r.eir      },
            { label: 'Spouse Relief',                         amt: r.spouse   },
            { label: 'Qualifying / Handicapped Child Relief', amt: r.qcr      },
            { label: "Working Mother's Child Relief",         amt: r.wmcr     },
            { label: 'Parent Relief',                         amt: r.parent   },
            { label: 'Grandparent Caregiver Relief',          amt: r.gcr      },
            { label: 'Sibling Relief (Disability)',           amt: r.sibling  },
            { label: 'CPF / Provident Fund Relief',           amt: r.cpf      },
            { label: 'Life Insurance Relief',                 amt: r.lifeIns  },
            { label: 'CPF Cash Top-up Relief',                amt: r.topup    },
            { label: 'SRS Relief',                            amt: r.srs      },
            { label: 'NSman Relief',                          amt: r.nsman    }
        ].filter(function(x) { return x.amt > 0; });

        var rows = breakdown.length === 0
            ? '<div style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:12px 0;">No reliefs claimed yet.</div>'
            : breakdown.map(function(b, i) {
                return '<div class="result-row" style="' + (i === 0 ? 'border-top:none' : '') + '">'
                     + '<span class="result-label">' + b.label + '</span>'
                     + '<span class="result-value">' + fmt(b.amt) + '</span></div>';
              }).join('');

        if (r.total > 80000) {
            rows += '<div class="warning-box" style="margin-top:10px;"><span class="icon">&#9888;&#65039;</span><span>Your claimed reliefs ($'
                  + Math.round(r.total).toLocaleString('en-SG')
                  + ') exceed the $80,000 cap. Capped at $80,000.</span></div>';
        }
        reliefBreakdown.innerHTML = rows;
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    phcFEDRCb.addEventListener('change', function() {
        toggleClass(phcFEDRSec,  'hidden',  !phcFEDRCb.checked);
        toggleClass(phcActualSec,'hidden',   phcFEDRCb.checked);
        calcIncome();
    });

    document.querySelectorAll('#page-income input[type="number"], #page-income select').forEach(function(el) {
        el.addEventListener('input',  calcIncome);
        el.addEventListener('change', calcIncome);
    });

    // Days validation for PHC and all delivery modes
    $('phcDaysPerWeek').addEventListener('blur', function() { validateDays('phcDaysPerWeek', 'phcDaysError'); });
    ['foot', 'pmd', 'van', 'other'].forEach(function(mId) {
        var daysEl = $('dm-' + mId + '-days');
        if (daysEl) daysEl.addEventListener('blur', function() { validateDays('dm-' + mId + '-days', 'dm-' + mId + '-daysErr'); });
    });

    document.querySelectorAll('#page-reliefs input[type="number"]').forEach(function(el) {
        el.addEventListener('input',  calcReliefs);
        el.addEventListener('change', calcReliefs);
    });

    document.querySelectorAll('input[name="nsmanSelf"]').forEach(function(r) {
        r.addEventListener('change', onNsmanSelfChange);
    });
    document.querySelectorAll('input[name="nsmanWife"]').forEach(function(r) {
        r.addEventListener('change', onNsmanWifeChange);
    });

    var otherReliefRadios = ['eirAge', 'spouseRelief', 'gcrClaim', 'srsCitizen', 'nsmanParent'];
    otherReliefRadios.forEach(function(name) {
        document.querySelectorAll('input[name="' + name + '"]').forEach(function(r) {
            r.addEventListener('change', calcReliefs);
        });
    });

    document.querySelectorAll('.radio-option input[type="radio"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            document.querySelectorAll('input[name="' + this.name + '"]').forEach(function(r) {
                r.closest('.radio-option').classList.toggle('selected', r.checked);
            });
        });
    });
    document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach(function(r) {
        r.closest('.radio-option').classList.add('selected');
    });

    // ── Kick off initial calculation ──────────────────────────────────────────
    calcIncome();
});
