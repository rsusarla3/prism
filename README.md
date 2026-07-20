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

### Run the web app (demo UI on localhost)

```bash
npm run build -w prism-web
npm run dev              # binds 0.0.0.0 and prints your LAN URL
# open http://localhost:8787
```

`npm run dev` exposes the server on your network too. For **car / LAN use with
the team**, share the `on your network` URL it prints — see
[`docs/prism/LAN_SETUP.md`](docs/prism/LAN_SETUP.md). Teammates run the
extension locally and point its **Backend host** field at the host laptop's
hotspot IP; the browser UI just needs the host URL.

The demo page exercises both P0 flows:
- **School** — paste an equation, pick a goal, submit attempts. The final
  answer + solution steps are **gated server-side** and only returned after a
  meaningful attempt (try the API directly to confirm).
- **Life** — compound-growth simulator with a fee-drag readout.

### Load the Chrome extension

1. Build the web app and start it (`http://localhost:8787`).
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `apps/extension/`.
4. Highlight text on any page → right-click **Learn with Prism** (or click the
   toolbar icon). The side panel opens with the shared content.

## Key design decisions

- **Server-side answer gating** (AGENTS.md rule 4). The answer is never sent to
  the client until the session records a meaningful attempt. See
  `apps/web/src/server.ts` `handleReveal`.
- **Deterministic verifiers.** Math/finance checks are pure functions with tests
  (`packages/verifiers`); the LLM never performs arithmetic.
- **Narrowest Chrome permissions.** The extension only acts on explicit user
  selection; it never reads history or background-monitors pages.
- **Provider-neutral finance.** A disabled `FinancialDataProvider` interface is
  reserved for a future bank connection; V1 finance uses manual inputs only.

## Status

P0 scaffold complete: shared types, verifiers (tested), curriculum, learning
engine (tested), web server with enforced gating, and an MV3 extension skeleton.
P1/P2 items (uploads, accounts, streaming, audio) are not yet built.
