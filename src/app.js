import {
    DELIVERY_MODES, RELIEF_CAP, FEDR_INCOME_CAP, PHC_FEDR_RATE,
    DONATION_MULTIPLIER, NSMAN_PARENT_OR_WIFE, MAX_DAYS_PER_WEEK,
    QCR_AMOUNT, CHILD_DISABILITY_AMOUNT, SIBLING_DISABILITY_AMOUNT,
    MAX_PARENT_DEPENDANTS, WMCR_FIXED, WMCR_PCT, CHILD_RELIEF_CAP_PER_CHILD
} from './constants.js';

import {
    calculateTax, calcEIR, annualiseDailyIncome, fedrEligible,
    calcDeliveryFEDRExpenses, calcCPFRelief, calcLifeInsRelief,
    calcTopupRelief, calcSrsRelief, calcSpouseRelief, calcGcrRelief,
    calcNsmanSelf, resolveNsman, calcGiroMonths, buildBracketBreakdown,
    applyReliefCap, calcQCR, calcWMCR, calcParentRelief, calcSiblingRelief,
    childBaseAmount, wmcrBaseForChild, parentBaseAmount
} from './tax.js';

import {
    fmt, fmtShort, $, val, setText, showHide, toggleClass, getRadio
} from './dom.js';

// ── About You helpers ─────────────────────────────────────────────────────
const getSex        = () => getRadio('aboutSex');
const getAgeBracket = () => getRadio('aboutAge');
const getDisabled   = () => $('eirDisability') && $('eirDisability').checked;

function applyAboutYouUI() {
    const isMale = getSex() === 'male';
    toggleClass($('rs-wmcr'), 'hidden', isMale);
    toggleClass($('rs-gcr'),  'hidden', isMale);
    toggleClass($('rs-nsman-self-section'), 'hidden', !isMale);
    toggleClass($('rs-nsman-wife-section'), 'hidden', isMale);
    renderChildren();
    calcReliefs();
}

// ── Cached DOM nodes ──────────────────────────────────────────────────────
const phcFEDRCb        = $('phcFEDR');
const phcFEDRSec       = $('phcFEDRSection');
const phcActualSec     = $('phcActualSection');
const capBarFill       = $('capBarFill');
const capPctEl         = $('capPct');
const nsmanCapWarn     = $('nsmanCapWarning');
const nsmanCapWarnText = $('nsmanCapWarningText');
const nsmanWPWarn      = $('nsmanWifeParentWarning');
const nsmanWPWarnText  = $('nsmanWifeParentWarningText');
const reliefBreakdown  = $('r-reliefBreakdownRows');

const rDeliveryRow  = $('r-netDeliveryRow');
const rPHCRow       = $('r-netPHCRow');
const rAdditRow     = $('r-additionalRow');
const rDonationsRow = $('r-donationsRow');
const rReliefsRow   = $('r-reliefsBlock');
const rRebatesRow   = $('r-rebatesRow');

const modeCheckboxes = {};
DELIVERY_MODES.forEach(m => { modeCheckboxes[m.id] = $('dm-' + m.id); });

// ── State ─────────────────────────────────────────────────────────────────
let deliveryInputMode    = 'annual';
let phcInputMode         = 'annual';
let reliefMode           = 'simple';
let deliveryFEDRForcedOff = false;

let incomeState  = { netDelivery: 0, netPHC: 0, additional: 0, earnedIncome: 0 };
let reliefState  = {
    eir: 0, spouse: 0, qcr: 0, wmcr: 0, parent: 0, gcr: 0,
    sibling: 0, cpf: 0, lifeIns: 0, topup: 0, srs: 0, nsman: 0,
    total: 0, capped: 0, donations: 0, simpleMode: true, simpleRaw: 0
};
let rebatesState = { total: 0 };
let finalTax     = 0;

const tabOrder = ['about', 'income', 'reliefs', 'result'];
const tabCompleted = { about: false, income: false, reliefs: false, result: false };

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
    });
    $('page-' + tab).classList.add('active');
    const tabBtn = $('tab-' + tab);
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
    if (tab === 'result') updateResults();
    updateRunningTotalVisibility(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

tabOrder.forEach(tab => {
    $('tab-' + tab).addEventListener('click', () => switchTab(tab));
});

function markCompletedAndAdvance(currentTab, nextTab) {
    tabCompleted[currentTab] = true;
    updateTabProgress();
    switchTab(nextTab);
}

$('btnContinueToIncome').addEventListener('click', () => markCompletedAndAdvance('about', 'income'));
$('btnContinueToReliefs').addEventListener('click', () => markCompletedAndAdvance('income', 'reliefs'));
$('btnViewResults').addEventListener('click',       () => markCompletedAndAdvance('reliefs', 'result'));
$('btnEmptyToIncome').addEventListener('click',     () => switchTab('income'));

function updateTabProgress() {
    tabOrder.forEach(tab => {
        const btn = $('tab-' + tab);
        if (!btn) return;
        btn.classList.toggle('completed', !!tabCompleted[tab]);
    });
}

// ── Reset ─────────────────────────────────────────────────────────────────
const resetModal = $('resetModal');
$('resetLink').addEventListener('click', () => resetModal.classList.add('open'));
$('resetCancelBtn').addEventListener('click', () => resetModal.classList.remove('open'));
resetModal.addEventListener('click', e => {
    if (e.target === resetModal) resetModal.classList.remove('open');
});
$('resetConfirmBtn').addEventListener('click', () => {
    document.querySelectorAll('input[type="number"]').forEach(el => { el.value = ''; });
    const seenGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(r => {
        if (r.name.startsWith('child-') || r.name.startsWith('parent-') || r.name.startsWith('sibling-')) return;
        if (!seenGroups[r.name]) { seenGroups[r.name] = true; r.checked = true; }
        else { r.checked = false; }
    });
    document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('.radio-option input[type="radio"]:checked')
        .forEach(r => r.closest('.radio-option').classList.add('selected'));
    DELIVERY_MODES.forEach(m => {
        if (modeCheckboxes[m.id]) modeCheckboxes[m.id].checked = false;
    });
    const delivFEDR = $('deliveryFEDR'); if (delivFEDR) delivFEDR.checked = true;
    deliveryFEDRForcedOff = false;
    if (phcFEDRCb) phcFEDRCb.checked = true;
    const eirDis = $('eirDisability'); if (eirDis) { eirDis.checked = false; eirDis.closest('.checkbox-card').classList.remove('selected'); }
    setDeliveryInputMode('annual');
    setPhcInputMode('annual');
    setReliefMode('simple');
    ['delivery', 'phc', 'additional'].forEach(k => {
        const c = $('incomeCard-' + k); if (c) c.classList.remove('open');
    });
    document.querySelectorAll('.relief-section').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    children.length = 0;
    parents.length = 0;
    siblings.length = 0;
    renderChildren();
    renderParents();
    renderSiblings();
    resetModal.classList.remove('open');
    tabOrder.forEach(t => tabCompleted[t] = false);
    updateTabProgress();
    switchTab('about');
    calcIncome();
});

// ── About You listeners ───────────────────────────────────────────────────
document.querySelectorAll('input[name="aboutSex"], input[name="aboutAge"]')
    .forEach(r => {
        r.addEventListener('change', function() {
            document.querySelectorAll(`input[name="${this.name}"]`).forEach(rb => {
                rb.closest('.radio-option').classList.toggle('selected', rb.checked);
            });
            applyAboutYouUI();
        });
    });

// ── Income card toggles ───────────────────────────────────────────────────
function setIncomeCardOpen(key, open) {
    const card = $('incomeCard-' + key);
    if (!card) return;
    card.classList.toggle('open', open);
    const hdr = $('incomeCardHeader-' + key);
    if (hdr) hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
}
['delivery', 'phc', 'additional'].forEach(key => {
    const hdr = $('incomeCardHeader-' + key);
    hdr.addEventListener('click', () => {
        const card = $('incomeCard-' + key);
        const open = !card.classList.contains('open');
        setIncomeCardOpen(key, open);
    });
    hdr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const card = $('incomeCard-' + key);
            setIncomeCardOpen(key, !card.classList.contains('open'));
        }
    });
});

