// Integration tests: load index.html into JSDOM, run app.js, simulate user
// interactions, and check end-to-end behaviour.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

async function loadApp() {
    const dom = new JSDOM(html, {
        url: 'http://localhost/',
        pretendToBeVisual: true,
        runScripts: 'outside-only'
    });
    // Stub scrollTo since JSDOM doesn't implement it.
    dom.window.scrollTo = () => {};
    // Wire imports manually using dynamic import on the actual module files —
    // JSDOM doesn't run external <script> tags reliably with module type.
    // Instead, hand the JSDOM document/window to the modules by setting globals.
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Element = dom.window.Element;
    global.Node = dom.window.Node;
    global.getComputedStyle = dom.window.getComputedStyle;

    // Bust module cache so each test gets a fresh app
    vi.resetModules();
    await import('../src/app.js?t=' + Math.random());
    return dom;
}

function setRadio(doc, name, value) {
    const r = doc.querySelector(`input[name="${name}"][value="${value}"]`);
    r.checked = true;
    r.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}
function setNumber(doc, id, value) {
    const el = doc.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    el.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}
function clickCheckbox(doc, id) {
    const el = doc.getElementById(id);
    el.checked = !el.checked;
    el.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}
function clickEl(doc, id) {
    doc.getElementById(id).dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
}

