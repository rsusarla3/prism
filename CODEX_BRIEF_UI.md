# CODEX_BRIEF_UI.md — Full UI Revamp to Modern Standards

Read this file end-to-end before writing any code. It is the single source of truth
for the Prism web-app UI revamp.

## Branch & discipline
- Work on **`codex/improvement`** (currently merged from `hermes/base` at `715e0c6`).
- **Do NOT push to `main` or `develop`.** Commit here, push `origin/codex/improvement`.
- First run: `git fetch origin && git merge origin/hermes/base` to pick up integration.

## Goal
The current frontend (`apps/web/public/`) is a **dependency-free vanilla-JS SPA**
(`index.html` shell + `app.js` inline-template rendering + `app.css` design tokens).
It works and already has a stepper, dual sliders, SVG charts, toasts, and
reduced-motion support — but it reads as generic/template-y. **Completely revamp it
to genuine modern-product quality** using a real component framework.

This brief **authorizes introducing a build toolchain** (dev/build deps only).
The backend server stays dependency-free at runtime.

## Stack decision (Option B — framework)
Use **Vite + React + TypeScript**:
- `react`, `react-dom` (runtime deps for the UI bundle — acceptable; the *server*
  remains zero external runtime deps).
- `vite`, `@vitejs/plugin-react`, `typescript` as devDependencies.
- No CSS framework required — write a hand-crafted design system with CSS Modules
  or plain CSS + CSS variables. (Tailwind is allowed only if you justify it; prefer
  a small custom system to keep the bundle lean and the look distinctive.)
- Do **not** add a UI component library (MUI, Chakra, shadcn) unless you have a
  strong reason — a custom system better matches "crafted, distinctive" brief.

## Architecture (important — don't break the server)
- Put the new frontend source in **`apps/web/ui/`** (new dir): `index.html`,
  `src/main.tsx`, `src/App.tsx`, components, styles.
- Vite builds to **`apps/web/public/`** (set `build.outDir: '../public'` relative to
  `apps/web/ui/`, and `build.emptyOutDir: true`). This **overwrites** the old
  `index.html` / `app.js` / `app.css` — that is intended.
- The existing server (`apps/web/src/server.ts`) already serves `apps/web/public/`
  statically and exposes the APIs. **No server change is required for static
  serving.** Keep the server as-is unless you find a genuine need.