// ── Delivery: global annual/daily toggle ──────────────────────────────────
function setDeliveryInputMode(mode) {
    deliveryInputMode = mode;
    toggleClass($('deliveryModeAnnual'), 'active', mode === 'annual');
    toggleClass($('deliveryModeDaily'),  'active', mode === 'daily');
    DELIVERY_MODES.forEach(m => {
        toggleClass($('dm-' + m.id + '-annual'), 'hidden', mode !== 'annual');
        toggleClass($('dm-' + m.id + '-daily'),  'hidden', mode === 'annual');
    });
    calcIncome();
}
$('deliveryModeAnnual').addEventListener('click', () => setDeliveryInputMode('annual'));
$('deliveryModeDaily').addEventListener('click',  () => setDeliveryInputMode('daily'));

// ── Delivery: mode checkbox logic ─────────────────────────────────────────
function getCheckedModes() {
    return DELIVERY_MODES.filter(m => modeCheckboxes[m.id] && modeCheckboxes[m.id].checked);
}

function applyDeliveryModeUI() {
    const checked = getCheckedModes();
    const anyChecked = checked.length > 0;
    const hasOther = checked.some(m => !m.prescribed);

    toggleClass($('deliveryIncomeSection'), 'hidden', !anyChecked);

    DELIVERY_MODES.forEach(m => {
        const cb = modeCheckboxes[m.id];
        const isChecked = !!(cb && cb.checked);
        toggleClass($('dm-income-' + m.id), 'hidden', !isChecked);
        toggleClass($('dmcheck-'   + m.id), 'checked', isChecked);
    });

    toggleClass($('deliveryTotalIncomeRow'), 'hidden', checked.length <= 1);

    const totalIncome = calcDeliveryTotalIncome();
    const overCap = totalIncome > FEDR_INCOME_CAP;
    const fedrBlocked = hasOther || overCap;

    toggleClass($('fedrBlockedOther'), 'hidden', !hasOther);
    toggleClass($('fedrBlockedCap'),   'hidden', !overCap);

    const toggleRow = $('deliveryFEDRToggleRow');
    const fedrCb    = $('deliveryFEDR');
    const toggleEl  = $('deliveryFEDRToggle');
    if (toggleRow) toggleClass(toggleRow, 'hidden', !anyChecked);
    if (toggleEl)  toggleClass(toggleEl,  'disabled', fedrBlocked);
    if (fedrBlocked && fedrCb && fedrCb.checked) {
        fedrCb.checked = false;
        deliveryFEDRForcedOff = true;
    } else if (!fedrBlocked && fedrCb && deliveryFEDRForcedOff) {
        fedrCb.checked = true;
        deliveryFEDRForcedOff = false;
    }

    const useFEDR = !fedrBlocked && fedrCb && fedrCb.checked;
    toggleClass($('deliveryFEDRSection'),   'hidden', !useFEDR);
    toggleClass($('deliveryActualSection'), 'hidden',  useFEDR || !anyChecked);
}

DELIVERY_MODES.forEach(m => {
    const cb = modeCheckboxes[m.id];
    if (cb) cb.addEventListener('change', () => { applyDeliveryModeUI(); calcIncome(); });
});
$('deliveryFEDR').addEventListener('change', () => { deliveryFEDRForcedOff = false; applyDeliveryModeUI(); calcIncome(); });

function getModeAnnualIncome(modeId) {
    if (deliveryInputMode === 'annual') return val('dm-' + modeId + '-annualIncome');
    return annualiseDailyIncome(val('dm-' + modeId + '-dailyRate'), val('dm-' + modeId + '-days'));
}

function updateModeAnnualisedDisplay(modeId) {
    if (deliveryInputMode === 'daily') {
        setText('dm-' + modeId + '-annualised', fmt(getModeAnnualIncome(modeId)));
    }
}

function calcDeliveryTotalIncome() {
    return getCheckedModes().reduce((sum, m) => sum + getModeAnnualIncome(m.id), 0);
}

// ── PHC input mode ────────────────────────────────────────────────────────
function setPhcInputMode(mode) {
    phcInputMode = mode;
    toggleClass($('phcModeAnnual'),         'active', mode === 'annual');
    toggleClass($('phcModeDaily'),          'active', mode === 'daily');
    toggleClass($('phcAnnualInputSection'), 'hidden', mode !== 'annual');
    toggleClass($('phcDailyInputSection'),  'hidden', mode === 'annual');
    calcIncome();
}
$('phcModeAnnual').addEventListener('click', () => setPhcInputMode('annual'));
$('phcModeDaily').addEventListener('click',  () => setPhcInputMode('daily'));

// ── Relief mode ───────────────────────────────────────────────────────────
function setReliefMode(mode) {
    reliefMode = mode;
    toggleClass($('reliefModeSimpleBtn'),   'active', mode === 'simple');
    toggleClass($('reliefModeDetailedBtn'), 'active', mode === 'detailed');
    toggleClass($('reliefSimpleSection'),   'hidden', mode !== 'simple');
    toggleClass($('reliefDetailedSection'), 'hidden', mode !== 'detailed');
    calcReliefs();
}
$('reliefModeSimpleBtn').addEventListener('click',   () => setReliefMode('simple'));
$('reliefModeDetailedBtn').addEventListener('click', () => setReliefMode('detailed'));

