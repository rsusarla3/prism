# Codex UI revamp handoff

## Delivered

- Migrated the Prism web client from vanilla templates to Vite + React + TypeScript in `apps/web/ui`.
- Added a hand-crafted light/dark design system, persisted theme toggle, responsive layouts from 320px upward, visible focus states, reduced-motion behavior, skeletons, count-ups, step transitions, and animated chart drawing.
- Preserved the four-stage Prism Core flow with prediction, live synchronized chart/table, diagnostic adaptation, and transfer.
- Preserved the four-stage Prism Future flow with enforced 3–5 goals, live deterministic projections, scenario overlays, asset education, and Future Snapshot.
- Added a swappable client-side image provider using OpenAI's image-generation endpoint. The user supplies the key, which remains in that browser's `localStorage` and is sent only to OpenAI. Prism's server never receives or logs it.
- Added a local CSS illustration as the no-key and provider-failure-safe baseline.
- Kept all existing API routes and payloads unchanged and did not restore legacy routes.

## Verification

- `npm install --cache /tmp/prism-npm-cache`: completed.
- `npm run build`: passed; 35 UI modules compiled, 219.64 kB JS / 16.51 kB CSS before gzip.
- `npm test`: 31 tests passed across four files.
- Live HTTP checks: index, hashed JS/CSS assets, and `/api/health` returned successfully.
- `git diff --check`: passed.
- Secret scan: no API key value or server environment secret was introduced.
- Static accessibility review: semantic buttons/labels, chart title/description, keyboard-focusable chart endpoints, accessible table alternative, focus transfer between stages, focus rings, and reduced-motion overrides are present.

## Limitations

- The in-app browser webview did not attach to the localhost tab after two attempts, so this pass could not honestly complete screenshot-based visual QA or interactive 320px DevTools verification. The responsive 320px rules and flows were reviewed statically and should be walked through in Chrome before judging.
- A real image call was not made because no user API key was available. The request shape follows the official OpenAI image-generation API; actual success still depends on provider CORS behavior, account access, billing, rate limits, and content policy.
- The API key is intentionally stored in `localStorage` because `CODEX_BRIEF_UI.md` explicitly requires it. For production, a short-lived server-issued token or user-controlled proxy would provide a stronger security model.
- Google Fonts gracefully fall back to system fonts when offline.

## Recommended manual walkthrough

1. Open Prism at desktop width and 320px width.
2. Toggle light/dark mode and reload to confirm persistence.
3. Complete all four Prism Core stages; miss the diagnostic twice to reveal the alternative lens.
4. Complete Prism Future with 3–5 goals; toggle both projection overlays.
5. Reach Future Snapshot without a key and confirm the local illustration and empty state.
6. Add a test-enabled OpenAI key, generate once, then remove the key and confirm it is absent from local storage.
7. Emulate `prefers-reduced-motion: reduce` and confirm path, page, count-up, and shimmer animation is effectively disabled.
