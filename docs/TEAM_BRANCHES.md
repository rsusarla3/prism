# Prism team branches

`develop` is the shared integration branch. `main` is the stable branch and is updated only after the integrated demo is reviewed.

| Branch | Workstream |
| --- | --- |
| `codex/improvement` | Prism Core, Prism Future, curriculum UX, integration polish |
| `hermes/base` | Base implementation, deterministic calculations, regression fixes |
| `backend/generation-hardening` | Generation service, validation, provider boundary |
| `prism-hero` | Web hero and Chrome-extension workflow |
| `prism-theme` | Shared visual theme (already included in `prism-hero`) |
| `landing-page` | Standalone launch and pitch page |
| `develop` | Tested merge of active workstreams |
| `main` | Stable, presentation-ready releases only |

## Workflow

1. Work on the branch assigned to your workstream.
2. Sync from `develop` before opening a pull request.
3. Open pull requests into `develop`, never directly into `main`.
4. Include tests run and known limitations in each pull request.
5. Merge `develop` into `main` only after the complete demo passes review.

Avoid editing the same files on multiple branches when possible. If a shared contract must change, agree on the contract in `develop` first.
