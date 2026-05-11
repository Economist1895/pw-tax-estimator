import { describe, it, expect } from 'vitest';
import {
    calculateTax, calcEIR, annualiseDailyIncome, fedrEligible,
    calcDeliveryFEDRExpenses, calcCPFRelief, calcLifeInsRelief,
    calcTopupRelief, calcSrsRelief, calcSpouseRelief, calcGcrRelief,
    calcNsmanSelf, resolveNsman, calcGiroMonths, buildBracketBreakdown,
    applyReliefCap, calcQCR, calcWMCR, calcParentRelief, calcSiblingRelief,
    childBaseAmount, parentBaseAmount
} from '../src/tax.js';

describe('calculateTax', () => {
    it('returns 0 for non-positive income', () => {
        expect(calculateTax(0)).toBe(0);
        expect(calculateTax(-100)).toBe(0);
    });

    it('first bracket: $0-$20,000 at 0%', () => {
        expect(calculateTax(15000)).toBe(0);
        expect(calculateTax(20000)).toBe(0);
    });

    it('boundary at $30,000 = $200', () => {
        expect(calculateTax(30000)).toBe(200);
    });

    it('boundary at $40,000 = $550', () => {
        expect(calculateTax(40000)).toBe(550);
    });

    it('boundary at $80,000 = $3,350', () => {
        expect(calculateTax(80000)).toBeCloseTo(3350, 6);
    });

    it('boundary at $120,000 = $7,950', () => {
        expect(calculateTax(120000)).toBe(7950);
    });

    it('boundary at $320,000 = $44,550', () => {
        expect(calculateTax(320000)).toBe(44550);
    });

    it('boundary at $500,000 = $84,150', () => {
        expect(calculateTax(500000)).toBe(84150);
    });

    it('boundary at $1,000,000 = $199,150', () => {
        expect(calculateTax(1000000)).toBe(199150);
    });

    it('top bracket: $1,500,000 = $319,150', () => {
        expect(calculateTax(1500000)).toBe(319150);
    });

    it('mid-bracket: $50,000 = $550 + 7% × $10k = $1,250', () => {
        expect(calculateTax(50000)).toBe(1250);
    });

    it('mid-bracket: $100,000 = $3,350 + 11.5% × $20k = $5,650', () => {
        expect(calculateTax(100000)).toBe(5650);
    });
});

describe('calcEIR', () => {
    it('returns 0 for unknown age bracket', () => {
        expect(calcEIR(50000, 'invalid', false)).toBe(0);
        expect(calcEIR(50000, '', false)).toBe(0);
    });

    it('under 55 caps at $1,000 normal / $4,000 disabled', () => {
        expect(calcEIR(50000, 'under55', false)).toBe(1000);
        expect(calcEIR(50000, 'under55', true)).toBe(4000);
    });

    it('returns earned income when below cap', () => {
        expect(calcEIR(500, 'under55', false)).toBe(500);
    });

    it('55-59 caps at $6,000 normal / $10,000 disabled', () => {
        expect(calcEIR(100000, '55to59', false)).toBe(6000);
        expect(calcEIR(100000, '55to59', true)).toBe(10000);
    });

    it('60+ caps at $8,000 normal / $12,000 disabled', () => {
        expect(calcEIR(100000, '60plus', false)).toBe(8000);
        expect(calcEIR(100000, '60plus', true)).toBe(12000);
    });
});

describe('annualiseDailyIncome', () => {
    it('multiplies rate × days × 52', () => {
        expect(annualiseDailyIncome(100, 5)).toBe(26000);
    });

    it('caps days at 7 per week', () => {
        expect(annualiseDailyIncome(100, 10)).toBe(annualiseDailyIncome(100, 7));
        expect(annualiseDailyIncome(100, 7)).toBe(36400);
    });
});

describe('fedrEligible', () => {
    it('eligible when no non-prescribed and income at/below cap', () => {
        expect(fedrEligible(50000, false)).toBe(true);
        expect(fedrEligible(0, false)).toBe(true);
    });

    it('blocked when income exceeds $50,000', () => {
        expect(fedrEligible(50001, false)).toBe(false);
    });

    it('blocked when any non-prescribed mode selected', () => {
        expect(fedrEligible(0, true)).toBe(false);
    });
});

describe('calcDeliveryFEDRExpenses', () => {
    it('applies 20%/35%/60% to foot/pmd/van', () => {
        expect(calcDeliveryFEDRExpenses({ foot: 1000, pmd: 1000, van: 1000 }))
            .toBe(200 + 350 + 600);
    });

    it('ignores non-prescribed (other) mode', () => {
        expect(calcDeliveryFEDRExpenses({ other: 10000 })).toBe(0);
    });

    it('handles missing mode keys', () => {
        expect(calcDeliveryFEDRExpenses({ foot: 1000 })).toBe(200);
        expect(calcDeliveryFEDRExpenses({})).toBe(0);
    });
});

