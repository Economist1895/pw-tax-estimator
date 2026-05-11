// DOM helpers and currency formatters.

export function fmt(n, decimals = 2) {
    const safe = Math.max(0, n);
    if (decimals === 0) return '$' + Math.round(safe).toLocaleString('en-SG');
    return '$' + safe.toLocaleString('en-SG', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

export const fmtShort = (n) => fmt(n, 0);

export const $ = (id) => document.getElementById(id);

export function val(id) {
    const el = $(id);
    if (!el) return 0;
    const v = parseFloat(el.value);
    return (isNaN(v) || v < 0) ? 0 : v;
}

export function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

export function showHide(el, show) {
    if (el) el.style.display = show ? '' : 'none';
}

export function toggleClass(el, cls, force) {
    if (el) el.classList.toggle(cls, force);
}

export function getRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
}
