---
description: "Task list — Bootstrap TripForge App Skeleton"
---

# Tasks: Bootstrap TripForge App Skeleton

**Input**: `specs/001-bootstrap-app-skeleton/` (spec.md, plan.md)

**Tests**: Included and required (unbeatable-tests bar: L1 + L2 mandatory, L3
smoke mandatory for the integration point).

**Organization**: grouped by the three user stories from spec.md. US1 (RBAC/tenancy)
and US2 (boots + real HTTP) are both P1; US3 (loop gates) is P2. All ship in one PR.

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Root workspace: `package.json` (scripts: `build`/`test`/`lint`/`typecheck`
  via turbo), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.
- [X] T002 [P] ESLint flat config (`eslint.config.mjs`) + `typescript-eslint`.
- [X] T003 [P] `.dependency-cruiser.cjs` encoding INV-017 (domain→adapters forbidden,
  itinerary-schema/shared leaves, apps→packages only).
- [X] T004 [P] `knip.json` (dead code) + `.jscpd.json` (duplication) configs.
- [X] T005 [P] `.github/workflows/ci.yml` running lint + `npm test`.

## Phase 2: Foundational (Blocking Prerequisites — leaf packages first)

- [X] T006 [P] `packages/shared`: `Result<T,E>` type, structured logger, typed config
  reader. Public `index.ts`. Leaf (INV-017).
- [X] T007 [P] `packages/itinerary-schema`: `SCHEMA_VERSION`, minimal zod `Itinerary`
  stub + `Provenance` placeholder, inferred TS types. Sole itinerary type home (INV-001).
- [X] T008 `packages/domain`: `Money` value type (integer minor units + currency),
  `splitEvenMinorUnits` pure fn (no lost cents), depends only on itinerary-schema
  (INV-009/010).
- [X] T009 `packages/db`: Drizzle client factory (`pg`), Better Auth + organization
  tables schema, `withTenant(agencyId)` scoped-query helper primitive (INV-004).
- [X] T010 [P] `packages/supply-adapter`: `src/ports` (hotel search/quote/book/cancel
  interface signatures, no supplier shapes) + `src/sandbox` deterministic stub;
  `index.ts` exports ports only (INV-005).
- [X] T011 [P] `packages/llm`: `LLMPort` interface (model pinned to `claude-haiku-4-5`
  type) + `FakeLLM` deterministic implementation. No live SDK call (INV-013).

## Phase 3: User Story 1 - RBAC + tenancy (P1) 🎯 MVP

**Goal**: agent reaches workspace procedures; traveler is denied; per-procedure roles.

**Independent Test**: L2 tRPC-caller test — agent session → `workspace.whoami` ok;
traveler session → `FORBIDDEN`.

- [X] T012 [US1] `packages/api`: tRPC init, `Context` = `{ session, db, container }`,
  `publicProcedure`, `agentProcedure` (role/tenant middleware reading session +
  org), `SessionContext` type `{ userId, agencyId?, role }` (INV-023/004).
- [X] T013 [US1] `packages/api`: `container.ts` composition root (wires db, ports, llm
  fake); `appRouter` with `health` (public) + `workspace.whoami` (agent-gated).
- [X] T014 [US1] [P] L2 test `packages/api/src/__tests__/rbac.test.ts`: agent ok,
  traveler `FORBIDDEN`, public health open. (Write to fail first, then satisfy.)
- [X] T015 [US1] [P] L1 test `packages/domain/src/__tests__/money.test.ts`: exhaustive
  `splitEvenMinorUnits` (conservation: parts sum to total, no fractional cents).

## Phase 4: User Story 2 - Boots + real HTTP (P1)

**Goal**: built app boots, `/api/health` does a real DB round-trip, L3 proves it.

**Independent Test**: L3 smoke starts real server + compose Postgres; health 200
`{status:ok,db:up}`; auth-gated route with no session rejected.

- [X] T016 [US2] `apps/web`: Next.js App Router scaffold — `(workspace)` +
  `(client-view)` route groups (INV-024), `app/api/health/route.ts` (real DB probe),
  `app/api/trpc/[trpc]/route.ts` (mounts `appRouter`), `lib/trpc` server/client.
- [X] T017 [US2] Better Auth server config (organization plugin, Drizzle adapter,
  mailpit SMTP) wired into the tRPC context; sign-in route usable by the e2e spec.
- [X] T018 [US2] `apps/web/Dockerfile` (multi-stage, Node 20, standalone build) +
  uncomment/define the `web` service `build:` target in `docker-compose.yml` (INV-019).
- [X] T019 [US2] L3 smoke `tests/integration/smoke.mjs`: boot real server against
  compose Postgres, assert `/api/health` 200 + `db:up` (round-trip), assert
  auth-gated route rejected with no session, teardown.

## Phase 5: User Story 3 - Loop gates (P2)

**Goal**: `npm test`/`npm run lint` green; boundaries machine-checked; CI + Playwright wired.

- [X] T020 [US3] Vitest root config + per-package test globs; ensure `npm test` runs
  all L1/L2 suites green.
- [X] T021 [US3] Playwright config (`playwright.config.ts`, screenshot/trace on
  failure, evidence dir) + `tests/e2e/smoke.spec.ts` (sign-in journey). Browser run
  gated on operator config (SKIPPED pre-skeleton).
- [X] T022 [US3] Verify dependency-cruiser passes on the scaffold and the domain→adapter
  edge is forbidden; verify knip/jscpd run.

## Phase 6: Polish & Handoff

- [X] T023 `quickstart.md`: boot + verify recipe.
- [X] T024 `.gitignore` additions (`.next/`, `dist/`, `.turbo/`, coverage), `.env.example`
  already covers secrets; README pointer if needed.
- [X] T025 File ONE `OPERATOR-DESK.md` row proposing sealed `kitchenloop.yaml` wiring
  (`smoke_command`, `boot_command`, `e2e_command`, `require_ci`) — do NOT edit the
  sealed file (FR-017).
- [X] T026 Spec-alignment table in the PR body (each FR → file(s) → test(s)); Live
  Test Evidence section (SKIPPED pre-skeleton, explicit).

## Dependencies & Execution Order

- Setup (P1) → Foundational (P2, leaves before dependents: shared/itinerary-schema →
  domain/db → supply-adapter/llm) → US1 (api) → US2 (apps/web needs api + db + auth)
  → US3 (gates need everything) → Polish.
- Money tests (T015) and RBAC tests (T014) are written to fail before the code
  satisfies them (per unbeatable-tests).

## Notes

- Schema is a **stub at initial version** — no version bump, no migration (ALWAYS-HALT).
- No supplier API shape, no live LLM call, no P1+/non-goal path (INV-005/013/022).
- All money is integer minor units + currency (INV-009).