describe('end-to-end scenarios', () => {
    let dom, doc;

    beforeEach(async () => {
        dom = await loadApp();
        doc = dom.window.document;
    });

    it('renders the about page by default', () => {
        expect(doc.getElementById('page-about').classList.contains('active')).toBe(true);
        expect(doc.getElementById('tab-about').classList.contains('active')).toBe(true);
    });

    it('male, under 55, $30k foot delivery, FEDR ON, detailed reliefs → EIR applies', () => {
        // Defaults: aboutSex=male, aboutAge=under55, aboutDisabled=no
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 30000);
        // Switch to detailed mode so EIR auto-applies
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'tab-result');

        // Net delivery = 30000 - 30000*0.20 = 24000
        // Earned income = 24000, EIR = 1000 (under 55, normal)
        // Chargeable = 24000 - 1000 = 23000
        // Tax = (23000 - 20000) * 0.02 = 60
        expect(doc.getElementById('r-netDelivery').textContent).toBe('$24,000.00');
        expect(doc.getElementById('r-chargeable').textContent).toBe('$23,000.00');
        expect(doc.getElementById('r-grossTaxPayable').textContent).toBe('$60.00');
        expect(doc.getElementById('r-taxPayable').textContent).toBe('$60.00');
    });

    it('simple-mode with no relief entered: full chargeable income (no EIR auto-applied)', () => {
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 30000);
        // Default simple mode, no simpleTotalRelief entered → reliefs = 0
        clickEl(doc, 'tab-result');
        expect(doc.getElementById('r-netDelivery').textContent).toBe('$24,000.00');
        // Chargeable = 24000 (no EIR in simple mode unless user enters it)
        expect(doc.getElementById('r-chargeable').textContent).toBe('$24,000.00');
        expect(doc.getElementById('r-grossTaxPayable').textContent).toBe('$80.00');
    });

    it('non-resident-relevant: female with WMCR + GCR, simple mode', () => {
        setRadio(doc, 'aboutSex', 'female');
        // Use simple-mode reliefs
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeSimpleBtn');
        setNumber(doc, 'simpleTotalRelief', 15000);
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 60000);
        // 60k > FEDR cap of $50k, so FEDR auto-blocked. Need actual expenses.
        setNumber(doc, 'deliveryAnnualExpenses', 10000);
        clickEl(doc, 'tab-result');

        // Net delivery = 60000 - 10000 = 50000
        // Reliefs = 15000 (simple)
        // Chargeable = 50000 - 15000 = 35000
        // Tax = 200 + (35000 - 30000) * 0.035 = 200 + 175 = 375
        expect(doc.getElementById('r-netDelivery').textContent).toBe('$50,000.00');
        expect(doc.getElementById('r-chargeable').textContent).toBe('$35,000.00');
        expect(doc.getElementById('r-taxPayable').textContent).toBe('$375.00');
    });

    it('FEDR auto-blocks when delivery income exceeds $50k cap', () => {
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 49000);
        // FEDR allowed at $49k
        expect(doc.getElementById('deliveryFEDR').checked).toBe(true);
        expect(doc.getElementById('fedrBlockedCap').classList.contains('hidden')).toBe(true);

        setNumber(doc, 'dm-foot-annualIncome', 51000);
        // FEDR auto-blocked at $51k
        expect(doc.getElementById('deliveryFEDR').checked).toBe(false);
        expect(doc.getElementById('fedrBlockedCap').classList.contains('hidden')).toBe(false);

        // Drop back below cap: FEDR auto-restores
        setNumber(doc, 'dm-foot-annualIncome', 49000);
        expect(doc.getElementById('deliveryFEDR').checked).toBe(true);
        expect(doc.getElementById('fedrBlockedCap').classList.contains('hidden')).toBe(true);
    });

    it('FEDR auto-blocks when "other" mode is selected', () => {
        clickCheckbox(doc, 'dm-foot');
        clickCheckbox(doc, 'dm-other');
        expect(doc.getElementById('deliveryFEDR').checked).toBe(false);
        expect(doc.getElementById('fedrBlockedOther').classList.contains('hidden')).toBe(false);
    });

    it('PHC daily mode annualises rate × days × 52', () => {
        clickEl(doc, 'phcModeDaily');
        setNumber(doc, 'phcDailyIncome', 200);
        setNumber(doc, 'phcDaysPerWeek', 5);
        // Annual = 200 * 5 * 52 = 52000
        // PHC FEDR 60% on, so net = 52000 * 0.40 = 20800
        clickEl(doc, 'tab-result');
        expect(doc.getElementById('r-netPHC').textContent).toBe('$20,800.00');
    });

    it('NSman self + parent: shows higher of two with warning', () => {
        // Default: male
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        setRadio(doc, 'nsmanSelf', 'kah_activity'); // $5000
        setRadio(doc, 'nsmanParent', 'yes'); // $750

        const warn = doc.getElementById('nsmanCapWarning');
        expect(warn.classList.contains('hidden')).toBe(false);
        expect(doc.getElementById('nsmanCapWarningText').textContent)
            .toMatch(/NSman Self Relief.*5,000/);
    });

    it('NSman wife + parent caps at $750 combined', () => {
        setRadio(doc, 'aboutSex', 'female');
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        setRadio(doc, 'nsmanWife', 'yes');
        setRadio(doc, 'nsmanParent', 'yes');

        const warn = doc.getElementById('nsmanWifeParentWarning');
        expect(warn.classList.contains('hidden')).toBe(false);
    });

    it('relief cap at $80k shows warning', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeSimpleBtn');
        setNumber(doc, 'simpleTotalRelief', 100000);
        clickEl(doc, 'tab-result');
        const warn = doc.getElementById('r-reliefCapWarningInline');
        expect(warn.innerHTML).toMatch(/exceed the \$80,000 cap/);
    });

    it('rebates capped at gross tax', () => {
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 25000);
        // Simple mode (default), no reliefs entered.
        // Net delivery = 25000 - 25000 × 20% FEDR = 20000. Chargeable = 20000. Tax = $0 (first $20k at 0%).
        clickEl(doc, 'tab-reliefs');
        setNumber(doc, 'totalRebates', 5000);
        clickEl(doc, 'tab-result');
        expect(doc.getElementById('r-grossTaxPayable').textContent).toBe('$0.00');
        expect(doc.getElementById('r-rebates').textContent).toBe('$0.00'); // capped to grossTax
        expect(doc.getElementById('r-taxPayable').textContent).toBe('$0.00');
    });

    it('reset clears inputs and returns to about page', () => {
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 30000);
        clickEl(doc, 'tab-reliefs');
        // Trigger reset via the header reset link
        clickEl(doc, 'resetLink');
        clickEl(doc, 'resetConfirmBtn');
        expect(doc.getElementById('page-about').classList.contains('active')).toBe(true);
        expect(doc.getElementById('dm-foot').checked).toBe(false);
        expect(doc.getElementById('dm-foot-annualIncome').value).toBe('');
    });

    it('guided child relief: 2 kids, one with disability, auto-computes QCR', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addChildBtn');
        clickEl(doc, 'addChildBtn');
        // Both children default to under16, 100% share → QCR = 4000 + 4000 = 8000.
        // Switch the second child's situation to "disabled".
        const rows = doc.querySelectorAll('.dependant-row[data-kind="child"]');
        expect(rows.length).toBe(2);
        const secondId = rows[1].dataset.id;
        const disabledRadio = doc.querySelector(`input[name="child-${secondId}-age"][value="disabled"]`);
        disabledRadio.checked = true;
        disabledRadio.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
        // QCR = 4000 + 7500 = 11500
        expect(doc.getElementById('rs-qcr-amt').textContent).toBe('$11,500');
    });

    it('guided child relief: adding a second child preserves the first child\'s settings', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addChildBtn');
        // Customize child 1: set situation to "disabled".
        const firstRow = doc.querySelector('.dependant-row[data-kind="child"]');
        const firstId = firstRow.dataset.id;
        const disabledRadio = doc.querySelector(`input[name="child-${firstId}-age"][value="disabled"]`);
        disabledRadio.checked = true;
        disabledRadio.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
        // After modification: QCR = $7,500.
        expect(doc.getElementById('rs-qcr-amt').textContent).toBe('$7,500');
        // Add a second child — first child's situation must be preserved.
        clickEl(doc, 'addChildBtn');
        // Total QCR = $7,500 (disabled) + $4,000 (default) = $11,500.
        expect(doc.getElementById('rs-qcr-amt').textContent).toBe('$11,500');
        const stillChecked = doc.querySelector(`input[name="child-${firstId}-age"][value="disabled"]`).checked;
        expect(stillChecked).toBe(true);
    });

    it('guided child relief: removing a child renumbers and recalculates', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addChildBtn');
        clickEl(doc, 'addChildBtn');
        // Remove the first child.
        const removeBtn = doc.querySelector('.dependant-row[data-kind="child"] .dependant-remove-btn');
        removeBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
        const remainingRows = doc.querySelectorAll('.dependant-row[data-kind="child"]');
        expect(remainingRows.length).toBe(1);
        // Title should renumber to "Child 1".
        expect(remainingRows[0].querySelector('.dependant-row-title').textContent).toBe('Child 1');
        // QCR should reflect single remaining child.
        expect(doc.getElementById('rs-qcr-amt').textContent).toBe('$4,000');
    });

    it('guided parent relief: 1 dependant living separately with disability', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addParentBtn');
        const row = doc.querySelector('.dependant-row[data-kind="parent"]');
        const id = row.dataset.id;
        // Set lives = no (separate)
        const livesNo = doc.querySelector(`input[name="parent-${id}-lives"][value="no"]`);
        livesNo.checked = true;
        livesNo.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
        // Set disability
        const dis = doc.querySelector(`input[name="parent-${id}-disability"]`);
        dis.checked = true;
        dis.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
        // Disability + separate = $10,000
        expect(doc.getElementById('rs-parent-amt').textContent).toBe('$10,000');
    });

    it('guided sibling relief: 2 siblings (each at 100%)', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addSiblingBtn');
        clickEl(doc, 'addSiblingBtn');
        // 2 × $5,500 = $11,000
        expect(doc.getElementById('rs-sibling-amt').textContent).toBe('$11,000');
    });

    it('guided parent relief: caps at 2 dependants', () => {
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addParentBtn');
        clickEl(doc, 'addParentBtn');
        clickEl(doc, 'addParentBtn'); // Third click should be a no-op
        const rows = doc.querySelectorAll('.dependant-row[data-kind="parent"]');
        expect(rows.length).toBe(2);
    });

    it('female with 2 SC children born from 2024 gets auto-computed WMCR', () => {
        setRadio(doc, 'aboutSex', 'female');
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addChildBtn');
        clickEl(doc, 'addChildBtn');
        // Both children default: SC=yes, born=before2024.
        // Switch both to bornFrom2024.
        const rows = doc.querySelectorAll('.dependant-row[data-kind="child"]');
        rows.forEach(row => {
            const id = row.dataset.id;
            const bornNew = doc.querySelector(`input[name="child-${id}-born"][value="from2024"]`);
            bornNew.checked = true;
            bornNew.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
        });
        // 1st child: $8,000; 2nd child: $10,000. Total WMCR = $18,000.
        expect(doc.getElementById('rs-wmcr-amt').textContent).toBe('$18,000');
        // QCR = $4,000 × 2 = $8,000.
        expect(doc.getElementById('rs-qcr-amt').textContent).toBe('$8,000');
    });

    it('male user does not get WMCR even with children added', () => {
        // Default sex is male
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        clickEl(doc, 'addChildBtn');
        expect(doc.getElementById('rs-wmcr-amt').textContent).toBe('$0');
        expect(doc.getElementById('rs-qcr-amt').textContent).toBe('$4,000');
    });

    it('EIR disability checkbox affects EIR amount', () => {
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 30000);
        clickEl(doc, 'tab-reliefs');
        clickEl(doc, 'reliefModeDetailedBtn');
        // Default: not disabled → EIR = $1,000 (under 55).
        expect(doc.getElementById('rs-eir-amt').textContent).toBe('$1,000');
        // Tick disability checkbox → EIR = $4,000.
        clickCheckbox(doc, 'eirDisability');
        expect(doc.getElementById('rs-eir-amt').textContent).toBe('$4,000');
    });

    it('GIRO splits tax over 2-12 months when above $40', () => {
        clickCheckbox(doc, 'dm-foot');
        setNumber(doc, 'dm-foot-annualIncome', 45000);
        // 45k < 50k cap so FEDR (20%) applies. Net = 36000.
        // Simple mode default: no reliefs → chargeable = 36000
        // Tax = 200 + (36000 - 30000) * 0.035 = 200 + 210 = 410
        clickEl(doc, 'tab-result');
        expect(doc.getElementById('r-grossTaxPayable').textContent).toBe('$410.00');
        const monthly = doc.getElementById('r-taxMonthly').textContent;
        expect(monthly).toMatch(/\/ month$/);
        const span = doc.getElementById('r-taxMonthlySpan').textContent;
        expect(span).toBe('12 months');
    });
});