describe('calcCPFRelief', () => {
    it('caps mandatory contributions at $37,740', () => {
        expect(calcCPFRelief(50000, 0)).toBe(37740);
    });

    it('caps total (mandatory + voluntary) at $37,740', () => {
        expect(calcCPFRelief(20000, 50000)).toBe(37740);
    });

    it('returns sum when total below cap', () => {
        expect(calcCPFRelief(20000, 10000)).toBe(30000);
    });
});

describe('calcLifeInsRelief', () => {
    it('blocked when CPF total >= $5,000', () => {
        expect(calcLifeInsRelief(5000, 5000)).toBe(0);
        expect(calcLifeInsRelief(5000, 10000)).toBe(0);
    });

    it('allowed up to $5,000 - CPF when CPF < $5,000', () => {
        expect(calcLifeInsRelief(5000, 0)).toBe(5000);
        expect(calcLifeInsRelief(5000, 2000)).toBe(3000);
    });

    it('caps at claimed amount', () => {
        expect(calcLifeInsRelief(1000, 0)).toBe(1000);
    });
});

describe('calcTopupRelief', () => {
    it('caps each leg at $8,000', () => {
        expect(calcTopupRelief(10000, 10000)).toBe(16000);
    });

    it('sums when both below cap', () => {
        expect(calcTopupRelief(5000, 3000)).toBe(8000);
    });
});

describe('calcSrsRelief', () => {
    it('caps local at $15,300', () => {
        expect(calcSrsRelief(20000, 'local')).toBe(15300);
    });

    it('caps foreign at $35,700', () => {
        expect(calcSrsRelief(40000, 'foreign')).toBe(35700);
    });

    it('treats unknown citizenship as local', () => {
        expect(calcSrsRelief(20000, '')).toBe(15300);
    });
});

describe('calcSpouseRelief', () => {
    it('returns $2,000 normal, $5,500 disability, $0 otherwise', () => {
        expect(calcSpouseRelief('normal')).toBe(2000);
        expect(calcSpouseRelief('disability')).toBe(5500);
        expect(calcSpouseRelief('none')).toBe(0);
        expect(calcSpouseRelief('')).toBe(0);
    });
});

describe('calcGcrRelief', () => {
    it('returns $3,000 only for non-male claiming yes', () => {
        expect(calcGcrRelief('yes', false)).toBe(3000);
        expect(calcGcrRelief('yes', true)).toBe(0);
        expect(calcGcrRelief('no', false)).toBe(0);
    });
});

describe('calcNsmanSelf', () => {
    it('maps activity keys to amounts', () => {
        expect(calcNsmanSelf('none')).toBe(0);
        expect(calcNsmanSelf('noactivity')).toBe(1500);
        expect(calcNsmanSelf('activity_nonkah')).toBe(3000);
        expect(calcNsmanSelf('kah_noactivity')).toBe(3500);
        expect(calcNsmanSelf('kah_activity')).toBe(5000);
    });

    it('returns 0 for unknown key', () => {
        expect(calcNsmanSelf('bogus')).toBe(0);
        expect(calcNsmanSelf('')).toBe(0);
    });
});

describe('resolveNsman', () => {
    it('returns self only when self is set alone', () => {
        expect(resolveNsman(3000, 0, 0)).toEqual({ amount: 3000 });
    });

    it('returns higher of self/parent when both set', () => {
        const r = resolveNsman(3000, 0, 750);
        expect(r.amount).toBe(3000);
        expect(r.higher).toBe('self');
        expect(r.selfAmt).toBe(3000);
    });

    it('uses parent when parent > self (edge case)', () => {
        const r = resolveNsman(500, 0, 750);
        expect(r.amount).toBe(750);
        expect(r.higher).toBe('parent');
    });

    it('caps wife + parent combined at $750', () => {
        const r = resolveNsman(0, 750, 750);
        expect(r.amount).toBe(750);
        expect(r.capped).toBe(true);
    });

    it('returns wife only when no self/parent', () => {
        expect(resolveNsman(0, 750, 0)).toEqual({ amount: 750 });
    });

    it('returns parent only when no self/wife', () => {
        expect(resolveNsman(0, 0, 750)).toEqual({ amount: 750 });
    });

    it('returns 0 amount when nothing claimed', () => {
        expect(resolveNsman(0, 0, 0)).toEqual({ amount: 0 });
    });
});

