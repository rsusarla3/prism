# Prism branch workflow

`develop` is the only shared integration branch. `main` is the stable,
presentation-ready branch. Contributor branches are temporary workspaces, not
long-lived copies of the product.

## Permanent branches

| Branch | Purpose | Direct pushes |
| --- | --- | --- |
| `develop` | Latest tested combination of team work | Integration owner only |
| `main` | Reviewed release or presentation build | Never; merge from `develop` |

## Contributor branches

Create new work from the latest `develop` and use one of these prefixes:

| Prefix | Owner/workstream |
| --- | --- |
| `david/` | Product chassis, Prism Core/Future, integration |
| `rohan/` | Frontend, UI, landing page, extension presentation |
| `joanne/` | Backend, storage, generation services |
| `sunny/` | Learning/generation engine and adaptive tutoring |

Use a task name after the prefix, for example `sunny/adaptive-quiz` or
`rohan/extension-pentagon`. Do not keep adding unrelated work to one permanent
personal branch.

## Required workflow

1. Pull the latest `develop`.
2. Create a short-lived task branch from `develop`.
3. Make one cohesive change and add or update tests.
4. Before opening a pull request, merge or rebase the latest `develop` into the
   task branch and resolve conflicts there.
5. Open a pull request into `develop`; include the user-visible result, tests
   run, and known limitations.
6. The integration owner runs the complete test suite and production build on
   the combined result.
7. Merge the pull request into `develop`.
8. Delete the task branch after the merge. Git history preserves the work.
9. For a release, open one pull request from `develop` into `main`. Never merge
   a contributor branch directly into `main`.

## File ownership

Ownership identifies the reviewer; it does not prevent collaboration.

| Area | Primary reviewer |
| --- | --- |
| `apps/extension` | Rohan (interface) and Sunny (learning behavior) |
| `apps/landing` | Rohan |
| `apps/web/ui` | David and Rohan |
| `apps/web/src` | Joanne |
| `packages/generation` | Joanne and Sunny |
| `packages/learning-engine` | Sunny |
| `packages/curriculum`, `packages/verifiers` | David |
| `packages/shared`, `packages/api-client` | Integration owner plus affected reviewers |

Changes to `packages/shared` or an API contract must update both producer and
consumer in the same pull request, or land as a small contract pull request
before dependent work begins.

## Branch cleanup rule

A contributor branch can be deleted when its tip is already an ancestor of
`develop`. An integration branch can be deleted when it points to the same
commit as `develop`. Branches with unique commits must be reviewed through a
pull request before deletion.

Do not use contributor branches as backups. Use commits, tags, pull requests,
and GitHub history for recovery.

## Release checklist

Before merging `develop` into `main`:

- extension capture works on representative article and assignment pages;
- all five extension modes complete successfully with local fallbacks;
- provider-backed behavior fails gracefully without keys;
- lint, type checks, tests, and the production build pass;
- no API keys, generated databases, or local environment files are committed;
- the demo flow is reviewed in the installed Chrome extension.
