# CODEX_HANDOFF.md

Handoff for the **`codex/improvement`** branch, which branches from `develop` and
currently tracks `hermes/base` after the base merge. This file documents the state
of the codebase as reviewed and the gaps found/fixed during the Hermes review pass.

## Context

The minimal working base (`hermes/base`) implements two product surfaces:
- **Prism Core** (K-12): linear-vs-exponential growth lesson.
- **Prism Future** (adult): investing projection + Future Snapshot placeholder.

A Chrome MV3 extension opens a side panel with two buttons linking to the local web app.

## Review findings (see HERMES_REVIEW.md for the full list)

Issues found and fixed on `hermes/base` (then merged into `codex/improvement`):
- Silent `NaN`/`0` when numeric inputs were empty → added server-side validation
  (`parseFiniteAll`) returning HTTP 400, plus client-side error states.
- No loading / empty / error states in the UI → added loading + error banners.
- Spec §545 requires a **graph** and prediction-before-reveal → added an inline SVG
  line chart and made "Check prediction" reveal the comparison after the learner commits.
- No responsive/narrow-side-panel CSS → added `overflow-x:auto` graph wrapper +
  `@media (max-width:520px)` rules.
- Stale dev server served an old build → fixed by clean rebuild; noted that the root
  `npm run build` does **not** build `prism-web`, so `npm run build -w prism-web`
  (or `npm run dev`) is required after editing `apps/web`.

## Known limitations (carried from base)

- Investment math is a monthly-iteration approximation (educational, not a brokerage calc).
- No persistence (in-memory only).
- Extension side panel only *links* to the web app.
- Future Snapshot is a static placeholder (no image generation — out of scope).
- Leftover legacy routes from the prior vision remain in `apps/web`
  (`/api/session/*`, `/api/life/simulate`, `/api/quiz/*`). Decide whether to keep or remove.

## Suggested next improvements for this branch

1. Remove or clearly separate the legacy routes so the base is purely two-product.
2. Persist Future Snapshot / plans (the `/api/plan/save` route exists but is in-memory).
3. Add a unit test that exercises the HTTP 400 path through the server (currently only
   the `parseFinite` helper is unit-tested; the handler wiring is verified via curl).
4. Consider a real closed-form compound-interest formula and reconcile with the approximation.
5. Wire the extension side panel to call the backend directly instead of opening a tab.

## Tests

`npm test` → **28 passed** (4 files):
- `packages/shared/src/num.test.ts` — 3 (input sanitization)
- `packages/verifiers/src/verifiers.test.ts` — 9
- `packages/verifiers/src/base.test.ts` — 8
- `packages/learning-engine/src/engine.test.ts` — 8

## Commands

```bash
npm install
npm run build            # builds packages (NOT prism-web)
npm run build -w prism-web   # required after editing apps/web
npm test
npm run dev              # HOST=0.0.0.0 PORT=8787 node apps/web/dist/server.js
```

Branch discipline: do not push to `main` or `develop` from feature work; PR into `develop`.
