# HERMES_HANDOFF.md

Base implementation of **Prism** built on branch `hermes/base` per the minimal-working-base brief.
Two product surfaces: **Prism Core** (K-12, school — linear vs exponential growth) and
**Prism Future** (adult — investing + Future Snapshot).

## What works

- **Product chooser** home page with two buttons (Core / Future).
- **Prism Core** (`/api/core/growth`):
  - Adjustable start value, linear increment, exponential multiplier, years.
  - Side-by-side linear vs exponential comparison **table**.
  - Crossover-year detection (when exponential overtakes linear).
  - One **prediction question** scored against the computed result.
- **Prism Future** (`/api/future/invest`, `/api/future/content`):
  - Future-goal **onboarding**: pick 3–5 suggested keywords or add custom.
  - Manual inputs: starting balance, monthly contribution, years, assumed return, fee.
  - Deterministic **compound-growth** projection (balance, contributed, growth, fee drag).
  - Basic descriptions of **ETFs, individual stocks, and bonds**.
  - Balance-guess check against projection (1% tolerance).
  - **Future Snapshot card** placeholder (image generation intentionally NOT implemented).
- **Chrome MV3 extension**: minimal, side panel opens on toolbar click, two buttons
  open the local web app. Narrow permissions only (`sidePanel`, `storage`) — no
  content scripts, no history access, no monitoring.
- All deterministic math covered by unit tests (see below).

## Project structure

```
packages/shared/src/index.ts     # canonical types (ProductChoice, GrowthParams,
                                  #   InvestmentProfile, FutureSnapshot, AssetClassInfo, ...)
packages/verifiers/src/
  growth.ts                      # compareGrowth, verifyGrowthPrediction  (Prism Core)
  invest.ts                      # projectInvestment, verifyInvestmentGuess (Prism Future)
  finance.ts                     # compoundGrowth (legacy, kept)
  linear.ts, index.ts, base.test.ts
packages/learning-engine/        # hint ladder, mode rec, quiz (kept as foundation)
packages/curriculum/             # approved curriculum objects
packages/api-client/             # typed client
apps/web/src/server.ts           # zero-dep Node http server; routes below
apps/web/public/index.html       # minimal two-product demo UI
apps/extension/                  # MV3: manifest.json, background.js, sidepanel.html/.js, icons
```

### API routes (apps/web)
- `POST /api/core/growth` — body `{start, linearIncrement, exponentialMultiplier, years, guess?}` → `GrowthComparison`
- `POST /api/future/invest` — body `{startingBalance, monthlyContribution, years, assumedReturnPct, feePct, guess?}` → `{projection, check?}`
- `GET  /api/future/content` — `{assetClasses, suggestedKeywords}`
- (Legacy routes from prior vision also present: `/api/session/*`, `/api/life/simulate`, `/api/quiz/*`, `/api/plan/save`.)

## Commands to run

```bash
npm install
npm run build            # builds all packages + prism-web
npm test                 # runs vitest (25 tests)
npm run dev              # HOST=0.0.0.0 PORT=8787 node apps/web/dist/server.js
# open http://localhost:8787
```

### Load the extension
1. `npm install && npm run build` (one time).
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `apps/extension/`.
3. Click the Prism toolbar icon → side panel opens with Core / Future buttons.

## Known limitations

- Investment math uses **annual-compounded monthly** approximation, not a closed-form
  formula; fine for education, not a real brokerage calc.
- No persistence: sessions/plans live in memory only (process restarts clear them).
- The web UI is a single static page (no framework), intentionally minimal.
- Extension side panel only *links* to the web app; it does not embed the logic.
- Return/fee are single average assumptions (no volatility, inflation, or tax modeling).
- Prism Future "Future Snapshot" is a **static placeholder** — no image generation.

## Unfinished requirements / next steps for later engineers

- Wire the extension side panel to call the backend directly (currently just links out).
- Turn Prism Future keywords into a saved profile / roadmap.
- Add the Visual Lab / Quiz / answer-gating flows from the broader spec on top of this base.
- Real compound-interest closed-form vs the monthly-iteration approximation (reconcile).
- Persist plans (the `/api/plan/save` route exists but stores in memory).
- Image generation for the Future Snapshot card (explicitly out of scope for this base).
- Auth, database, and real bank connections are intentionally **out of scope**.

## Tests run

`npm test` → **25 passed** (3 files):
- `packages/verifiers/src/verifiers.test.ts` — 9 (linear + compound finance)
- `packages/verifiers/src/base.test.ts` — 8 (Prism Core growth + Prism Future invest + asset content)
- `packages/learning-engine/src/engine.test.ts` — 8 (hints, mode rec, session, quiz)

All deterministic calculations (growth comparison, investment projection, fee drag,
prediction scoring) are covered.

## Commit hash

See `git log -1` on branch `hermes/base` (this file committed in the same change).
Push target: `origin/hermes/base` — **not** `main` or `develop`.