// ── Relief section accordions ─────────────────────────────────────────────
const reliefSectionIds = [
    'rs-donations', 'rs-eir', 'rs-spouse', 'rs-qcr', 'rs-wmcr',
    'rs-parent', 'rs-gcr', 'rs-sibling', 'rs-cpf', 'rs-lifeins',
    'rs-topup', 'rs-srs', 'rs-nsman', 'rs-rebates'
];
reliefSectionIds.forEach(id => {
    const header = $(id + '-header');
    if (!header) return;
    function toggleOpen() {
        const sec = $(id);
        const open = !sec.classList.contains('open');
        sec.classList.toggle('open', open);
        header.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    header.addEventListener('click', toggleOpen);
    header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); }
    });
});

// ── EIR disability checkbox ───────────────────────────────────────────────
const eirDisability = $('eirDisability');
if (eirDisability) {
    eirDisability.addEventListener('change', function() {
        this.closest('.checkbox-card').classList.toggle('selected', this.checked);
        calcReliefs();
    });
}

// ── Validation ────────────────────────────────────────────────────────────
function validateDays(inputId, errorId) {
    const input = $(inputId);
    const err   = $(errorId);
    if (!input || !err) return;
    const raw = input.value.trim();
    if (raw === '') { input.classList.remove('input-error'); err.classList.remove('show'); return; }
    const v = parseFloat(raw);
    if (isNaN(v) || v < 0 || v > MAX_DAYS_PER_WEEK) {
        input.classList.add('input-error');
        err.classList.add('show');
        input.value = Math.min(MAX_DAYS_PER_WEEK, Math.max(0, isNaN(v) ? 0 : Math.round(v)));
        setTimeout(() => {
            input.classList.remove('input-error');
            err.classList.remove('show');
        }, 2000);
    } else {
        if (v !== Math.floor(v)) input.value = Math.round(v);
        input.classList.remove('input-error');
        err.classList.remove('show');
    }
}

