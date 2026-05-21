# Platform Worker Tax Estimator

> Singapore income-tax estimator for platform workers (delivery riders, PHC drivers, and other self-employed gig workers).

A static, single-page calculator. Vanilla JS ES modules bundled with esbuild — no runtime dependencies, no framework. Deployed via [Airbase](https://airbase.sg) on `gdssingapore/airbase:nginx-1.28` under a `script-src 'self'` Content Security Policy.

**Status:** Beta · YA2024+ tax rates · Singapore residents only.

## Quick start

Prerequisites: Node.js 18+ and Python 3 (used by the dev server).

```sh
npm install        # one-off, installs dev tooling (esbuild, vitest, jsdom)
npm run dev        # builds bundle.js, then serves http://localhost:8000
npm test           # 101 tests (unit + integration)
```

`npm run dev` runs `npm run build` first, so `bundle.js` is always fresh. For active development — editing source files and wanting a live rebuild — run these in two terminals:

```sh
npx esbuild src/app.js --bundle --target=es2017 --format=iife --outfile=bundle.js --watch
python3 -m http.server 8000
```

If `npm install` fails on `~/.npm` permissions, use `--cache /tmp/npm-cache-pw`.

## Project structure

```
.
├── src/
│   ├── app.js              # Entry point. DOM wiring only.
│   ├── tax.js              # Pure tax math. NO DOM ACCESS.
│   ├── constants.js        # Tax-policy values — single source of truth.
│   └── dom.js              # DOM helpers and currency formatters.
│
├── index.html              # Markup. Loads bundle.js. No inline JS.
├── styles.css              # All styles. No inline <style>.
├── bundle.js               # Built from src/ by esbuild. Committed. Shipped.
├── logo.png                # IRAS logo.
├── fonts/                  # Self-hosted IBM Plex (latin woff2). Committed. Shipped.
│
├── Dockerfile              # nginx + static files for Airbase.
├── airbase.json            # Airbase project config.
├── .airbase/               # Airbase CLI link state (do not edit by hand).
├── .dockerignore           # Excludes dev files from the build context.
│
├── tests/
│   ├── tax.test.js         # Unit tests for pure functions in src/tax.js.
│   └── integration.test.js # End-to-end tests via JSDOM against src/app.js.
├── package.json            # Dev tooling. Not shipped to production.
└── README.md
```

`bundle.js`, `styles.css`, and the IBM Plex fonts are all loaded same-origin. No inline scripts, no CDN, fully CSP-compatible.

## Deployment (Airbase)

```sh
airbase deploy
```

The image contains the static runtime assets: `index.html`, `styles.css`, `bundle.js`, `logo.png`, and the self-hosted IBM Plex fonts under `fonts/`. The four source JS modules are bundled into `bundle.js` at build time and are not shipped separately. Fonts are self-hosted (no Google Fonts CDN) so they load under a strict CSP with no external requests; static per-weight `woff2` files (no variable font) keep weight rendering deterministic across browsers. Where an environment blocks web-font downloads entirely, the UI degrades gracefully to the system font stack. Dev files are excluded by [`.dockerignore`](.dockerignore).

**Before deploying**, run `npm run build` to regenerate `bundle.js` from the latest source, then commit it.

Target browsers: ES2017+ (Chrome, Edge, Safari, Firefox — including corporate Edge where `type="module"` scripts may be policy-blocked). No IE11.

## Architecture

### Build step

`npm run build` uses esbuild to bundle the four source modules into a single `bundle.js` (IIFE, ES2017 target). This eliminates the `<script type="module">` dependency, which is blocked by some corporate Edge group policies. `bundle.js` is committed to the repo and copied directly into the nginx image by the [`Dockerfile`](Dockerfile).

To add a module: drop a new `.js` file in `src/`, `import` it from `src/app.js`, and `npm run build` will pick it up automatically — no Dockerfile change needed.

### Module boundaries

This is the contract. **Preserve it when editing.**

| Module | Responsibility | May import | Must NOT |
|---|---|---|---|
| [`src/constants.js`](src/constants.js) | Tax-policy values | nothing | reference DOM or browser APIs |
| [`src/tax.js`](src/tax.js) | Pure tax math | `constants.js` | **touch the DOM, `document`, `window`** |
| [`src/dom.js`](src/dom.js) | DOM helpers, formatters | nothing | contain tax math |
| [`src/app.js`](src/app.js) | Event wiring, state, rendering | all of the above | duplicate logic from `tax.js` |

`src/tax.js` stays unit-testable without a browser because it never touches a DOM. **Never import `dom.js` from `tax.js`.**

### CSP constraints (Airbase)

Airbase enforces `Content-Security-Policy: script-src 'self'`. Non-negotiable:

| Allowed | Forbidden |
|---|---|
| `<script src="...">` from same origin | Inline `<script>...</script>` blocks |
| `<script type="module">` + relative imports | Inline event handlers (`onclick="..."` etc.) |
| External stylesheets (governed by `style-src`) | `eval`, `new Function`, `setTimeout('string')` |
| | CDN-hosted JavaScript |

If you need to share imports across modules, use relative paths (`./tax.js`), not import maps (which require inline JSON and are resolved at runtime, not bundle time).

## Editing guide

For both humans taking over the project and AI assistants editing without context.

### Common tasks

**Add a new income source:**
1. Add HTML inputs in `index.html` under the appropriate `<div class="income-card">`.
2. Add the calculation to `calcIncome()` in `src/app.js`.
3. Add result-page rendering in `updateResults()` (the `r-...` row IDs).
4. Update `tests/integration.test.js` with a flow that exercises it.

**Add a new relief:**
1. Add the cap/amount to `src/constants.js`.
2. Add a pure helper to `src/tax.js` (e.g. `calcMyRelief(...)`).
3. Add unit tests in `tests/tax.test.js`.
4. Add HTML in `index.html` under `<div id="reliefDetailedSection">`.
5. Wire the input listener and update `calcReliefs()` in `src/app.js`.
6. Add the row to the result-page breakdown in `updateResults()`.

### Things not to do

- **Do not add inline scripts to `index.html`.** Airbase CSP blocks them.
- **Do not import from a CDN.** Same reason.
- **Do not put DOM access in `tax.js`.** Breaks unit-testability.
- **Do not hardcode tax-policy values in `app.js` or `tax.js`.** Add them to `constants.js`.
- **Do not use `eval` or `new Function`.** CSP blocks; also a security smell.
- **Do not change the build tool** (esbuild) without verifying Airbase compatibility and updating the `Dockerfile`. Always commit the regenerated `bundle.js`.
- **Do not refactor to React/Vue/Svelte.** A single-form calculator does not justify a framework or its build pipeline.
- **Do not mock the DOM in `tax.js` tests.** Keep tax math pure — use `tests/integration.test.js` for DOM-dependent flows.
- **Do not delete tests when they fail.** The IEEE-754 quirk tests (`toBeCloseTo` instead of `toBe`) document a real arithmetic edge case.

## Updating tax policy

All policy values live in [`src/constants.js`](src/constants.js). Each YA, verify against the IRAS source and update in one place.

| Constant | Description |
|---|---|
| `TAX_BRACKETS` | Resident individual income tax brackets |
| `RELIEF_CAP` | Combined personal-relief cap |
| `FEDR_INCOME_CAP` | Delivery FEDR maximum income |
| `DELIVERY_MODES[].rate` | FEDR deemed-expense % per mode (foot/PMD/van) |
| `PHC_FEDR_RATE` | PHC fixed-expense ratio |
| `EIR_CAPS` | Earned Income Relief by age × disability |
| `CPF_CAP`, `LIFE_INS_CAP`, `LIFE_INS_BUFFER` | CPF + life insurance interaction |
| `TOPUP_CAP_SELF`, `TOPUP_CAP_FAMILY` | CPF Cash Top-up |
| `SRS_CAP_LOCAL`, `SRS_CAP_FOREIGN` | SRS contribution caps |
| `SPOUSE_RELIEF_*`, `GCR_AMOUNT` | Family reliefs |
| `NSMAN_SELF`, `NSMAN_PARENT_OR_WIFE` | NSman amounts |
| `DONATION_MULTIPLIER` | Approved IPC donation factor |
| `GIRO_MIN_MONTHLY`, `GIRO_MAX_MONTHS` | GIRO instalment plan |

Authoritative source: [iras.gov.sg](https://www.iras.gov.sg/).

After editing, **always run `npm test`** — bracket-boundary tests catch arithmetic regressions on the spot.

## Testing

```sh
npm test           # one-shot
npm run test:watch # re-runs on save
```

- [`tests/tax.test.js`](tests/tax.test.js) — 79 unit tests covering every bracket boundary, NSman precedence rules, FEDR eligibility, CPF/life-insurance interaction, GIRO instalment edges, SRS/spouse/GCR caps, QCR/WMCR/parent/sibling reliefs.
- [`tests/integration.test.js`](tests/integration.test.js) — 22 end-to-end tests using JSDOM. Walks through real user flows (FEDR auto-block and auto-restore, mode switching, NSman warnings, reset, GIRO display, guided dependant flows, WMCR auto-calculation, etc.).

When you change tax math or any flow, add or update tests.

## Privacy and disclaimer

**Privacy.** Static client-side calculator. All inputs and computations stay in the user's browser. No income, identifying, or relief data is transmitted to any server. No analytics, no third-party tracking, no telemetry.

**Disclaimer.** Non-binding tax estimates only. Official income-tax assessment is determined by IRAS based on the taxpayer's filed return. For authoritative information, refer to [iras.gov.sg](https://www.iras.gov.sg/).
