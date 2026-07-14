# Implementation Plan: Agency Member Roster

**Branch**: `025-agency-member-roster` (implemented on loop branch `kitchen/fix-seed-0009-agency-admin-surface`) | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-agency-member-roster/spec.md`

## Summary

Add a read-only agency member roster (`workspace.agencyAdmin.members`) as the
first real consumer of the existing `agencyAdminProcedure` owner/admin
authorization tier. Returns each member's name, email, role, and join date
for the caller's own agency; no new schema, no new dependency, no UI. The
`member`/`user`/`organization` tables already carry every field needed —
this is a thin tenant-scoped read projection, following the exact
service+router shape already used by `workspace.dashboard.stats`.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js), pnpm workspace monorepo

**Primary Dependencies**: tRPC v11 (`@trpc/server`), Drizzle ORM (`@tripforge/db`), Vitest — all already in use, no new dependency added

**Storage**: PostgreSQL via Drizzle — reuses the existing `member`, `user`, `organization` tables (`packages/db/src/schema-auth.ts`); no migration

**Testing**: Vitest — a DB-less RBAC-ladder test (existing `describe`/`it` pattern) + an L3 test against real Postgres, gated by `DATABASE_URL` (existing `describe.skipIf` pattern)

**Target Platform**: Server (Next.js app via tRPC router), consumed in-process via `createAppCaller` or over HTTP by `apps/web`/`apps/mobile`

**Project Type**: Web service (tRPC API package within an existing monorepo) — no frontend change

**Performance Goals**: N/A beyond existing query conventions (single indexed-join query, no pagination needed at P0 agency scale — see spec Assumptions)

**Constraints**: Read-only in this iteration (FR-007); no billing/markup-policy exposure (FR-008); tenant-scoped at the query itself, never via app-layer filtering (INV-004)

**Scale/Scope**: One new service function, one new router, one router-mount edit, one type re-export, two new test files. No UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First** — N/A to reject/defer test: this is agency-internal tooling (who's on my team), not a marketplace or consumer-surface feature. It does not compete for marketplace-liquidity priority; it unblocks the *existing* owner/admin authorization tier from being permanently unused. PASS (not applicable, not in tension).
- **II. Agent Experience Is the Wedge** — Not itinerary-builder-facing; does not touch time-to-client-ready-itinerary. PASS (not applicable).
- **III. Budget-Aware AI Priced Against Reality** — No AI/planning surface involved. PASS (not applicable).
- **IV. Canonical Itinerary Schema** — No itinerary data touched; no schema change of any kind. PASS.
- **V. Integrate Supply, Don't Contract It** — No supplier/adapter involved; pure internal auth/org data. PASS.
- **VI. Trust, Provenance & Revenue-Share Integrity** — Not a money path (no payments/take-rate/commission). The RBAC ladder itself *is* a trust mechanism (owner/admin-only, tenant-scoped) and this feature strengthens enforcement of an existing gate rather than introducing a new money-adjacent surface. PASS.
- **Non-Goals list** — Not ride-hailing, not flights-MoR, not Airbnb inventory, not a generic consumer planner. PASS.
- **MVP Scope Discipline (P0)** — Agency-side admin tooling is in-phase, P0-adjacent (agent-side per the ticket's own framing); does not touch P1+/P2/P3 roadmap items. PASS.
- **Money-path testing requirement** — Not a money path; standard L2/L3 test split (per Development Workflow's "Simplicity default") applies instead of the money-path integration-test mandate. PASS.

No violations. Complexity Tracking section is not needed (no gate failures to justify).

*Post-Phase-1 re-check*: design artifacts (below) introduce no new entity, no schema change, no supplier/adapter touch, and no money computation — the Constitution Check outcome is unchanged. PASS.

## Project Structure

### Documentation (this feature)

```text
specs/025-agency-member-roster/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── agency-admin.members.md
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/api/src/
├── services/
│   └── agency-members.ts        # NEW — listAgencyMembers(db, agencyId)
├── routers/
│   ├── agency-admin.ts          # NEW — agencyAdminRouter { members }
│   └── workspace.ts             # EDIT — mount agencyAdmin: agencyAdminRouter
├── index.ts                     # EDIT — re-export AgencyMemberSummary (TS4023)
└── __tests__/
    ├── agency-admin-router-rbac.test.ts   # NEW — DB-less RBAC ladder (anon/traveler/member)
    └── l3-agency-admin.test.ts            # NEW — real-Postgres ALLOWED path + INV-004 isolation
```

**Structure Decision**: Single existing project (`packages/api`, the tRPC API
package). No new package, no frontend change — this is an additive slice of
the existing `workspace` router, mirroring the `dashboard` router's
service+router shape exactly (`packages/api/src/services/dashboard-stats.ts`
+ `packages/api/src/routers/dashboard.ts`).

## Complexity Tracking

*No violations — table intentionally omitted.*