describe('calcGiroMonths', () => {
    it('returns 0 months for non-positive tax', () => {
        expect(calcGiroMonths(0)).toEqual({ months: 0, monthly: 0 });
        expect(calcGiroMonths(-1)).toEqual({ months: 0, monthly: 0 });
    });

    it('lump-sum when tax < $40 (≤1 month under $20 minimum)', () => {
        expect(calcGiroMonths(15)).toEqual({ months: 1, monthly: 15 });
        expect(calcGiroMonths(20)).toEqual({ months: 1, monthly: 20 });
        expect(calcGiroMonths(39)).toEqual({ months: 1, monthly: 39 });
    });

    it('caps at 12 months for large tax', () => {
        const r = calcGiroMonths(10000);
        expect(r.months).toBe(12);
        expect(r.monthly).toBeCloseTo(833.33, 2);
    });

    it('uses floor(tax/20) months in mid-range', () => {
        const r = calcGiroMonths(200);
        expect(r.months).toBe(10);
        expect(r.monthly).toBe(20);
    });
});

describe('buildBracketBreakdown', () => {
    it('returns empty for non-positive', () => {
        expect(buildBracketBreakdown(0)).toEqual([]);
        expect(buildBracketBreakdown(-100)).toEqual([]);
    });

    it('partial chargeable: $50,000 spans 4 brackets', () => {
        const out = buildBracketBreakdown(50000);
        expect(out).toHaveLength(4);
        expect(out[3].slice).toBe(10000);
        expect(out[3].rate).toBe(0.07);
        expect(out[3].tax).toBeCloseTo(700, 6);
        const totalTax = out.reduce((s, r) => s + r.tax, 0);
        expect(totalTax).toBeCloseTo(calculateTax(50000), 2);
    });

    it('full bracket coverage matches calculateTax for $320,000', () => {
        const out = buildBracketBreakdown(320000);
        const totalTax = out.reduce((s, r) => s + r.tax, 0);
        expect(totalTax).toBeCloseTo(calculateTax(320000), 2);
    });
});

describe('applyReliefCap', () => {
    it('caps at $80,000', () => {
        expect(applyReliefCap(100000)).toBe(80000);
        expect(applyReliefCap(80000)).toBe(80000);
    });

    it('passes through when below cap', () => {
        expect(applyReliefCap(50000)).toBe(50000);
        expect(applyReliefCap(0)).toBe(0);
    });
});

describe('childBaseAmount', () => {
    it('$4,000 for a QCR-eligible child', () => {
        expect(childBaseAmount({ ageBand: 'under16' })).toBe(4000);
        expect(childBaseAmount({ ageBand: 'studying' })).toBe(4000);
    });

    it('$7,500 for a child with disability', () => {
        expect(childBaseAmount({ ageBand: 'disabled' })).toBe(7500);
    });

    it('$0 when ineligible', () => {
        expect(childBaseAmount({ ageBand: 'noteligible' })).toBe(0);
    });
});

describe('calcQCR', () => {
    it('sums per-child amounts × share', () => {
        expect(calcQCR([
            { ageBand: 'under16',  sharePct: 100 },
            { ageBand: 'disabled', sharePct: 100 }
        ])).toBe(4000 + 7500);
    });

    it('applies share factor', () => {
        expect(calcQCR([
            { ageBand: 'under16', sharePct: 50 }
        ])).toBe(2000);
    });

    it('skips ineligible children', () => {
        expect(calcQCR([
            { ageBand: 'noteligible', sharePct: 100 },
            { ageBand: 'under16',     sharePct: 100 }
        ])).toBe(4000);
    });

    it('handles empty / invalid input', () => {
        expect(calcQCR([])).toBe(0);
        expect(calcQCR(null)).toBe(0);
    });
});

