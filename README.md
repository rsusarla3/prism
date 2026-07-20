# Prism

**One concept. As many ways as it takes to make it click.**

Prism is an adaptive Chrome learning copilot that understands the material a
learner selects, asks what they are trying to accomplish, teaches the concept
through interactive methods that change when the learner gets stuck, and only
reveals a homework answer *after* the learner makes a meaningful attempt.

Spec: [`docs/prism/PRISM_HACKATHON_BUILD_SPEC.md`](docs/prism/PRISM_HACKATHON_BUILD_SPEC.md)
Agent rules: [`docs/prism/AGENTS.md`](docs/prism/AGENTS.md)

## Monorepo layout

```
packages/shared        Canonical TypeScript domain types & API contracts (authoritative)
packages/verifiers     Deterministic math + compound-interest logic (+ tests)
packages/curriculum    Approved curriculum objects (linear eq, compound interest, ETF)
packages/learning-engine  Session state machine, hint ladder, mode recommendation (+ tests)
packages/api-client    Typed HTTP client
apps/web               Zero-dep Node server + demo UI (server-side answer gating)
apps/extension         MV3 Chrome extension (side panel + context menu + content script)
```

## Prerequisites

- Node.js 22+ (uses built-in `fetch`, `crypto.randomUUID`, ESM)
- npm 10+

## Develop

```bash
npm install
npm run build      # compile all packages
npm test           # run verifier + learning-engine test suites (vitest)
```

## What's inside

A minimal working base with **two product surfaces**:

- **Prism Core** (K-12, school) — a linear-vs-exponential growth lesson with adjustable
  start, linear increment, and exponential multiplier; a comparison table; and one
  prediction question.
- **Prism Future** (adult) — future-goal onboarding (pick 3–5 keywords), manual investing
  inputs, a deterministic compound-growth projection, basic ETF/stock/bond descriptions,
  and a placeholder Future Snapshot card (image generation not implemented).

A basic **Chrome MV3 extension** opens a side panel with buttons to launch each surface.

## Run

```bash
npm install
npm run build
npm test                 # 25 deterministic tests
npm run dev              # server on http://localhost:8787 (binds 0.0.0.0)
```

Open http://localhost:8787. For the extension: `chrome://extensions` → Load unpacked →
`apps/extension/`.

## Branch discipline

- `main`, `develop` — protected integration branches. Do **not** push here from feature work.
- `hermes/base` — this minimal base. Feature branches (e.g. `codex/improvement`) branch off `develop`.
- See `HERMES_HANDOFF.md` for the full base status, structure, and tests.

### Load the Chrome extension

1. One-time: `npm install && npm run build`.
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `apps/extension/`.
4. Click the Prism toolbar icon → the side panel opens with **Prism Core** and
   **Prism Future** buttons that open the local web app at `http://localhost:8787`.

## Key design decisions

- **Deterministic math.** Growth comparison and investment projection are pure,
  tested functions in `packages/verifiers` (`growth.ts`, `invest.ts`).
- **Narrowest Chrome permissions.** The MV3 extension uses only `sidePanel` and
  `storage` — no content scripts, no history access, no page monitoring.
- **No backend needed for the base.** The web app is a zero-dependency Node server;
  state is in-memory (no database, no auth) per the minimal-base brief.
- **Provider-neutral finance.** A `FinancialDataProvider` interface is reserved for a
  future bank connection; V1 finance uses manual inputs only.

## Status

Minimal base complete on `hermes/base`: two product surfaces (Core + Future), shared
types, deterministic verifiers (tested), web server, and MV3 extension skeleton.
Image generation (Future Snapshot), persistence, auth, and accounts are intentionally
out of scope for this base.
