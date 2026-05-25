// Pure tax computation functions. No DOM access — all inputs/outputs are values.

import {
    TAX_BRACKETS, RELIEF_CAP, EIR_CAPS, DELIVERY_MODES,
    FEDR_INCOME_CAP, CPF_CAP, LIFE_INS_BUFFER, LIFE_INS_CAP,
    TOPUP_CAP_SELF, TOPUP_CAP_FAMILY, SRS_CAP_LOCAL, SRS_CAP_FOREIGN,
    SPOUSE_RELIEF_NORMAL, SPOUSE_RELIEF_DISABILITY, GCR_AMOUNT,
    NSMAN_PARENT_OR_WIFE, NSMAN_SELF, MAX_DAYS_PER_WEEK, WEEKS_PER_YEAR,
    GIRO_MIN_MONTHLY, GIRO_MAX_MONTHS,
    QCR_AMOUNT, CHILD_DISABILITY_AMOUNT, CHILD_RELIEF_CAP_PER_CHILD,
    WMCR_FIXED, WMCR_PCT, PARENT_RELIEF, SIBLING_DISABILITY_AMOUNT
} from './constants.js';

export function calculateTax(income) {
    if (income <= 0) return 0;
    for (const b of TAX_BRACKETS) {
        if (income <= b.to) return b.base + (income - b.from) * b.rate;
    }
    return 0;
}

export function calcEIR(earnedIncome, ageBracket, disabled) {
    const caps = EIR_CAPS[ageBracket];
    if (!caps) return 0;
    return Math.min(earnedIncome, disabled ? caps.disabled : caps.normal);
}

export function annualiseDailyIncome(rate, days) {
    return rate * Math.min(MAX_DAYS_PER_WEEK, days) * WEEKS_PER_YEAR;
}

export function fedrEligible(totalIncome, hasNonPrescribedMode) {
    return !hasNonPrescribedMode && totalIncome <= FEDR_INCOME_CAP;
}

export function calcDeliveryFEDRExpenses(modeIncomes) {
    return DELIVERY_MODES
        .filter(m => m.prescribed)
        .reduce((sum, m) => sum + (modeIncomes[m.id] || 0) * m.rate, 0);
}

export function calcCPFRelief(mandatory, voluntary) {
    const m = Math.min(mandatory, CPF_CAP);
    return Math.min(m + voluntary, CPF_CAP);
}

export function calcLifeInsRelief(premium, insuredValue, cpfTotal) {
    if (cpfTotal >= LIFE_INS_BUFFER) return 0;
    if (premium <= 0 || insuredValue <= 0) return 0;
    return Math.min(LIFE_INS_CAP - cpfTotal, premium, (insuredValue * 7) / 100);
}

export function calcTopupRelief(selfAmt, familyAmt) {
    return Math.min(selfAmt, TOPUP_CAP_SELF) + Math.min(familyAmt, TOPUP_CAP_FAMILY);
}

export function calcSrsRelief(amount, citizenship) {
    const cap = citizenship === 'foreign' ? SRS_CAP_FOREIGN : SRS_CAP_LOCAL;
    return Math.min(amount, cap);
}

export function calcSpouseRelief(key) {
    if (key === 'normal') return SPOUSE_RELIEF_NORMAL;
    if (key === 'disability') return SPOUSE_RELIEF_DISABILITY;
    return 0;
}

export function calcGcrRelief(claim, isMale) {
    return (!isMale && claim === 'yes') ? GCR_AMOUNT : 0;
}

export function calcNsmanSelf(key) {
    return NSMAN_SELF[key] || 0;
}

// Resolve NSman relief precedence rules.
// Returns { amount, higher?, selfAmt?, capped? } where:
//   higher === 'self' | 'parent'  → both self & parent claimed; only the higher applies
//   capped === true               → wife + parent both claimed; combined cap of $750
export function resolveNsman(selfAmt, wifeAmt, parentAmt) {
    if (selfAmt > 0 && parentAmt > 0) {
        return {
            amount: Math.max(selfAmt, parentAmt),
            higher: selfAmt >= parentAmt ? 'self' : 'parent',
            selfAmt
        };
    }
    if (selfAmt > 0) return { amount: selfAmt };
    if (wifeAmt > 0 && parentAmt > 0) {
        return { amount: NSMAN_PARENT_OR_WIFE, capped: true };
    }
    return { amount: wifeAmt + parentAmt };
}

