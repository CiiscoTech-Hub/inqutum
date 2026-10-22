# Contributing to Inqutum

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `dev`  | Integration target for all feature and fix PRs |
| `main` | Stable releases only — promoted from `dev` by maintainers |

**All pull requests must target `dev`, not `main`.**

## Workflow

1. Fork the repository and clone your fork.
2. Branch off `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b fix/your-description
   ```
3. Make your changes, run lint, typecheck, and tests (see [DEVELOPMENT.md](DEVELOPMENT.md)).
4. Open a PR targeting `dev`.
5. CI must pass before review.

## Release promotion

Maintainers merge `dev` → `main` for releases. Contributors should not open PRs directly to `main`.
