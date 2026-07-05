# Feature Specification: Bootstrap TripForge App Skeleton

**Feature Branch**: `001-bootstrap-app-skeleton`

**Created**: 2026-07-05

**Status**: Draft

**Input**: seed-0001 — "Bootstrap TripForge app skeleton via SDD". Stand up the v1
monorepo skeleton so every later iteration has a real product to exercise. The
stack is already decided (ADR-0001 + `docs/architecture/system-architecture.md`);
this feature implements it, it does not re-litigate it.

## Overview

This is infrastructure/foundation work: it delivers the runnable skeleton on which
all P0 product features (canonical schema, supply adapters, budget allocator,
marketplace) are built. The "users" of this feature are the two product actors the
skeleton must be able to serve from day one — an **agent** working in the agency
workspace and a **traveler** viewing a white-labeled client surface — plus the
**loop/CI** that must be able to boot, test, and lint the artifact.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent reaches an authenticated workspace, traveler cannot (Priority: P1) 🎯 MVP

An agent belongs to an agency (a Better Auth organization) and reaches the agency
**workspace** surface. A traveler is a standalone user with no organization and
reaches only the white-labeled **client-view** surface. Authorization is enforced
per tRPC procedure by role middleware reading the Better Auth session + organization
context — never by hiding UI (INV-023). A traveler session can never invoke a
workspace procedure (INV-024).

**Why this priority**: The identity/RBAC + surface split is the load-bearing
invariant the whole platform rests on (INV-023/024/004). Without it, no later
feature can enforce tenancy or role. It is the smallest slice that proves the
engine is wired end-to-end (route → tRPC → middleware → session).

**Independent Test**: Call the `workspace` router's protected procedure with an
agent session context → succeeds and is scoped to the agent's `agencyId`. Call the
same procedure with a traveler (no-org) session context → rejected with
`FORBIDDEN`. Both assertions run as an L2 tRPC-caller test with no HTTP or browser.

**Acceptance Scenarios**:

1. **Given** an agent session (org role `member`), **When** it calls the workspace
   `whoami` procedure, **Then** it returns the agent's userId + agencyId + role.
2. **Given** a traveler session (no organization), **When** it calls the same
   workspace procedure, **Then** it is rejected with a `FORBIDDEN` error and no
   data is returned.
3. **Given** any caller, **When** it calls the public `health` procedure, **Then**
   it returns `{ status: "ok" }` regardless of role.

### User Story 2 - The stack boots and answers a real HTTP request (Priority: P1)

The built application boots (`docker compose up --build`) with Postgres + mailpit
and zero paid/external services (INV-019), exposes a health endpoint over real
HTTP, and an L3 integration test starts the real server, hits the health route and
an auth-gated route, and asserts responses + a real DB round-trip.

**Why this priority**: The unbeatable-tests bar requires an L3 test that proves the
real app starts, routes resolve, middleware runs, and the DB is reachable — the
"38 unit tests pass, service broken" guard. A loop with no L3 smoke runs blind.

**Independent Test**: Run the L3 smoke script — it starts the real Next.js server
against the compose Postgres, `GET /api/health` returns 200 `{status:"ok",db:"up"}`,
and an unauthenticated call to an auth-gated tRPC procedure returns 401/FORBIDDEN.

**Acceptance Scenarios**:

1. **Given** the compose stack is up, **When** `GET /api/health` is requested,
   **Then** it returns HTTP 200 with `{ status: "ok", db: "up" }` (the `db` field
   proves a real Postgres round-trip, not a static string).
2. **Given** the app is running, **When** the L3 smoke hits an auth-gated route
   with no session, **Then** it is rejected (proves middleware runs on the real
   server, not just in unit tests).

### User Story 3 - The loop can test, lint, and enforce boundaries (Priority: P2)

The repo exposes `npm test` (Vitest L1/L2) and `npm run lint` (ESLint) that pass,
plus machine-checked architecture boundaries (dependency-cruiser encoding INV-017),
dead-code (knip) and duplication (jscpd) tooling, and a minimal GitHub Actions CI
(lint + test). The Playwright live-verification harness is wired (config + one
sign-in smoke spec) so INV-027 can be exercised once the operator wires the sealed
`kitchenloop.yaml` commands.