export function calcGiroMonths(tax) {
    if (tax <= 0) return { months: 0, monthly: 0 };
    const months = Math.min(GIRO_MAX_MONTHS, Math.floor(tax / GIRO_MIN_MONTHLY));
    if (months <= 1) return { months: 1, monthly: tax };
    return { months, monthly: tax / months };
}

export function buildBracketBreakdown(chargeable) {
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

export function applyReliefCap(total) {
    return Math.min(total, RELIEF_CAP);
}

// ── Guided dependant reliefs ────────────────────────────────────────────────

// Per-child QCR (or Child Disability Relief) before sharing.
// ageBand values: 'under16' / 'studying' (QCR), 'disabled' (Child Relief Disability), 'noteligible' (none).
export function childBaseAmount(child) {
    if (!child) return 0;
    if (child.ageBand === 'disabled') return CHILD_DISABILITY_AMOUNT;
    if (child.ageBand === 'under16' || child.ageBand === 'studying') return QCR_AMOUNT;
    return 0;
}

// Total QCR / Child Disability Relief across all children, after share factor.
// children: [{ ageBand, sharePct }]
export function calcQCR(children) {
    if (!Array.isArray(children)) return 0;
    return children.reduce((sum, c) => sum + childBaseAmount(c) * ((c.sharePct ?? 100) / 100), 0);
}

// True if the child satisfies the QCR / Child Relief (Disability) conditions,
// which is also the gating condition for WMCR.
function childQualifiesForRelief(child) {
    return !!child && child.ageBand !== 'noteligible' && childBaseAmount(child) > 0;
}

// WMCR for a single SC child at given birth order (1-indexed).
// Returns the *uncapped* WMCR contribution for that child, before share factor.
export function wmcrBaseForChild(orderIndex, child, earnedIncome) {
    if (!childQualifiesForRelief(child) || !child.sgCitizen) return 0;
    const tier = Math.min(3, Math.max(1, orderIndex));
    if (child.bornFrom2024) return WMCR_FIXED[tier];
    return WMCR_PCT[tier] * Math.max(0, earnedIncome);
}

// Total WMCR across all qualifying children, applying per-child $50k combined cap.
// Returns the WMCR-only portion (QCR is computed separately).
// children listed in order; only Singapore Citizen children get WMCR contributions.
// child.birthOrder (optional, ≥1) overrides the auto-counted position to account for
// earlier natural-born children not on this form (stillborn, deceased, or older
// non-eligible children) — per IRAS WMCR rules.
export function calcWMCR(children, earnedIncome, isWorkingMother) {
    if (!isWorkingMother || !Array.isArray(children)) return 0;
    // Count only QCR-eligible Singapore Citizen children for the auto-position.
    let scOrder = 0;
    let total = 0;
    for (const c of children) {
        if (!childQualifiesForRelief(c)) continue;
        if (!c.sgCitizen) continue;
        scOrder += 1;
        const override = parseInt(c.birthOrder, 10);
        const tier = (Number.isFinite(override) && override >= 1) ? override : scOrder;
        const qcr = childBaseAmount(c) * ((c.sharePct ?? 100) / 100);
        let wmcr = wmcrBaseForChild(tier, c, earnedIncome);
        // Per-child cap: QCR + WMCR ≤ $50,000 (using mother's actual QCR share)
        if (qcr + wmcr > CHILD_RELIEF_CAP_PER_CHILD) {
            wmcr = Math.max(0, CHILD_RELIEF_CAP_PER_CHILD - qcr);
        }
        total += wmcr;
    }
    return total;
}

// Per-parent dependant amount given residence + disability + share.
export function parentBaseAmount(p) {
    if (!p) return 0;
    if (p.disability) return p.livesWithYou ? PARENT_RELIEF.disabilityStays : PARENT_RELIEF.disabilitySeparate;
    return p.livesWithYou ? PARENT_RELIEF.stays : PARENT_RELIEF.separate;
}

// Total parent / grandparent relief across dependants (caller enforces 2-dependant max).
export function calcParentRelief(parents) {
    if (!Array.isArray(parents)) return 0;
    return parents.reduce((sum, p) => sum + parentBaseAmount(p) * ((p.sharePct ?? 100) / 100), 0);
}

// Total sibling disability relief.
export function calcSiblingRelief(siblings) {
    if (!Array.isArray(siblings)) return 0;
    return siblings.reduce((sum, s) => sum + SIBLING_DISABILITY_AMOUNT * ((s.sharePct ?? 100) / 100), 0);
}
