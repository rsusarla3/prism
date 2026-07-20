# Codex improvement handoff

Implementation commit: `139659031e757acdc2a71264b3d6d154fedb2e30`

Branch: `codex/improvement`

## Architectural improvements

- Preserved the monorepo boundaries and made the root build include the web server.
- Expanded authoritative shared contracts for time-series projections, inflation-aware outputs, Future Snapshot state, categorized goals, tutor turns, and a server-only image-provider boundary.
- Kept investing calculations deterministic and added validation, annual series, today-dollar interpretation, fee drag, start-later comparison, and a cautious 4% teaching illustration.
- Removed pre-gate answer leakage from incorrect algebra and finance verifier feedback.
- Kept bank and image generation provider-neutral; neither provider is enabled or imported into the extension.
- Restored explicit selected-text capture in the MV3 extension using session storage and only `sidePanel`, `storage`, `contextMenus`, and temporary `activeTab` permissions.

## User-visible improvements

### Prism Core

- Prediction before explanation.
- Interactive SVG graph synchronized with adjustable parameters and a value table.
- Clear repeated-addition versus repeated-multiplication representations.
- Diagnostic question with targeted feedback.
- Rule-based alternative-mode recommendation after repeated mistakes, including observation, proposed method, expected benefit, and user choice.
- Transfer challenge in a new social-growth context.
- Responsive, keyboard-accessible presentation with reduced-motion support.

### Prism Future

- Categorized future-goal onboarding requiring 3–5 suggested or custom goals.
- Interactive contribution, horizon, return, and fee controls.
- Contributions versus projected growth visualization.
- Inflation-adjusted output, fee drag, start-five-years-later comparison, and higher-fee comparison returned by the API.
- Responsible explanations of ETFs, individual stocks, bonds, diversification, uncertainty, and account-versus-investment distinctions.
- Lifestyle translation with explicit illustrative-language safeguards.
- Provider-ready Future Snapshot prompt and schema; image generation remains safely disabled until configured server-side.

### Chrome extension

- Selected-text context menu.
- Exact context preview and disclosure of what will be shared.
- Goal selection before opening the lesson.
- Restricted-page fallback and manual-topic alternative.
- No history access, broad host permissions, continuous monitoring, or embedded secrets.

## Verification results

- `node --check` for the web UI, extension background worker, and side panel: passed.
- `npm run lint`: passed (TypeScript static checks).
- `npm run typecheck`: passed.
- `npm run build`: passed for all packages and `prism-web`.
- Live server/API smoke tests: passed for `/`, `/api/health`, `/api/core/growth`, and `/api/future/invest`.
- `git diff --check`: passed.
- Secret-pattern review: no exposed values; only empty environment-variable names in the specification.
- `npm test`: compilation passes, but Vitest 2.1.9 hangs before collecting tests in this Codex execution environment, including with a single worker. The process was terminated rather than reported as passing. Hermes reported 25 passing tests before this pass; two new finance validation/series cases were added but require rerunning in a normal local terminal or CI.
- `npm install` reports five development-dependency audit findings (three moderate, one high, one critical). Review and upgrade the test toolchain separately; the shipped demo has no external runtime dependency.

## Known limitations

- Session and saved-plan persistence remains in memory.
- The extension captures and confirms context, but the complete learning interaction runs in the web app.
- The Core UI specializes in linear versus exponential growth; the legacy server-gated linear-equation routes remain available but are not the showcased flow.
- The simulator intentionally omits volatility paths, taxes, employer matching, and personalized suitability.
- Future Snapshot currently produces a safe prompt, not an image; a server-side provider and explicit user consent are required.
- Automated browser end-to-end coverage is still needed.

## Recommended next tasks

1. Run `npm test` in GitHub Actions or a teammate’s terminal and resolve the local Vitest worker hang.
2. Add HTTP integration tests around answer gating and projection input validation.
3. Pass the confirmed extension context and goal into a newly created server session rather than only opening the Core route.
4. Add durable anonymous-session persistence before authentication.
5. Configure an image-generation adapter behind the existing server-only boundary and add consent, retention, and failure states.
6. Conduct a keyboard/screen-reader audit and test the unpacked extension on Chrome protected and ordinary pages.