**Why this priority**: These are the gates every subsequent iteration depends on.
They are P2 relative to US1/US2 only because the engine must exist before the gates
can guard it; all three ship in this same PR.

**Independent Test**: `npm run lint` exits 0; `npm test` exits 0 with the L1/L2
suites green; `npx depcruise` reports zero INV-017 violations against the scaffold.

**Acceptance Scenarios**:

1. **Given** a clean checkout + install, **When** `npm test` runs, **Then** all
   L1/L2 suites pass.
2. **Given** the scaffold, **When** dependency-cruiser runs, **Then** a forbidden
   edge (e.g. `domain` importing an adapter) is a hard error in the ruleset.
3. **Given** a pushed branch, **When** CI runs, **Then** the lint + test workflow
   executes the same commands.

### Edge Cases

- **DB unreachable at boot**: `/api/health` MUST report `db:"down"` (and non-200)
  rather than crash the process or hang — health is a real probe, not a constant.
- **Traveler with a forged/absent org claim**: middleware defaults to least
  privilege — absence of a verified org context ⇒ not an agent ⇒ workspace denied.
- **Missing `ANTHROPIC_API_KEY`**: the skeleton has no live AI path yet, so boot
  and the full test/lint suite MUST NOT require it (INV-019). The `LLMPort` exists
  as an interface + deterministic fake only.
- **Fresh clone, no prior state**: `docker compose up --build` + one command must
  work with only the checked-in dev credentials (loopback-bound Postgres/mailpit).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repo MUST be a pnpm + turborepo monorepo with `apps/web` and the
  `packages/{shared, itinerary-schema, domain, db, supply-adapter, llm, api}` layout
  from the architecture doc; dependency direction `apps → packages`, `domain`
  imports no adapters, `itinerary-schema`/`shared` are leaves (INV-017).
- **FR-002**: `apps/web` MUST be a Next.js App Router app with two distinct route
  groups — agency **workspace** (agents) and white-labeled **client-view**
  (travelers) — separated by user type, not toggled by flags (INV-024).
- **FR-003**: The app MUST mount a tRPC router; web (and later mobile) reach the
  server only through `packages/api` procedures — no client reaches the DB or an
  adapter directly (INV-018).
- **FR-004**: Every protected tRPC procedure MUST declare a required role and be
  gated by role middleware reading the Better Auth session + organization context
  (INV-023). A traveler session MUST NOT be able to invoke a workspace procedure
  (INV-024).
- **FR-005**: Tenant scoping MUST be a first-class primitive: the session context
  carries `agencyId` and workspace procedures operate within it (INV-004). (No
  tenant-owned tables exist yet; the scoping primitive and its enforcement point
  are established here.)
- **FR-006**: Auth MUST be Better Auth on Postgres via Drizzle with the
  organization plugin — agency = org, roles `owner`/`admin`/`member`; local email
  goes to mailpit.
- **FR-007**: The app MUST expose an `/api/health` endpoint that performs a real
  Postgres round-trip and reports `{ status, db }`.
- **FR-008**: `docker-compose.yml` MUST define a `web` service with a `build:`
  target so `docker compose up --build` boots the built image + postgres + mailpit
  with zero paid/external services (INV-019, INV-027).
- **FR-009**: `npm test` (Vitest) and `npm run lint` (ESLint) MUST be wired and
  pass, covering L1 (a pure `packages/shared`/`domain` unit) and L2 (a tRPC-caller
  role-gate contract test).
- **FR-010**: An L3 smoke script MUST start the real server, hit real routes
  (including an auth-gated one), and assert responses + a real DB state/round-trip.
- **FR-011**: The Playwright live-verification harness MUST be wired: `@playwright/test`
  as a devDep, screenshot/trace-on-failure config, one e2e sign-in smoke spec under
  `tests/e2e/`, and the `.kitchenloop/evidence/` convention (git-ignored). Actual
  browser download + live run is gated on the operator wiring the sealed
  `kitchenloop.yaml` live commands (recorded as SKIPPED (pre-skeleton) this cycle).
