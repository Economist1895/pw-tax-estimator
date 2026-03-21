# Platform Worker Tax Estimator (Beta)

A lightweight, client-side tax estimator for Singapore platform workers (delivery riders and PHC/taxi drivers), built as a static web app deployable on Airbase.

> **Disclaimer:** This tool provides estimates only. Actual tax payable may differ. Always verify your eligibility before claiming reliefs and refer to IRAS for official guidance.

---

## Features

**Income**
- Delivery income with Fixed Expense Deduction Ratio (FEDR) support — by delivery mode (foot/PT, PMD/PAB/motorcycle, van), with automatic FEDR disqualification above $50,000
- PHC / Taxi income with 60% FEDR or actual expenses
- Daily rate estimator (daily income × days per week × 52) as an alternative to annual entry
- Additional taxable income (employment, rental, etc.)

**Reliefs**
- Simple mode: enter your total personal reliefs directly
- Detailed mode: itemised breakdown across 12 relief types
  - Earned Income Relief (age/disability-based)
  - Spouse Relief (standard and disability)
  - Qualifying/Handicapped Child Relief (QCR/HCR)
  - Working Mother's Child Relief (WMCR)
  - Parent Relief / Parent Relief (Disability)
  - Grandparent Caregiver Relief (GCR)
  - Sibling Relief (Disability)
  - CPF / Provident Fund Relief
  - Life Insurance Relief
  - CPF Cash Top-up Relief
  - SRS Relief
  - NSman Relief (Self / Wife / Parent) with mutual-exclusion logic
- Approved donations (250% tax deduction)
- $80,000 personal relief cap with live progress bar

**Results**
- Full tax computation: assessable income → chargeable income → tax payable
- YA2024 tax brackets reference table
- Monthly GIRO breakdown

---

## Tech

Pure HTML, CSS, and vanilla JS — no frameworks, no build step, no dependencies except the IBM Plex Sans font loaded from Google Fonts.

```
index.html   — structure and styles
app.js       — all interactivity and tax logic
logo.png     — header logo
Dockerfile   — Airbase deployment config
```

The JS is structured as a single `DOMContentLoaded` block with no inline event handlers, in compliance with Airbase's Content Security Policy (`script-src 'self'`).

---

## Tax Rules Reference

Calculations follow IRAS rules for **Year of Assessment (YA) 2024 onwards**:

- FEDR rates: 20% (foot/PT/bicycle), 35% (PMD/PAB/motorcycle), 60% (van/PHC)
- FEDR not available if delivery income exceeds $50,000
- Personal relief cap: $80,000 per year
- Donation deduction: 250% of qualifying cash donations to IPCs
- CPF relief cap: $37,740
- NSman Self/Wife reliefs are mutually exclusive; Self+Parent uses the higher amount only

---

## Status

Beta — calculations have been manually verified against IRAS guidelines but have not been officially endorsed.

## Live Demo

The calculator is accessible at: https://economist1895.github.io/pw-tax-estimator/
