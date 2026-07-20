# CODEX_BRIEF.md

Instructions for the Codex agent working on **Prism** improvements.

## Branch & discipline
- Work on branch **`codex/improvement`** (off `develop`). It currently tracks `hermes/base`.
- **Do NOT push to `main` or `develop`** from feature work. Commit to `codex/improvement`
  and push `origin/codex/improvement`. PR/merge into `develop` only.
- Before starting, run `git fetch origin && git checkout codex/improvement && git merge origin/develop`
  to pick up any integration changes.

## What the base is (commit `fc58679` on `hermes/base`)
A TypeScript, **zero external runtime deps** web app + minimal MV3 Chrome extension.
Two product surfaces:
- **Prism Core** (K-12, school): linear-vs-exponential growth lesson.
  - API: `POST /api/core/growth` `{start, linearIncrement, exponentialMultiplier, years, guess?}` → comparison table + prediction.
  - UI: `apps/web/public/index.html` (growth card with SVG graph, table, prediction).
- **Prism Future** (adult): investing projection + Future Snapshot placeholder.
  - API: `POST /api/future/invest` `{startingBalance, monthlyContribution, years, assumedReturnPct, feePct, guess?}` → projection; `GET /api/future/content` → asset classes + suggested keywords.
  - UI: `apps/web/public/index.html` (onboarding keywords, inputs, projection, snapshot placeholder).

Server: `apps/web/src/server.ts` (hand-rolled `http`, binds `0.0.0.0`, `PORT` env).
Shared types: `packages/shared`. Deterministic math/finance: `packages/verifiers`.
Remaining foundation packages (with passing tests): `packages/learning-engine`,
`packages/curriculum`, `packages/api-client`.

**Read first:** `PRISM_HACKATHON_BUILD_SPEC.md`, `AGENTS.md`, `HERMES_HANDOFF.md`,
`HERMES_REVIEW.md`, `CODEX_HANDOFF.md`.

## Constraints (non-negotiable, from AGENTS.md)
- No auth, no DB, no real bank connections (unless explicitly asked).
- Request the **narrowest Chrome permissions**; never silently monitor pages/history.
- Deterministic math + finance verification only.
- Shared types / API contracts are authoritative.
- Keep it minimal — clarity over polish.

## How to work
1. Name the spec requirement you're addressing.
2. Inspect relevant shared types in `packages/shared`.
3. Implement with tests. Run `npm install` then `npm test` (builds all packages incl. `prism-web`, then `vitest run`).
4. Run the app: `npm run dev` → http://localhost:8787 — verify your flow end-to-end.
5. After editing, list changed files, commands/tests run, limitations, and any spec deviation.

## Suggested improvements (pick ONE per task)
1. **Investment math accuracy** — replace the monthly-iteration approximation in
   `packages/verifiers/src/invest.ts` with a closed-form compound-interest formula
   (lump sum FV + monthly annuity FV), net of fees. Add a test proving it matches
   the textbook FV formula.
2. **Future Snapshot real content** — replace the static placeholder card in the UI
   with a generated text/HTML summary (no image generation yet).
3. **Persistence** — plans/snapshots are in-memory only; add a JSON-file or SQLite
   store behind `packages/shared` types (no external DB required for V1).
4. **Extension depth** — make the side panel (`apps/extension/sidepanel.js`) call the
   backend directly (`/api/core/growth`, `/api/future/invest`) instead of opening a tab;
   add a configurable backend-host field persisted in `chrome.storage.local`.
5. **Prism Core depth** — add a second prediction ("when does exponential overtake
   linear?") and a "change one variable" quiz (spec step 9), with tests in `base.test.ts`.
6. **Server-level tests** — the `parseFinite` helper (`packages/shared/src/num.ts`) is
   unit-tested, but handler wiring is only curl-verified. Add HTTP-level tests.
7. **Accessibility / mobile polish** — ARIA labels on the SVG graph, keyboard nav,
   side-panel width tuning.

## Commit message format
```
<area>: <what changed>

<why> — refs CODEX_BRIEF.md item N.
Tests: npm test → NN passed.
```
