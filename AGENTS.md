# AGENTS.md — Prism Coding-Agent Instructions

## Product

**Prism**  
**Tagline:** One concept. As many ways as it takes to make it click.

Prism is an adaptive Chrome learning copilot. Read `PRISM_HACKATHON_BUILD_SPEC.md` before coding.

## Non-negotiable rules

1. Ask the learner's goal before teaching.
2. Let the learner explicitly select or highlight context.
3. Reveal the answer to original homework only after a meaningful attempt.
4. Enforce answer gating on the server.
5. Use native interaction, not an infinite passive content feed.
6. Offer mode switches with an explanation of why they may help.
7. V1 finance uses manual inputs.
8. Preserve the `FinancialDataProvider` interface for a future bank connection.
9. Use deterministic math and finance verification.
10. Request the narrowest Chrome permissions.
11. Never silently monitor pages or browsing history.
12. Never expose LLM, database service-role, or financial-provider secrets to the extension.
13. Implement P0 before P1/P2.
14. Shared types and API contracts are authoritative.

## Required workflow

Before editing:

- Name the spec requirement.
- Inspect relevant shared types.
- List expected files.
- Identify tests.

After editing:

- List changed files.
- List commands/tests run.
- State limitations.
- State any deviation from the spec.

## Preferred repository boundaries

- `apps/extension`: Chrome client only
- `apps/web`: web UI and server routes
- `packages/shared`: domain types and schemas
- `packages/curriculum`: approved curriculum objects
- `packages/learning-engine`: state machine and adaptation rules
- `packages/verifiers`: deterministic math/finance logic
- `packages/api-client`: typed API client

Do not import server secrets or provider SDKs into `apps/extension`.

## P0 demo path

1. Highlight algebra equation.
2. Open Prism side panel.
3. Confirm shared context.
4. Select “Help me solve it.”
5. Submit attempt.
6. Receive precise hint.
7. Trigger explained Visual Lab recommendation.
8. Unlock answer after attempt.
9. Solve similar challenge.
10. Use Prism Life compound-interest simulator.