describe('calcWMCR', () => {
    it('returns 0 when not a working mother', () => {
        expect(calcWMCR([{ ageBand: 'under16', sgCitizen: true, bornFrom2024: true, sharePct: 100 }], 50000, false)).toBe(0);
    });

    it('fixed amounts for children born from 2024', () => {
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, sharePct: 100 },
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, sharePct: 100 }
        ];
        expect(calcWMCR(kids, 50000, true)).toBe(8000 + 10000);
    });

    it('% of earned income for children born before 2024', () => {
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: false, sharePct: 100 }
        ];
        expect(calcWMCR(kids, 50000, true)).toBe(50000 * 0.15);
    });

    it('skips non-SC children for WMCR but still counts SC ordering', () => {
        const kids = [
            { ageBand: 'under16', sgCitizen: false, bornFrom2024: true, sharePct: 100 },
            { ageBand: 'under16', sgCitizen: true,  bornFrom2024: true, sharePct: 100 }
        ];
        // The SC child is the 1st SC kid: $8,000
        expect(calcWMCR(kids, 50000, true)).toBe(8000);
    });

    it('caps WMCR + QCR per child at $50,000 (100% share)', () => {
        // Earned income $400,000, born before 2024, 3rd child = 25% = $100,000.
        // Mother's QCR = $4,000 (100% share) → cap: WMCR = $50,000 - $4,000 = $46,000.
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: false, sharePct: 100 },
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: false, sharePct: 100 },
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: false, sharePct: 100 }
        ];
        const total = calcWMCR(kids, 400000, true);
        // 1st (15%): $60,000 capped → WMCR = $46,000; 2nd (20%): $80,000 capped → $46,000; 3rd (25%): $100,000 capped → $46,000
        expect(total).toBe(46000 * 3);
    });

    it('caps WMCR + QCR per child at $50,000 (shared QCR)', () => {
        // Mother shares QCR 50/50 with spouse → her QCR = $2,000.
        // Earned income $320,000, born before 2024, 1st child = 15% = $48,000.
        // $2,000 (shared QCR) + $48,000 (WMCR) = $50,000 → no cap.
        // Old (buggy) code used full $4,000 QCR → capped at $46,000 instead.
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: false, sharePct: 50 }
        ];
        expect(calcWMCR(kids, 320000, true)).toBe(48000);
    });

    it('counts a disabled SC child for WMCR ordering and amount', () => {
        const kids = [
            { ageBand: 'disabled', sgCitizen: true, bornFrom2024: true, sharePct: 100 },
            { ageBand: 'under16',  sgCitizen: true, bornFrom2024: true, sharePct: 100 }
        ];
        // 1st (disabled): $8,000; 2nd: $10,000. Total = $18,000.
        expect(calcWMCR(kids, 50000, true)).toBe(18000);
    });

    it('birthOrder override pins a child to a specific WMCR tier', () => {
        // One stillborn before the only living SC child → that child is the 2nd natural birth.
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, birthOrder: 2, sharePct: 100 }
        ];
        // Tier 2 fixed = $10,000
        expect(calcWMCR(kids, 50000, true)).toBe(10000);
    });

    it('birthOrder overrides apply per child independently', () => {
        // Stillborn (1st natural), living A (SC, 2nd natural), living B (SC, 3rd natural).
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, birthOrder: 2, sharePct: 100 },
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, birthOrder: 3, sharePct: 100 }
        ];
        // A: tier 2 → $10,000; B: tier 3 → $12,000. Total = $22,000.
        expect(calcWMCR(kids, 50000, true)).toBe(22000);
    });

    it('falls back to auto-counted order when birthOrder is missing or invalid', () => {
        const kids = [
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, birthOrder: null, sharePct: 100 },
            { ageBand: 'under16', sgCitizen: true, bornFrom2024: true, sharePct: 100 }
        ];
        // Both fall back to auto: tier 1 + tier 2 = $8,000 + $10,000 = $18,000.
        expect(calcWMCR(kids, 50000, true)).toBe(18000);
    });
});

describe('parentBaseAmount', () => {
    it('$9,000 stays / $5,500 separate (no disability)', () => {
        expect(parentBaseAmount({ livesWithYou: true,  disability: false })).toBe(9000);
        expect(parentBaseAmount({ livesWithYou: false, disability: false })).toBe(5500);
    });

    it('$14,000 stays / $10,000 separate (disability)', () => {
        expect(parentBaseAmount({ livesWithYou: true,  disability: true })).toBe(14000);
        expect(parentBaseAmount({ livesWithYou: false, disability: true })).toBe(10000);
    });
});

describe('calcParentRelief', () => {
    it('sums dependant amounts × share', () => {
        expect(calcParentRelief([
            { livesWithYou: true,  disability: false, sharePct: 100 },
            { livesWithYou: false, disability: true,  sharePct: 50 }
        ])).toBe(9000 + 5000);
    });

    it('handles empty / invalid input', () => {
        expect(calcParentRelief([])).toBe(0);
        expect(calcParentRelief(null)).toBe(0);
    });
});

describe('calcSiblingRelief', () => {
    it('$5,500 per sibling × share', () => {
        expect(calcSiblingRelief([
            { sharePct: 100 },
            { sharePct: 50 }
        ])).toBe(5500 + 2750);
    });

    it('handles empty / invalid input', () => {
        expect(calcSiblingRelief([])).toBe(0);
        expect(calcSiblingRelief(null)).toBe(0);
    });
});