- **FR-012**: A minimal GitHub Actions CI workflow MUST run lint + `npm test`.
- **FR-013**: Quality tooling MUST be wired as devDeps with configs: knip (dead
  code), jscpd (duplication), dependency-cruiser (`.dependency-cruiser.cjs`
  encoding the INV-017 layer boundaries).
- **FR-014**: The canonical itinerary schema package MUST exist as a versioned stub
  (a `SCHEMA_VERSION` + a minimal zod schema + provenance placeholder) so later
  seeds extend it in place; **no itinerary-shaped type may be declared outside it**
  (INV-001). Full schema is seed-0002 — this is a stub, not the final schema.
- **FR-015**: The supply-adapter package MUST exist as a `src/ports/` +
  `src/sandbox/` stub establishing the boundary; no supplier API shapes anywhere
  (INV-005). Full port family is seed-0003.
- **FR-016**: The `LLMPort` MUST exist as an interface in `packages/llm` with a
  deterministic fake; the test suite MUST NOT require a live provider or API key
  (INV-013). No live Anthropic call in the skeleton.
- **FR-017**: The PR MUST NOT edit any sealed regulator file (`kitchenloop.yaml`,
  quality bar, oracle, UAT protocol, architecture doc). Instead it MUST file ONE
  `OPERATOR-DESK.md` row proposing the operator wire `verification.oracle.smoke_command`,
  `verification.live.boot_command`, `verification.live.e2e_command`, and flip
  `pr_manager.require_ci` to true after merge.
- **FR-018**: All money-capable primitives introduced now MUST be integer minor
  units + explicit currency (a `Money` value type in `packages/domain`), even
  though no booking path exists yet (INV-009) — so later seeds inherit the safe type.

### Key Entities

- **Agency (organization)**: a Better Auth organization; the tenant boundary
  (`agencyId`). Roles: `owner`, `admin`, `member`.
- **Agent**: a user who is a member of an agency; reaches the workspace surface.
- **Traveler**: a standalone user with no organization; reaches only client-view.
- **Session context**: `{ userId, agencyId?, role }` derived from the Better Auth
  session; the input to every role/tenant middleware decision.
- **Itinerary (stub)**: versioned canonical entity, defined ONLY in
  `packages/itinerary-schema`; a placeholder in this feature, fleshed out by seed-0002.
- **Money**: `{ amountMinor: number (integer), currency: string }` — the money
  value type all later money math builds on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh clone reaches a running app via `docker compose up --build` +
  one command with zero paid services required.
- **SC-002**: `npm run lint` and `npm test` both exit 0 on a clean install; the
  suite includes at least one L1 and one L2 (role-gate) test.
- **SC-003**: The L3 smoke script starts the real server, gets HTTP 200 from
  `/api/health` with a real DB round-trip, and gets rejected from an auth-gated
  route with no session — all against the real stack.
- **SC-004**: dependency-cruiser reports zero INV-017 violations on the scaffold,
  and a forbidden dependency edge (domain → adapter) is a hard error in the ruleset.
- **SC-005**: No itinerary-shaped type exists outside `packages/itinerary-schema`
  and no supplier API shape exists outside `packages/supply-adapter` (grep-clean).
- **SC-006**: Exactly one `OPERATOR-DESK.md` row is present proposing the sealed
  `kitchenloop.yaml` wiring, and the PR touches no sealed regulator file.

## Assumptions

- The tech stack is fixed by ADR-0001; this feature implements, not re-decides it.
- `apps/mobile` (Expo) is a follow-up ticket, not part of this skeleton (the ticket
  body permits deferring it).
- The itinerary schema, supply ports, and LLM tool wiring are **stubs** here; their
  full implementations are seed-0002 / seed-0003 / seed-0005 respectively. This
  feature only establishes the boundaries and the versioned-stub so those seeds
  extend in place rather than fork.
- Live browser verification (INV-027) is legitimately SKIPPED (pre-skeleton) this
  cycle because the sealed `verification.live.boot_command` is empty and the loop
  may not edit `kitchenloop.yaml`; the harness ships ready and the desk row proposes
  activation.
- Dev credentials for local Postgres/mailpit are the checked-in loopback-bound
  values already in `docker-compose.yml` / `.env.example`; no real secrets.