document.querySelectorAll('input[type="number"]').forEach(el => {
    el.addEventListener('keydown', e => {
        if (e.key === '-' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    });
    el.addEventListener('input', function() {
        if (this.value !== '' && parseFloat(this.value) < 0) this.value = 0;
        if (!this.id.includes('-days') && this.id !== 'phcDaysPerWeek') {
            const v = this.value;
            if (v !== '' && v.indexOf('.') !== -1) this.value = Math.floor(parseFloat(v));
        }
    });
    el.addEventListener('focus', function() {
        if (this.value === '0' || this.value === '0.00') this.value = '';
    });
    el.addEventListener('wheel', function() {
        if (document.activeElement === this) this.blur();
    }, { passive: true });
});

// Delegated handlers for dynamically-created number inputs (e.g. dependant rows)
document.addEventListener('wheel', () => {
    if (document.activeElement?.type === 'number') document.activeElement.blur();
}, { passive: true });
document.addEventListener('touchmove', () => {
    if (document.activeElement?.type === 'number') document.activeElement.blur();
}, { passive: true });

// ── Income summary badges ─────────────────────────────────────────────────
function updateIncomeSummary(summaryId, netAmt, hasData, emptyText) {
    const el = $(summaryId);
    if (!el) return;
    if (hasData) el.innerHTML = `Net income: <span class="net-val">${fmt(netAmt)}</span>`;
    else el.textContent = emptyText;
}

// ── Guided dependant flows: state arrays + rendering ──────────────────────
const children = [];
const parents  = [];
const siblings = [];
let dependantIdCounter = 0;
const nextId = () => ++dependantIdCounter;

function isWorkingMother() { return getSex() === 'female'; }

// Read a child row from the DOM by its id.
function readSharePct(kind, id) {
    const radio = document.querySelector('input[name="' + kind + '-' + id + '-share"]:checked')?.value || '100';
    if (radio === 'custom') {
        const el = document.getElementById(kind + '-' + id + '-shareCustomPct');
        return Math.min(100, Math.max(0, parseFloat(el?.value) || 0));
    }
    return parseInt(radio, 10);
}

function readChildFromDom(id) {
    const row = document.querySelector(`.dependant-row[data-kind="child"][data-id="${id}"]`);
    if (!row) return null;
    const ageBand = row.querySelector('input[name="child-' + id + '-age"]:checked')?.value || 'under16';
    const bornFrom2024 = row.querySelector('input[name="child-' + id + '-born"]:checked')?.value === 'from2024';
    const sgCitizen = row.querySelector('input[name="child-' + id + '-sg"]:checked')?.value !== 'no';
    const birthOrderRaw = row.querySelector('input[name="child-' + id + '-birthOrder"]')?.value;
    const birthOrderNum = parseInt(birthOrderRaw, 10);
    const birthOrder = (Number.isFinite(birthOrderNum) && birthOrderNum >= 1) ? birthOrderNum : null;
    return { id, ageBand, bornFrom2024, sgCitizen, sharePct: readSharePct('child', id), birthOrder };
}
function readParentFromDom(id) {
    const row = document.querySelector(`.dependant-row[data-kind="parent"][data-id="${id}"]`);
    if (!row) return null;
    const livesWithYou = row.querySelector('input[name="parent-' + id + '-lives"]:checked')?.value === 'yes';
    const disability = row.querySelector('input[name="parent-' + id + '-disability"]')?.checked || false;
    return { id, livesWithYou, disability, sharePct: readSharePct('parent', id) };
}
function readSiblingFromDom(id) {
    const row = document.querySelector(`.dependant-row[data-kind="sibling"][data-id="${id}"]`);
    if (!row) return null;
    return { id, sharePct: readSharePct('sibling', id) };
}

function collectChildren()  { return children.map(c => readChildFromDom(c.id)).filter(Boolean); }
function collectParents()   { return parents.map(p => readParentFromDom(p.id)).filter(Boolean); }
function collectSiblings()  { return siblings.map(s => readSiblingFromDom(s.id)).filter(Boolean); }

// Build child row HTML.
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
                <label>Child's situation</label>
                <div class="radio-group">
                    <label class="radio-option selected"><input type="radio" name="child-${id}-age" value="under16" checked><div><div class="radio-label">Under 16, unmarried</div><div class="radio-sub">Annual income &lt; $8,000. Relief: $4,000.</div></div></label>
                    <label class="radio-option"><input type="radio" name="child-${id}-age" value="studying"><div><div class="radio-label">16+, unmarried, studying full-time</div><div class="radio-sub">Annual income &lt; $8,000. Relief: $4,000.</div></div></label>
                    <label class="radio-option"><input type="radio" name="child-${id}-age" value="disabled"><div><div class="radio-label">Unmarried and physically disabled or mentally impaired</div><div class="radio-sub">Any age, any income. Relief: $7,500.</div></div></label>
                    <label class="radio-option"><input type="radio" name="child-${id}-age" value="noteligible"><div><div class="radio-label">Doesn't meet the conditions</div><div class="radio-sub">e.g. married, 16+ not studying, or income &ge; $8,000.</div></div></label>
                </div>
            </div>
            ${female ? `
            <div class="form-group">
                <label>Singapore Citizen?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;">
                    <label class="radio-option selected" style="flex:1;"><input type="radio" name="child-${id}-sg" value="yes" checked><div><div class="radio-label">Yes</div><div class="radio-sub">Qualifies for WMCR</div></div></label>
                    <label class="radio-option" style="flex:1;"><input type="radio" name="child-${id}-sg" value="no"><div><div class="radio-label">No</div></div></label>
                </div>
            </div>
            <div class="form-group">
                <label>Born from 1 Jan 2024?</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;">
                    <label class="radio-option" style="flex:1;"><input type="radio" name="child-${id}-born" value="before2024" checked><div><div class="radio-label">Before 2024</div><div class="radio-sub">WMCR = % of earned income</div></div></label>
                    <label class="radio-option" style="flex:1;"><input type="radio" name="child-${id}-born" value="from2024"><div><div class="radio-label">2024 or later</div><div class="radio-sub">WMCR = fixed amount</div></div></label>
                </div>
            </div>
            <div class="form-group">
                <label for="child-${id}-birthOrder">Natural birth order (optional)</label>
                <input type="number" min="1" step="1" name="child-${id}-birthOrder" id="child-${id}-birthOrder" placeholder="auto" inputmode="numeric" style="max-width:120px;">
                <div class="form-help">Auto-counted from this child's position in the list above. Override only if there are earlier natural-born children not on this form &mdash; e.g. stillborn, deceased, or older children who don't qualify for QCR. Per IRAS, all natural-born children count toward WMCR birth order.</div>
            </div>
            ` : ''}
            <div class="form-group">
                <label>Your share of Child Relief (QCR)</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;flex-wrap:wrap;">
                    <label class="radio-option selected" style="flex:1;min-width:80px;"><input type="radio" name="child-${id}-share" value="100" checked><div><div class="radio-label">100%</div><div class="radio-sub">Sole claimant</div></div></label>
                    <label class="radio-option" style="flex:1;min-width:80px;"><input type="radio" name="child-${id}-share" value="custom"><div><div class="radio-label">Shared</div><div class="radio-sub">Enter your %</div></div></label>
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
                    <label class="radio-option" style="flex:1;"><input type="radio" name="parent-${id}-lives" value="no"><div><div class="radio-label">No</div><div class="radio-sub">Separate, you support ≥ $2,000</div></div></label>
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
                <label>Your share of the relief</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;flex-wrap:wrap;">
                    <label class="radio-option selected" style="flex:1;min-width:80px;"><input type="radio" name="parent-${id}-share" value="100" checked><div><div class="radio-label">100%</div><div class="radio-sub">Sole claimant</div></div></label>
                    <label class="radio-option" style="flex:1;min-width:80px;"><input type="radio" name="parent-${id}-share" value="custom"><div><div class="radio-label">Shared</div><div class="radio-sub">Enter your %</div></div></label>
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
                <label>Your share of the relief</label>
                <div class="radio-group" style="flex-direction:row;gap:6px;flex-wrap:wrap;">
                    <label class="radio-option selected" style="flex:1;min-width:80px;"><input type="radio" name="sibling-${id}-share" value="100" checked><div><div class="radio-label">100%</div><div class="radio-sub">Sole claimant</div></div></label>
                    <label class="radio-option" style="flex:1;min-width:80px;"><input type="radio" name="sibling-${id}-share" value="custom"><div><div class="radio-label">Shared</div><div class="radio-sub">Enter your %</div></div></label>
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

const KIND_CONFIG = {
    child:   { listId: 'childrenList', summaryId: 'childrenSummary', sectionId: 'rs-qcr',     headerId: 'rs-qcr-header',     stateArr: () => children, labelOne: 'Child',     labelMany: 'children' },
    parent:  { listId: 'parentsList',  summaryId: 'parentsSummary',  sectionId: 'rs-parent',  headerId: 'rs-parent-header',  stateArr: () => parents,  labelOne: 'Dependant', labelMany: 'dependants' },
    sibling: { listId: 'siblingsList', summaryId: 'siblingsSummary', sectionId: 'rs-sibling', headerId: 'rs-sibling-header', stateArr: () => siblings, labelOne: 'Sibling',   labelMany: 'siblings' }
};

const BUILDERS = {
    child:   buildChildRowHTML,
    parent:  buildParentRowHTML,
    sibling: buildSiblingRowHTML
};

function syncRowSelectedStates(scope) {
    scope.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
    scope.querySelectorAll('input[type="radio"]:checked').forEach(r => {
        r.closest('.radio-option').classList.add('selected');
    });
    scope.querySelectorAll('.checkbox-card').forEach(cc => {
        const cb = cc.querySelector('input[type="checkbox"]');
        cc.classList.toggle('selected', !!(cb && cb.checked));
    });
}

function attachRowEvents(row, kind) {
    row.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('input[type="radio"]')) {
            row.querySelectorAll(`input[name="${t.name}"]`).forEach(rb => {
                rb.closest('.radio-option').classList.toggle('selected', rb.checked);
            });
            if (t.name.endsWith('-share')) {
                const wrapId = t.name.replace(/-share$/, '-customShareWrap');
                const wrap = document.getElementById(wrapId);
                if (wrap) toggleClass(wrap, 'hidden', t.value !== 'custom');
            }
        } else if (t.matches('input[type="checkbox"]')) {
            const cc = t.closest('.checkbox-card');
            if (cc) cc.classList.toggle('selected', t.checked);
        }
        calcReliefs();
    });
    row.addEventListener('input', e => {
        if (e.target.matches('input[type="number"]')) calcReliefs();
    });
    const removeBtn = row.querySelector('.dependant-remove-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            const id = parseInt(row.dataset.id, 10);
            const arr = KIND_CONFIG[kind].stateArr();
            const idx = arr.findIndex(x => x.id === id);
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
        const titleEl = row.querySelector('.dependant-row-title');
        if (titleEl) titleEl.textContent = `${cfg.labelOne} ${i + 1}`;
    });
    const summary = $(cfg.summaryId);
    if (summary) {
        const n = cfg.stateArr().length;
        if (n === 0) summary.textContent = '';
        else if (kind === 'parent' && n >= MAX_PARENT_DEPENDANTS) summary.textContent = `Maximum ${MAX_PARENT_DEPENDANTS} dependants reached.`;
        else if (kind === 'parent') summary.textContent = `${n} of ${MAX_PARENT_DEPENDANTS} dependants added.`;
        else summary.textContent = `${n} ${n === 1 ? cfg.labelOne.toLowerCase() : cfg.labelMany} added.`;
    }
    if (kind === 'parent') {
        const addBtn = $('addParentBtn');
        if (addBtn) {
            const full = parents.length >= MAX_PARENT_DEPENDANTS;
            addBtn.disabled = full;
            addBtn.style.opacity = full ? '0.4' : '';
        }
    }
}

