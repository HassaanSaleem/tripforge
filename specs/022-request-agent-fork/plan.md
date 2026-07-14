# Implementation Plan: Self-drive vs. request-an-agent fork on the client trip view

**Branch**: `022-request-agent-fork` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-request-agent-fork/spec.md`

## Summary

Add a two-choice fork to the existing client-facing trip view (`/view/[token]`):
"Book it myself" (a confirmation-only stub — no anonymous checkout exists or is
built here) and "Have an agent arrange this for me" (captures name/email/notes and
creates a **trip handoff request** — a new bolt-on side record, not a
canonical-schema change — tenant-scoped to the itinerary's current owning
agency). A new agent-side "Trip requests" inbox in the workspace lists incoming
handoff requests and lets the agent mark one `accepted`. No payment, markup, or
revenue-share path is touched — this is a lead-capture/handoff mechanism, not a
money path.

**Naming note** (research D5): the codebase already has a pervasive, unrelated
`TripRequest`/`trip_request` type — the planner's search criteria
(destination/dates/party) stored per itinerary for supply re-derivation
(`packages/db/src/schema-itinerary.ts`'s `itinerary.trip_request` jsonb column,
`packages/api/src/services/itineraries.ts`, `planner.ts`, `booking/*.ts`). To
avoid colliding with that established vocabulary, this feature's new entity is
named **`TripHandoffRequest`** / `trip_handoff_request` in all code (table,
service, router, files) — the ticket's own suggested user-facing label ("Trip
requests" inbox) is kept as-is in the UI copy since it doesn't collide with
anything at the code layer, only the code identifiers are disambiguated.

## Technical Context

**Language/Version**: TypeScript (pnpm + turborepo monorepo, existing tsconfig)

**Primary Dependencies**: Drizzle ORM (Postgres), tRPC + zod, Next.js App Router
(UI) — no new package dependencies

**Storage**: PostgreSQL — 1 new table (`trip_handoff_request`), additive only;
canonical itinerary schema (SCHEMA_VERSION 0.1.0) is UNCHANGED (no migration
note required per Constitution IV — the request is a side record about the
itinerary, exactly like `itinerary_share_link`/`group_departure`, not itinerary
content)

**Testing**: Vitest (L1/L2 service tests), Vitest L3 against real Postgres
(`packages/api/src/__tests__/l3-trip-handoffs.test.ts`, env-gated on
`DATABASE_URL`, mirroring `l3-group-travel.test.ts`), Playwright e2e for the
fork UI + inbox, Playwright MCP live journey (INV-027)

**Target Platform**: Existing web app (`apps/web`, Next.js App Router) +
`packages/api` tRPC surface; no mobile UI in this cycle

**Project Type**: Web application (monorepo: packages + apps/web)

**Performance Goals**: N/A beyond existing app conventions — no new
latency-sensitive path (a request submission is a single short insert; the
inbox is a single indexed, tenant-scoped select)

**Constraints**: Tenant scoping (INV-004) on both the submit-time agency
resolution and the inbox read; zero platform branding on the client-view fork
UI (INV-020); no canonical schema change (Constitution IV); not a money path —
no payment, markup, or revenue-share involvement, so no L3 concurrency/
conservation treatment is required (unlike seed-0005d/e or the group-travel
capacity claim gate)

**Scale/Scope**: 1 new DB table, 1 extended router (`clientViewRouter`, +1
mutation), 1 new router (`tripHandoffsRouter`, 2 procedures) mounted into the
existing `workspaceRouter`, 1 new client-view UI component, 1 new workspace UI
panel, 1 new L3 test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | This IS the mechanism the constitution's own preamble names as keeping "the consumer surface feeding the marketplace, not... a standalone planner race" — a client's request-an-agent choice routes demand directly into the agent's workspace, growing marketplace-side engagement. "Book it myself" stays a confirmation stub precisely so no non-marketplace-feeding capability is built | PASS |
| II. Agent Experience Is the Wedge | Additive workspace surface (a new inbox); does not touch the builder or regress time-to-client-ready-itinerary | PASS |
| III. Budget-Aware AI Priced Against Reality | N/A — no planner/pricing involvement | N/A |
| IV. Canonical Itinerary Schema | NO schema change. The request is a bolt-on side table (`trip_handoff_request`, FK to itinerary), exactly like `itinerary_share_link`/`group_departure` (spec 010/021 precedent). No version bump, no migration note needed | PASS |
| V. Integrate Supply, Don't Contract It | N/A — no supply-adapter involvement | N/A |
| VI. Trust, Provenance & Revenue-Share Integrity | No money path (no payment/markup/revenue-share) — Constitution VI's integration-test mandate is for money paths specifically; still gets an L3 test for its own integration-point + tenant-scoping guarantees. Requests route to the itinerary's CURRENT owning agency (FR-011), respecting provenance/ownership the same way licensed-copy ownership already does elsewhere (INV-002/INV-004) — a resold copy's requests go to the reseller, never the original author | PASS |
| MVP Scope Discipline (P0 vs P1+/non-goals) | This spec's exact capability ("self-drive vs request-agent fork") is named under the roadmap's **P2 — Consumer surface** phase, which normally requires an explicit operator scope decision before entering planning. That decision exists: the ticket is explicitly framed "OPERATOR must-have" and was seeded by name (`demo-09-request-agent`) in the operator's 2026-07-13 demo-drive ticket batch (commit `1daf866`, "steers the loop... at the Friday demo feature set") — the same authorization under which demo-02/03/04/05/06/07/11 already shipped. This spec deliberately builds ONLY the fork + handoff-to-marketplace mechanism (the P0-relevant, marketplace-feeding slice), not the broader P2 self-serve consumer planner/booking surface — "Book it myself" is kept a stub for exactly this reason | PASS (scoped, operator-authorized) |

**Result**: No unjustified violations. The one roadmap-phase flag (MVP Scope
Discipline) is resolved by an existing, named operator scope decision, not
waived silently — recorded here per the constitution's own requirement that
P1+ work MUST NOT enter planning without one. No Complexity Tracking entries
required.

**Post-Phase-1 re-check**: Design artifacts (data-model.md,
contracts/request-agent-fork.md, quickstart.md) confirm the pre-Phase-0
analysis holds — one bolt-on table with no canonical-schema touch, no money
path, tenant scoping enforced server-side in both the submit and inbox-read
directions, "Book it myself" remains a stub with zero persisted state, and the
new entity's naming (`TripHandoffRequest`) was disambiguated from the
pre-existing, unrelated `TripRequest` planner-criteria type before any code was
written. Constitution Check result unchanged: PASS, no new Complexity Tracking
entries.

## Project Structure

### Documentation (this feature)

```text
specs/022-request-agent-fork/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/db/src/
├── schema-trip-handoffs.ts      # NEW — trip_handoff_request table
├── schema.ts                    # EDIT — assemble + re-export the new module
└── index.ts                     # EDIT — export the new table from package public surface

packages/api/src/services/
└── trip-handoffs.ts             # NEW — submitTripHandoffRequest, listTripHandoffRequests, acceptTripHandoffRequest

packages/api/src/routers/
├── client-view.ts                # EDIT — add requestHandoff mutation (public)
├── trip-handoffs.ts               # NEW — tripHandoffsRouter (list, accept), agentProcedure
└── workspace.ts                  # EDIT — register tripHandoffs: tripHandoffsRouter

packages/api/src/index.ts         # EDIT — re-export inferred types (TS4023 convention)

apps/web/app/(client-view)/view/[token]/
├── trip-fork.tsx                  # NEW — client component: the two-choice fork + request form
└── page.tsx                       # EDIT — render <TripFork> below ClientItineraryView

apps/web/app/(workspace)/workspace/
└── trip-handoffs-panel.tsx        # NEW — client component: list + accept, mirrors itinerary-list.tsx shape

apps/web/lib/nav.ts                 # EDIT — add "Trip Requests" nav destination (label checked disjoint from existing labels, incl. no "Trips" substring collision)
apps/web/app/(workspace)/<nav location, TBD during implementation>/
└── EDIT/NEW — mount <TripHandoffsPanel>, mirroring the dashboard-shell (spec 017) sidebar convention

packages/api/src/__tests__/
└── l3-trip-handoffs.test.ts       # NEW — real-Postgres: submit → tenant-scoped list → accept (idempotent) → cross-tenant refusal

tests/e2e/
└── trip-handoffs-journey.spec.ts  # NEW — Playwright: client submits request, agent sees + accepts it in the inbox
```

**Structure Decision**: No new package. The service lives in `packages/api/src/services/` alongside `client-view.ts`/`group-departures`-style services (this repo keeps marketplace-specific logic in `@tripforge/marketplace` but keeps itinerary/booking/client-view/group-travel service logic directly in `packages/api/src/services/` — trip handoff requests are a client-view/workspace concern, not a marketplace-transaction concern, so it follows the `client-view.ts` precedent, not the `@tripforge/marketplace` one).

## Pre-Write Discipline (recorded per `.claude/skills/typescript-clean-architecture/SKILL.md`)

- **`trip_handoff_request` table + `trip-handoffs.ts` service + both routers**:
  **new** — no existing table/service/router does this; a "request to hand off
  to an agent" is a genuinely new entity, distinct from `itinerary_share_link`
  (a read-access token), `group_departure` (sellable inventory), and the
  pre-existing, unrelated `trip_request` planner-criteria column.
- **`clientViewRouter`** (`packages/api/src/routers/client-view.ts`): **extend**
  — add one public mutation (`requestHandoff`) to the existing 1-procedure
  router; reuses its existing token-resolution path rather than duplicating it.
- **`workspaceRouter`** (`packages/api/src/routers/workspace.ts`): **extend** —
  mount one more sub-router (`tripHandoffs`) alongside `groupTravel`, identical
  pattern.
- **Tenant-scoping helpers**: **reuse** — the plain `WHERE agency_id = ?`
  discipline already used by every agent-scoped query in this codebase (no new
  claim-gate/conditional-update idiom needed; this is not a contended resource
  like `group_departure.seats_remaining`).
- **UI list pattern**: **reuse/extend** — mirrors `itinerary-list.tsx`'s
  loading/empty/loaded + status-badge + single-action-button shape; no new
  generic "list" abstraction (matches the one-list-per-surface precedent).
- **New package**: **none** — no capability here is orthogonal enough to
  justify one.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty. The one
roadmap-phase flag (MVP Scope Discipline) is resolved by a cited operator scope
decision, not a violation requiring justification.*