- Add npm scripts (in `apps/web/package.json`):
  - `"dev:ui": "vite"` (serves the UI on Vite's dev port with HMR)
  - `"build:ui": "vite build"`
  - Wire `build:ui` into the **root** `package.json` `build` script so
    `npm run build` also builds the UI.
- API calls hit the same endpoints the old app used (relative URLs, same origin):
  - `POST /api/core/growth` `{start, linearIncrement, exponentialMultiplier, years, guess?}` → `{points, crossoverYear, prediction}`
  - `POST /api/future/invest` `{startingBalance, monthlyContribution, years, assumedReturnPct, feePct, inflationPct?}` → `{projection, comparisons, check?}`
  - `GET  /api/future/content` → `{assetClasses, suggestedKeywords, futureGoals}`
  - `GET  /api/health` → `{ok:true}`
  **Do not change these contracts or add routes.**

## Revamp scope
1. **Visual system** — refined typographic scale & spacing rhythm, elevated color &
   contrast (WCAG-AA), layered shadows, tasteful depth. Add a **light + dark theme**
   (respect `prefers-color-scheme` and offer a manual toggle persisted in
   `localStorage`).
2. **Motion & feel** — purposeful micro-interactions (entrances, slider feedback,
   chart transitions), step/page transitions, **skeleton loaders** during fetches.
   Always honor `prefers-reduced-motion`.
3. **Prism Core (growth lesson)** — make the linear-vs-exponential chart the hero:
   animated path draw, hover/focus tooltips, and an accessible data-table
   alternative. Keep the 4-step flow (predict → explore → explain → transfer) but
   make the scaffolding clearer and more polished.
4. **Prism Future (investing)** — elevate goal selection (visual cards/chips, 3–5
   enforced), the projection chart (balance vs contributions + scenario overlays for
   `comparisons.startLater` / `comparisons.higherFee`), and replace the static
   Snapshot placeholder with a polished, intentional card. **Keep image generation
   out of scope** (no API calls to image models); the card should look deliberate.
5. **Responsiveness** — flawless from **320px → desktop**, and specifically usable
   inside a **~320px Chrome side panel** (the extension opens this page). Test that width.
6. **Accessibility (WCAG-AA)** — focus management between steps, ARIA for charts and
   controls, full keyboard operability, visible focus rings, sufficient contrast.
7. **Polish** — empty / error / loading states for **every** async action; friendly,
   plain-language copy; no dead ends.

## Animation standards (explicit)
Animations must feel *intentional and premium*, not decorative noise:
- **Chart hero (Core):** animate the linear/exponential paths drawing in (stroke-dasharray
  draw-on), points easing into place, and smooth tweening when sliders change values
  (interpolate between old and new series rather than snapping).
- **Future projection chart:** animate the area/line growth; crossfade scenario overlays
  (`startLater`, `higherFee`) when toggled.
- **Step transitions:** directional slide/fade between the 4 Core steps and the Future
  stages; respect `prefers-reduced-motion` (instant, no transform/opacity animation).
- **Micro-interactions:** button/card press feedback, slider thumb ripple, number
  count-ups for balances, toast entrance, skeleton shimmer while fetching.
- **Performance:** prefer CSS transforms/opacity and `will-change`; cap concurrent
  animations; target 60fps on a mid-range phone. No layout thrash.
- **Accessibility:** every animation is non-essential and disabled under
  `prefers-reduced-motion: reduce`. Never animate anything that conveys *solely*
  through motion (pair with text/state).

## Image-generation tool (explicit — new requirement)
The Future Snapshot card must incorporate a **real image-generation tool** (previously
a static placeholder). Implement it **client-side** to keep the server zero-dep and avoid
exposing any provider secret:
- **Provider abstraction:** a small `imageGen` module that calls an image model API
  (e.g. OpenAI/DALL·E, Replicate, or fal) directly from the browser. Start with one
  provider; make it swappable.
- **Key handling (safe):** the API key is supplied **by the user** via a settings field,
  stored only in `localStorage` (never in the repo, never sent to our server, never
  hardcoded). Show a clear "Add your API key to enable images" empty state when no key
  is present. Do **not** add any secret to the server or env.
- **Prompt:** generate from the user's selected Future goals + a Prism-safe editorial
  style (warm, grounded, no money/logos/luxury — matching the existing
  `snapshotPrompt()` vibe). This prompt logic already exists in the old `app.js` —
  reuse/port it.
- **UX:** "Generate snapshot image" button → loading skeleton → rendered image in the
  Snapshot card. Handle errors (bad key, rate limit, blocked) with friendly messages.
- **Graceful fallback:** if no key is set, render a **local, non-AI illustration**
  (CSS/SVG composition of the goals) so the card is never empty. This is the default
  until the user opts into a provider.
- **Constraints:** no new *server* routes; image calls go **browser → provider** only;
  never log the key; respect the "no secrets to the extension/server" rule (AGENTS.md #12).


- **API contracts unchanged**; two-product base only
  (`/api/core/growth`, `/api/future/invest`, `/api/future/content`, `/api/health`).
  **Do not reintroduce** the legacy routes (`/api/session/*`, `/api/life/simulate`,
  `/api/plan/save`, `/api/quiz/*`).
- **Narrow Chrome permissions** only; never monitor pages/history (see `AGENTS.md`).
- Deterministic math only — the UI must display the exact server-computed numbers.
- Keep the backend server zero external runtime deps.
- Preserve the "no auth / no DB / no real bank connections" base scope.

## Verify before committing
1. `npm install`
2. `npm run build` (must build packages + server + UI with no TS errors)
3. `npm test` (currently **31 passing** — must stay green; add UI-relevant unit
   tests only if they don't require a browser; otherwise rely on the build + manual walkthrough)
4. `npm run dev` → open http://localhost:8787 — walk **Prism Core** and **Prism Future**
   end-to-end. Confirm: charts render, sliders update projections live, prediction
   flow works, theme toggle works, 320px width is usable, reduced-motion is calm.
5. List changed files, commands/tests run, limitations, and any spec deviation in
   your commit message and a short note.

## Animation & image-tool acceptance (verify these specifically)
- Animations feel smooth (≈60fps), purposeful, and **fully disabled** under
  `prefers-reduced-motion: reduce` (use DevTools rendering emulation to confirm).
- Image tool: with a user-supplied key in settings, "Generate snapshot image" produces
  a real image in the Snapshot card; with **no key**, the card shows the local
  fallback illustration and a clear "add key to enable" prompt; invalid/blocked keys
  show a friendly error (no crash). No key is ever written to the repo or server.

## Commit message format
```
ui: <what changed>

<why> — refs CODEX_BRIEF_UI.md. Stack: Vite + React + TS.
Tests: npm test → NN passed; npm run build clean; demo walkthrough OK.
```
