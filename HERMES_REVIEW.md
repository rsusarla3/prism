# HERMES_REVIEW.md

Review of the Prism implementation after merging `origin/codex/improvement` into
`hermes/base`. The branch was already in sync (no divergent commits), so this reviews
the merged base state. Goal: find and fix concrete gaps without rewriting the app.

## Issues found

1. **Stale dev server served an old build.** A previously-started `npm run dev`
   process served an `index.html` titled "Learn until it clicks" that no longer exists
   in the repo — a stale `apps/web/dist`. Symptom: UI did not match source.
   *Root cause:* the root `npm run build` script did **not** build `prism-web`, so edits
   to `apps/web` were never compiled by `npm run build`.

2. **Silent `NaN` / zero on empty numeric inputs (calculation inconsistency).**
   Empty fields parsed with `Number('')` → `0`, and `exponentialMultiplier=''` → `NaN`;
   the UI showed wrong numbers (e.g. "Balance: $0", exponential column NaN) with no error.

3. **No loading / empty / error states.** Every async action failed silently or returned
   bad data with no user feedback.

4. **No graph (acceptance gap).** Spec §545 calls for a graph that updates with controls;
   the base shipped only a table.

5. **Prediction shown after the comparison was revealed (acceptance gap).** Spec §545 says
   Prism should ask a prediction *before* revealing comparisons. The base scored the
   prediction but never gated the comparison behind it.

6. **No responsive / narrow-side-panel layout.** The comparison table and form rows could
   overflow a ~300px Chrome side panel.

7. **Missing documentation.** `CODEX_HANDOFF.md` was referenced by the task but did not exist.

8. **Tests did not cover important behavior.** Input sanitization / invalid-input handling
   had no unit coverage; the HTTP 400 validation path was untested.

9. **Root build script omits `prism-web`.** Made the staleness in #1 repeatable.

## Issues fixed

- Added `packages/shared/src/num.ts` with `parseFinite` / `parseFiniteAll` (deterministic,
  tested) and exported them from `prism-shared`.
- Server handlers `handleCoreGrowth` / `handleFutureInvest` now validate inputs via
  `parseFiniteAll` and return **HTTP 400** with a message on empty/NaN/negative input.
- Client (`apps/web/public/index.html`): added number reading that returns `null` on empty,
  inline **error banners** (`⚠ …`) and **"Calculating…" loading** states for both products,
  and a **no-dependency inline SVG line chart** for the growth comparison.
- **Prediction-first:** "Check prediction" now reveals the graph + table after the learner
  commits, satisfying spec §545.
- Added **responsive CSS**: `overflow-x:auto` graph wrapper and `@media (max-width:520px)`
  rules so the side panel / mobile render cleanly.
- Added `packages/shared/src/num.test.ts` (3 tests) covering valid/invalid/empty/Infinity.
- Created **`CODEX_HANDOFF.md`** documenting the branch state and next steps.
- Fixed the root `build` script to include `prism-web` so `npm run build` (and therefore
  `npm test`, which runs `npm run build`) compiles the web app — prevents recurrence of #1.

## Issues left open

- The legacy routes from the prior vision (`/api/session/*`, `/api/life/simulate`,
  `/api/quiz/*`, `/api/plan/save`) still exist in `apps/web`. They are harmless but out of
  scope for the two-product base. Decision deferred to the team (keep as foundation or strip).
- Investment projection uses a monthly-iteration approximation, not a closed-form formula
  (documented limitation; reconciliation left as a later task).
- Extension side panel still only *links* to the web app (no direct backend calls).
- Future Snapshot remains a static placeholder (image generation out of scope).
- No HTTP-level test through the server (the `parseFinite` helper is unit-tested; handler
  wiring verified via curl + browser). A supertest-style test would close this.

## Commands run

```bash
npm run build                 # now includes prism-web
npm test                      # 28 passed (4 files)
# manual verification:
curl -X POST localhost:8787/api/core/growth   -d '{"start":100,"linearIncrement":50,"exponentialMultiplier":"","years":10}'   # -> 400
curl -X POST localhost:8787/api/future/invest -d '{"startingBalance":"","monthlyContribution":200,...}'                       # -> 400
# browser walkthrough of Prism Core + Prism Future (graph, prediction, error states)
```

Full demo flow run (Prism Core then Prism Future): both product surfaces load, comparison
graph + table render, prediction scores, empty inputs show an error and no graph, and the
Future projection + Snapshot placeholder display correctly.

## Final test results

`npm test` → **28 passed** (4 files):
- `packages/shared/src/num.test.ts` — 3 (input sanitization)
- `packages/verifiers/src/verifiers.test.ts` — 9 (linear + compound finance)
- `packages/verifiers/src/base.test.ts` — 8 (Core growth + Future invest + asset content)
- `packages/learning-engine/src/engine.test.ts` — 8 (hints, mode rec, session, quiz)

No type errors (`tsc` clean across all workspaces). Web app built and served; demo flow
verified end-to-end in a browser.

## Commits / push

Branch: `hermes/base` (also reflected on `codex/improvement` via the earlier merge).
Pushed to `origin/hermes/base` only. **Not** pushed to `main` or `develop`.