function appendDependantRow(kind, dataObj) {
    const cfg = KIND_CONFIG[kind];
    const list = $(cfg.listId);
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = BUILDERS[kind](dataObj.id, cfg.stateArr().length - 1);
    const row = wrap.firstElementChild;
    if (!row) return;
    list.appendChild(row);
    syncRowSelectedStates(row);
    attachRowEvents(row, kind);
    updateRowTitlesAndSummary(kind);
}

// Full rebuild: only used on reset/init/sex-change. Wipes any unsaved DOM state.
function renderChildren()  { rebuildList('child');   }
function renderParents()   { rebuildList('parent');  }
function renderSiblings()  { rebuildList('sibling'); }

function rebuildList(kind) {
    const cfg = KIND_CONFIG[kind];
    const list = $(cfg.listId);
    if (!list) return;
    list.innerHTML = '';
    cfg.stateArr().forEach(item => {
        const wrap = document.createElement('div');
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
    if (sec && !sec.classList.contains('open')) {
        sec.classList.add('open');
        $(cfg.headerId).setAttribute('aria-expanded', 'true');
    }
}

function addChild() {
    const item = { id: nextId() };
    children.push(item);
    appendDependantRow('child', item);
    autoOpenSection('child');
    calcReliefs();
}
function addParent() {
    if (parents.length >= MAX_PARENT_DEPENDANTS) return;
    const item = { id: nextId() };
    parents.push(item);
    appendDependantRow('parent', item);
    autoOpenSection('parent');
    calcReliefs();
}
function addSibling() {
    const item = { id: nextId() };
    siblings.push(item);
    appendDependantRow('sibling', item);
    autoOpenSection('sibling');
    calcReliefs();
}
$('addChildBtn').addEventListener('click', addChild);
$('addParentBtn').addEventListener('click', addParent);
$('addSiblingBtn').addEventListener('click', addSibling);

// Update the per-row amount display (called after calcReliefs).
function updateDependantAmounts() {
    // Children: QCR per child × share
    const cs = collectChildren();
    cs.forEach(c => {
        const amt = childBaseAmount(c) * (c.sharePct / 100);
        const el = document.querySelector(`.dependant-row[data-kind="child"][data-id="${c.id}"] [data-amount]`);
        if (el) el.textContent = fmtShort(amt);
    });
    // Parents
    const ps = collectParents();
    ps.forEach(p => {
        const amt = parentBaseAmount(p) * (p.sharePct / 100);
        const el = document.querySelector(`.dependant-row[data-kind="parent"][data-id="${p.id}"] [data-amount]`);
        if (el) el.textContent = fmtShort(amt);
    });
    // Siblings
    const ss = collectSiblings();
    ss.forEach(s => {
        const amt = SIBLING_DISABILITY_AMOUNT * (s.sharePct / 100);
        const el = document.querySelector(`.dependant-row[data-kind="sibling"][data-id="${s.id}"] [data-amount]`);
        if (el) el.textContent = fmtShort(amt);
    });
}

// ── WMCR breakdown display ────────────────────────────────────────────────
function ordinal(n) {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return n + 'th';
}

function buildWMCRBreakdownHTML(childArr, earnedIncome) {
    if (!isWorkingMother()) return 'Not applicable (working mothers only).';
    if (childArr.length === 0) return 'Add a child above to compute WMCR.';

    const rows = [];
    let scOrder = 0;
    let grandTotal = 0;
    let anyQualifying = false;

    for (const c of childArr) {
        if (c.ageBand === 'noteligible' || !childBaseAmount(c)) continue;
        if (!c.sgCitizen) continue;

        scOrder++;
        anyQualifying = true;
        const overrideRaw = parseInt(c.birthOrder, 10);
        const effectiveOrder = (Number.isFinite(overrideRaw) && overrideRaw >= 1) ? overrideRaw : scOrder;
        const cappedTier = Math.min(3, Math.max(1, effectiveOrder));
        const ord = ordinal(effectiveOrder);

        const qcr = childBaseAmount(c) * ((c.sharePct ?? 100) / 100);
        let wmcrBase;
        let formulaLine;
        if (c.bornFrom2024) {
            wmcrBase = WMCR_FIXED[cappedTier];
            formulaLine = `Fixed (${ord} child, born 2024+) = ${fmt(wmcrBase)}`;
        } else {
            const pct = WMCR_PCT[cappedTier];
            wmcrBase = pct * Math.max(0, earnedIncome);
            formulaLine = `${(pct * 100).toFixed(0)}% &times; ${fmt(earnedIncome)} (earned income) = ${fmt(wmcrBase)}`;
        }

        let cappedWmcr = wmcrBase;
        let capLine = '';
        if (qcr + wmcrBase > CHILD_RELIEF_CAP_PER_CHILD) {
            cappedWmcr = Math.max(0, CHILD_RELIEF_CAP_PER_CHILD - qcr);
            capLine = `<div class="wmcr-step">Per-child cap ($50,000 &minus; ${fmt(qcr)} QCR share) = ${fmt(cappedWmcr)}</div>`;
        }

        grandTotal += cappedWmcr;

        rows.push(`<div class="wmcr-child-block">
            <div class="wmcr-child-title">Child ${scOrder} (${ord} qualifying child)</div>
            <div class="wmcr-step">${formulaLine}</div>
            ${capLine}
            <div class="wmcr-child-amount">${fmt(cappedWmcr)}</div>
        </div>`);
    }

    if (!anyQualifying) return 'No qualifying Singapore Citizen children for WMCR.';

    const totalRow = rows.length > 1
        ? `<div class="wmcr-total">Total WMCR: <strong>${fmt(grandTotal)}</strong></div>`
        : '';

    return `<div class="wmcr-breakdown">${rows.join('')}${totalRow}</div>`;
}

// ── Income calculation ────────────────────────────────────────────────────
function calcIncome() {
    applyDeliveryModeUI();

    const checked = getCheckedModes();
    const hasOther = checked.some(m => !m.prescribed);
    const dAnnual = calcDeliveryTotalIncome();
    const fedrCb = $('deliveryFEDR');
    const useFEDR = checked.length > 0
        && fedrEligible(dAnnual, hasOther)
        && fedrCb && fedrCb.checked;

    setText('deliveryTotalIncome', fmt(dAnnual));
    checked.forEach(m => updateModeAnnualisedDisplay(m.id));

    let dExpenses = 0;
    if (useFEDR) {
        const modeIncomes = {};
        DELIVERY_MODES.filter(m => m.prescribed).forEach(m => {
            const cb = modeCheckboxes[m.id];
            modeIncomes[m.id] = (cb && cb.checked) ? getModeAnnualIncome(m.id) : 0;
        });
        dExpenses = calcDeliveryFEDRExpenses(modeIncomes);

        DELIVERY_MODES.filter(m => m.prescribed).forEach(m => {
            const inc = modeIncomes[m.id];
            const exp = inc * m.rate;
            setText('fedr-' + m.id + '-base', fmt(inc));
            setText('fedr-' + m.id + '-amt',  fmt(exp));
            const cb = modeCheckboxes[m.id];
            toggleClass($('fedr-' + m.id + '-row'), 'hidden', !(cb && cb.checked));
        });
        setText('deliveryDeemedExpenses', fmt(dExpenses));
    } else {
        dExpenses = val('deliveryAnnualExpenses');
    }

    const netDelivery = checked.length > 0 ? Math.floor(Math.max(0, dAnnual - dExpenses)) : 0;

    const pAnnual = phcInputMode === 'annual'
        ? val('phcAnnualDirect')
        : annualiseDailyIncome(val('phcDailyIncome'), val('phcDaysPerWeek'));

    let pExpenses = 0;
    if (phcFEDRCb.checked) {
        pExpenses = pAnnual * PHC_FEDR_RATE;
        setText('phcDeemedBase',     fmt(pAnnual));
        setText('phcDeemedExpenses', fmt(pExpenses));
    } else {
        pExpenses = val('phcAnnualExpenses');
    }
    const netPHC = Math.floor(Math.max(0, pAnnual - pExpenses));

    const pIncomeRow = $('annualPHCIncomeRow');
    if (pIncomeRow) pIncomeRow.classList.toggle('hidden', phcInputMode === 'annual');
    setText('annualPHCIncome', fmt(pAnnual));
    setText('netPHCIncome',    fmt(netPHC));

    const additionalEmployment = val('additionalEmployment');
    const additionalSelfEmploy = val('additionalSelfEmploy');
    const additionalOther      = val('additionalOther');
    const additional = additionalEmployment + additionalSelfEmploy + additionalOther;

    setText('netDeliveryIncome', fmt(netDelivery));

    updateIncomeSummary('deliverySummary',   netDelivery, checked.length > 0, 'Enter your delivery income');
    updateIncomeSummary('phcSummary',        netPHC,      pAnnual > 0,         'Enter your driving income');
    updateIncomeSummary('additionalSummary', additional,  additional > 0,      'Other taxable income');

    const earnedIncome = netDelivery + netPHC + additionalEmployment + additionalSelfEmploy;
    incomeState = { netDelivery, netPHC, additional, earnedIncome };
    calcReliefs();
}

// ── NSman helpers ─────────────────────────────────────────────────────────
function getNsmanSelfAmount() {
    if (getSex() !== 'male') return 0;
    return calcNsmanSelf(getRadio('nsmanSelf'));
}
function getNsmanWifeAmount() {
    if (getSex() === 'male') return 0;
    return getRadio('nsmanWife') === 'yes' ? NSMAN_PARENT_OR_WIFE : 0;
}
function getNsmanParentAmount() {
    return getRadio('nsmanParent') === 'yes' ? NSMAN_PARENT_OR_WIFE : 0;
}

// ── Rebates calculation ───────────────────────────────────────────────────
function calcRebates() {
    const total = val('totalRebates');
    setText('rebatesDisplay',  fmt(total));
    setText('rs-rebates-amt',  fmtShort(total));
    rebatesState = { total };
}

// ── Relief calculation ────────────────────────────────────────────────────
function calcReliefs() {
    const donations = val('approvedDonations');
    const donationDeduct = donations * DONATION_MULTIPLIER;
    setText('donationDeduction', fmt(donationDeduct));
    setText('rs-donations-amt',  fmtShort(donationDeduct));

    if (reliefMode === 'simple') {
        const simpleRaw = val('simpleTotalRelief');
        const simpleTotal = applyReliefCap(simpleRaw);
        setText('simpleReliefDisplay', fmt(simpleTotal));
        reliefState = {
            eir: 0, spouse: 0, qcr: 0, wmcr: 0, parent: 0, gcr: 0,
            sibling: 0, cpf: 0, lifeIns: 0, topup: 0, srs: 0, nsman: 0,
            total: simpleTotal, capped: simpleTotal,
            donations: donationDeduct, simpleMode: true, simpleRaw
        };
        calcRebates();
        finishCalc();
        return;
    }

    const earnedIncome = incomeState.earnedIncome || 0;
    const eirAmt = calcEIR(earnedIncome, getAgeBracket(), getDisabled());
    setText('rs-eir-amt', fmtShort(eirAmt));
    const eirDisplay = $('eirAutoDisplay');
    if (eirDisplay) {
        const age = getAgeBracket();
        const ageLabel = age === 'under55' ? 'Below 55'
            : age === '55to59' ? '55–59'
            : '60 & above';
        const disLabel = getDisabled() ? ', disability' : '';
        eirDisplay.textContent = `${fmt(eirAmt)} (${ageLabel}${disLabel})`;
    }

    const spouseAmt = calcSpouseRelief(getRadio('spouseRelief'));
    setText('rs-spouse-amt', fmtShort(spouseAmt));

    const isMale = getSex() === 'male';

    const childArr = collectChildren();
    const qcrAmt = calcQCR(childArr);
    setText('rs-qcr-amt', fmtShort(qcrAmt));

    const wmcrAmt = calcWMCR(childArr, earnedIncome, !isMale);
    setText('rs-wmcr-amt', fmtShort(wmcrAmt));
    const wmcrDisp = $('wmcrAutoDisplay');
    if (wmcrDisp) wmcrDisp.innerHTML = buildWMCRBreakdownHTML(childArr, earnedIncome);

    const parentArr = collectParents();
    const parentAmt = calcParentRelief(parentArr);
    setText('rs-parent-amt',  fmtShort(parentAmt));

    const gcrAmt = calcGcrRelief(getRadio('gcrClaim'), isMale);
    setText('rs-gcr-amt', fmtShort(gcrAmt));

    const siblingArr = collectSiblings();
    const siblingAmt = calcSiblingRelief(siblingArr);
    setText('rs-sibling-amt', fmtShort(siblingAmt));

    const cpfTotal = calcCPFRelief(val('cpfMandatory'), val('cpfVoluntary'));
    setText('rs-cpf-amt', fmtShort(cpfTotal));

    const lifeIns = calcLifeInsRelief(val('lifeInsRelief'), cpfTotal);
    setText('rs-lifeins-amt', fmtShort(lifeIns));

    const topup = calcTopupRelief(val('topupSelf'), val('topupFamily'));
    setText('rs-topup-amt', fmtShort(topup));

    const srs = calcSrsRelief(val('srsContribution'), getRadio('srsCitizen'));
    setText('rs-srs-amt', fmtShort(srs));

    const nsmanResult = resolveNsman(
        getNsmanSelfAmount(),
        getNsmanWifeAmount(),
        getNsmanParentAmount()
    );
    setText('rs-nsman-amt', fmtShort(nsmanResult.amount));

    let warningMsg = '', wifeParentMsg = '';
    if (nsmanResult.higher === 'self') {
        warningMsg = `You and your child are both NSmen. Only the <strong>higher</strong> applies — NSman Self Relief (<strong>$${nsmanResult.selfAmt.toLocaleString('en-SG')}</strong>) is used instead of NSman Parent Relief ($${NSMAN_PARENT_OR_WIFE}).`;
    } else if (nsmanResult.higher === 'parent') {
        warningMsg = `You and your child are both NSmen. Only the <strong>higher</strong> applies — NSman Parent Relief (<strong>$${NSMAN_PARENT_OR_WIFE}</strong>) is used instead of NSman Self Relief ($${nsmanResult.selfAmt.toLocaleString('en-SG')}).`;
    } else if (nsmanResult.capped) {
        wifeParentMsg = `Your husband and child are both NSmen. NSman Wife Relief and NSman Parent Relief are capped at <strong>$${NSMAN_PARENT_OR_WIFE} combined</strong> — you may only claim one.`;
    }
    toggleClass(nsmanCapWarn, 'hidden', !warningMsg);
    if (warningMsg) nsmanCapWarnText.innerHTML = warningMsg;
    toggleClass(nsmanWPWarn, 'hidden', !wifeParentMsg);
    if (wifeParentMsg) nsmanWPWarnText.innerHTML = wifeParentMsg;

    const total = eirAmt + spouseAmt + qcrAmt + wmcrAmt + parentAmt + gcrAmt + siblingAmt
                + cpfTotal + lifeIns + topup + srs + nsmanResult.amount;
    const capped = applyReliefCap(total);

    setText('reliefTotalDisplay', fmtShort(capped));
    setText('reliefCapRemaining', fmtShort(Math.max(0, RELIEF_CAP - total)));

    const pct = Math.min(100, total / RELIEF_CAP * 100);
    capBarFill.style.width = pct + '%';
    capBarFill.className   = 'cap-bar-fill' + (total > RELIEF_CAP ? ' over' : '');
    capPctEl.textContent   = Math.round(pct) + '%';
    capPctEl.className     = 'cap-pct' + (total > RELIEF_CAP ? ' over' : '');

    reliefState = {
        eir: eirAmt, spouse: spouseAmt, qcr: qcrAmt, wmcr: wmcrAmt, parent: parentAmt,
        gcr: gcrAmt, sibling: siblingAmt, cpf: cpfTotal, lifeIns,
        topup, srs, nsman: nsmanResult.amount,
        total, capped, donations: donationDeduct, simpleMode: false
    };

    updateDependantAmounts();
    calcRebates();
    finishCalc();
}

// ── After every recalc: running total, smart prompts, beforeunload guard ──
function finishCalc() {
    const tax = computeFinalTax();
    finalTax = tax;
    setText('runningTotalAmt', fmt(tax));
    const hasData = hasAnyData();
    document.body.classList.toggle('has-data', hasData);
    updateRunningTotalVisibility();
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
    const total      = incomeState.netDelivery + incomeState.netPHC + incomeState.additional;
    const assessable = Math.max(0, total - reliefState.donations);
    const chargeable = Math.max(0, assessable - reliefState.capped);
    const grossTax   = calculateTax(chargeable);
    const rebates    = Math.min(rebatesState.total, grossTax);
    return Math.max(0, grossTax - rebates);
}

function updateRunningTotalVisibility(activeTab) {
    const rt = $('runningTotal');
    if (!rt) return;
    const tab = activeTab || (document.querySelector('.tab-btn.active')?.id || '').replace('tab-', '');
    const shouldShow = hasAnyData() && tab !== 'result' && tab !== 'about';
    rt.classList.toggle('visible', shouldShow);
}

// Smart prompts — cross-section nudges based on entered data.
function updateSmartPrompts() {
    const panel = $('smartPromptsPanel');
    if (!panel) return;
    if (reliefMode !== 'detailed') { panel.classList.add('hidden'); return; }
    const tips = [];
    if (isWorkingMother() && children.length > 0 && getRadio('gcrClaim') === 'no') {
        tips.push('If a grandparent helps care for your child, you may qualify for <strong>Grandparent Caregiver Relief</strong> ($3,000).');
    }
    if (incomeState.earnedIncome > 0 && reliefState.cpf === 0 && !reliefState.simpleMode) {
        tips.push('Don&rsquo;t forget your <strong>CPF / MediSave contributions</strong> &mdash; they&rsquo;re a major relief for platform workers.');
    }
    if (tips.length === 0) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = `<strong>You might also be eligible for:</strong><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
}

// ── Results page ──────────────────────────────────────────────────────────
function buildTaxBreakdownHtml(chargeable) {
    return buildBracketBreakdown(chargeable).map(r => {
        const ratePct = (r.rate * 100) % 1 === 0
            ? (r.rate * 100).toFixed(0) + '%'
            : (r.rate * 100).toFixed(1) + '%';
        const desc = r.fromAmount === 0
            ? `First ${fmtShort(r.slice)} @ ${r.rate === 0 ? '0%' : ratePct}`
            : `Next ${fmtShort(r.slice)} @ ${ratePct}`;
        return `<div class="tax-bracket-row"><span class="tbr-desc">${desc}</span><span class="tbr-amt">${fmt(r.tax)}</span></div>`;
    }).join('');
}

function updateResults() {
    const s = incomeState, r = reliefState, rb = rebatesState;
    const total      = s.netDelivery + s.netPHC + s.additional;

    // Empty-state guidance: only show when the user has no data at all.
    const empty = !hasAnyData();
    toggleClass($('resultsEmptyState'), 'hidden', !empty);
    toggleClass($('resultsSummaryCard'), 'hidden', empty);
    toggleClass($('resultsComputationCard'), 'hidden', empty);
    if (empty) return;

    const donDeduct  = r.donations;
    const assessable = Math.max(0, total - donDeduct);
    const reliefs    = r.capped;
    const chargeable = Math.max(0, assessable - reliefs);
    const grossTax   = calculateTax(chargeable);
    const rebates    = Math.min(rb.total, grossTax);
    const tax        = Math.max(0, grossTax - rebates);
    const giro       = calcGiroMonths(tax);

    [
        [rDeliveryRow,  s.netDelivery > 0],
        [rPHCRow,       s.netPHC      > 0],
        [rAdditRow,     s.additional  > 0],
        [rDonationsRow, donDeduct     > 0],
        [rReliefsRow,   reliefs       > 0],
        [rRebatesRow,   rebates       > 0]
    ].forEach(([el, show]) => showHide(el, show));

    setText('r-netDelivery',     fmt(s.netDelivery));
    setText('r-netPHC',          fmt(s.netPHC));
    setText('r-additional',      fmt(s.additional));
    setText('r-donations',       fmt(donDeduct));
    setText('r-assessable',      fmt(assessable));
    setText('r-chargeable',      fmt(chargeable));
    setText('r-grossTaxPayable', fmt(grossTax));
    setText('r-rebates',         fmt(rebates));
    setText('r-taxPayable',      fmt(tax));
    setText('r-taxPayable2',     fmt(tax));

    // Effective tax rate (tax / assessable income), shown if any income.
    const effective = assessable > 0 ? (tax / assessable * 100) : 0;
    setText('r-effectiveRate', effective.toFixed(1) + '%');

    const bracketEl = $('r-taxBracketRows');
    if (bracketEl) bracketEl.innerHTML = buildTaxBreakdownHtml(chargeable);

    const giroEl     = $('r-taxMonthly');
    const giroSpanEl = $('r-taxMonthlySpan');
    if (tax <= 0) {
        if (giroEl) giroEl.textContent = '$0.00';
        if (giroSpanEl) giroSpanEl.textContent = '';
    } else if (giro.months <= 1) {
        if (giroEl) giroEl.textContent = fmt(tax) + ' (lump sum)';
        if (giroSpanEl) giroSpanEl.textContent = '1 month';
    } else {
        if (giroEl) giroEl.textContent = fmt(giro.monthly) + ' / month';
        if (giroSpanEl) giroSpanEl.textContent = giro.months + ' months';
    }

    const reliefRawEl   = $('r-reliefRaw');
    const reliefCapRow  = $('r-reliefCapRow');
    const reliefCapAmt  = $('r-reliefCapAmt');
    const reliefCapWarn = $('r-reliefCapWarningInline');

    if (r.simpleMode) {
        reliefBreakdown.innerHTML = r.capped > 0
            ? `<div class="result-row rc-row"><span class="result-label rc-deduct">Personal reliefs (entered directly)</span><span class="result-value rc-deduct">${fmt(r.capped)}</span></div>`
            : '';
        if (reliefRawEl) reliefRawEl.textContent = fmt(r.capped);
        if (reliefCapRow) reliefCapRow.classList.add('hidden');
        if (reliefCapWarn) reliefCapWarn.innerHTML = r.simpleRaw > RELIEF_CAP
            ? `<div class="warning-box" style="margin:4px 0;"><span class="icon">&#9888;&#65039;</span><span>Your entered reliefs ($${Math.round(r.simpleRaw).toLocaleString('en-SG')}) exceed the $${RELIEF_CAP.toLocaleString('en-SG')} cap. Capped at $${RELIEF_CAP.toLocaleString('en-SG')}.</span></div>`
            : '';
        return;
    }

    const breakdown = [
        { label: 'Earned Income Relief',                                           amt: r.eir },
        { label: 'Spouse Relief',                                                  amt: r.spouse },
        { label: 'Child Relief (QCR / Disability)',                                amt: r.qcr },
        { label: "Working Mother's Child Relief (WMCR)",                           amt: r.wmcr },
        { label: 'Parent Relief / Parent Relief (Disability)',                     amt: r.parent },
        { label: 'Grandparent Caregiver Relief',                                   amt: r.gcr },
        { label: 'Sibling Relief (Disability)',                                    amt: r.sibling },
        { label: 'CPF / Provident Fund Relief',                                    amt: r.cpf },
        { label: 'Life Insurance Relief',                                          amt: r.lifeIns },
        { label: 'CPF Cash Top-up Relief',                                         amt: r.topup },
        { label: 'Supplementary Retirement Scheme (SRS)',                          amt: r.srs },
        { label: 'NSman Relief (Self / Wife / Parent)',                            amt: r.nsman }
    ].filter(x => x.amt > 0);

    reliefBreakdown.innerHTML = breakdown.map(b =>
        `<div class="result-row"><span class="result-label rc-deduct">${b.label}</span><span class="result-value rc-deduct">${fmt(b.amt)}</span></div>`
    ).join('');

    if (reliefRawEl) reliefRawEl.textContent = fmt(r.total);

    const isCapped = r.total > RELIEF_CAP;
    if (reliefCapRow) reliefCapRow.classList.toggle('hidden', !isCapped);
    if (isCapped && reliefCapAmt) reliefCapAmt.textContent = fmt(r.capped);

    if (reliefCapWarn) reliefCapWarn.innerHTML = isCapped
        ? `<div class="warning-box" style="margin:4px 0;"><span class="icon">&#9888;&#65039;</span><span>Your total reliefs ($${Math.round(r.total).toLocaleString('en-SG')}) exceed the $${RELIEF_CAP.toLocaleString('en-SG')} annual cap. Only $${RELIEF_CAP.toLocaleString('en-SG')} will be applied.</span></div>`
        : '';
}

// ── Print ─────────────────────────────────────────────────────────────────
$('btnPrintResults').addEventListener('click', () => {
    updateResults();
    window.print();
});

// ── Event listeners ───────────────────────────────────────────────────────
phcFEDRCb.addEventListener('change', () => {
    toggleClass(phcFEDRSec,   'hidden', !phcFEDRCb.checked);
    toggleClass(phcActualSec, 'hidden',  phcFEDRCb.checked);
    calcIncome();
});

document.querySelectorAll('#page-income input[type="number"], #page-income select').forEach(el => {
    el.addEventListener('input',  calcIncome);
    el.addEventListener('change', calcIncome);
});

$('phcDaysPerWeek').addEventListener('blur',  () => validateDays('phcDaysPerWeek', 'phcDaysError'));
$('phcDaysPerWeek').addEventListener('input', () => validateDays('phcDaysPerWeek', 'phcDaysError'));
DELIVERY_MODES.forEach(m => {
    const daysEl = $('dm-' + m.id + '-days');
    if (daysEl) {
        daysEl.addEventListener('blur',  () => validateDays('dm-' + m.id + '-days', 'dm-' + m.id + '-daysErr'));
        daysEl.addEventListener('input', () => validateDays('dm-' + m.id + '-days', 'dm-' + m.id + '-daysErr'));
    }
});

document.querySelectorAll('#page-reliefs input[type="number"]').forEach(el => {
    el.addEventListener('input',  calcReliefs);
    el.addEventListener('change', calcReliefs);
});

['nsmanSelf', 'nsmanWife', 'nsmanParent'].forEach(name => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
        r.addEventListener('change', () => {
            if (name === 'nsmanSelf') {
                toggleClass($('rs-nsman-wife-section'), 'hidden', getNsmanSelfAmount() > 0 || getSex() === 'male');
            }
            calcReliefs();
        });
    });
});

['spouseRelief', 'gcrClaim', 'srsCitizen'].forEach(name => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
        r.addEventListener('change', calcReliefs);
    });
});

document.querySelectorAll('.radio-option input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', function() {
        document.querySelectorAll(`input[name="${this.name}"]`).forEach(r => {
            r.closest('.radio-option').classList.toggle('selected', r.checked);
        });
    });
});
document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach(r => {
    r.closest('.radio-option').classList.add('selected');
});

// ── beforeunload guard ───────────────────────────────────────────────────
window.addEventListener('beforeunload', e => {
    if (hasAnyData()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ── Initial render ────────────────────────────────────────────────────────
applyAboutYouUI();
renderChildren();
renderParents();
renderSiblings();
calcIncome();
updateTabProgress();
