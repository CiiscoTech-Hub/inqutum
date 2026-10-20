# Development Guide

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
# Backend
cd backend && npm ci

# Frontend
cd frontend && npm ci
```

## Running checks

```bash
# Backend
cd backend
npm run typecheck
npm test
npm run release:check

# Frontend
cd frontend
npm run lint
npm run typecheck
npm test
```

## CI

CI runs on every push and pull request targeting `dev` or `main`.
Pull requests must target `dev`. See [CONTRIBUTING.md](CONTRIBUTING.md).
