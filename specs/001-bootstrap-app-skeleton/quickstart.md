# Quickstart — TripForge skeleton

## Prerequisites

- Node 20+ and pnpm (via `corepack enable`); Docker for the built-image path.

## Install

```bash
pnpm install          # or: npm install (npm workspaces are declared too)
```

## Run the test/lint gates (the loop oracle)

```bash
npm run lint          # ESLint (flat config) across the repo
npm test              # Vitest L1/L2 across all packages
```

## Boot the built stack (INV-019 / INV-027)

```bash
docker compose up --build --wait      # postgres + mailpit + built web image
# app:      http://localhost:3000
# mailpit:  http://localhost:8025
```

## L3 smoke (real server + real DB)

```bash
# with the compose Postgres up:
node tests/integration/smoke.mjs
# asserts: GET /api/health -> 200 {status:"ok",db:"up"} (real round-trip),
#          an auth-gated tRPC procedure with no session -> rejected.
```

## Surfaces

- **Workspace** (agents): `apps/web/app/(workspace)` — agency workspace, requires an
  agent session in an organization (INV-023/024).
- **Client view** (travelers): `apps/web/app/(client-view)` — white-labeled,
  carries the agent's brand only (INV-020).

## What is a stub here (extended by later seeds)

- `packages/itinerary-schema` — versioned stub; seed-0002 fleshes out the canonical schema.
- `packages/supply-adapter` — ports + sandbox boundary; seed-0003 adds the full port family.
- `packages/llm` — `LLMPort` + `FakeLLM`; seed-0005 wires the real planner (Haiku, INV-013).
