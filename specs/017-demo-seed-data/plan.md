# Implementation Plan: Demo Seed Data

**Branch**: `017-demo-seed-data` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-demo-seed-data/spec.md`

## Summary

Two parts, one feature: (1) extend the three sandbox supply adapters
(hotel/activity/transfer) with a curated content lookup for four hero cities
(Lisbon, Tokyo, Marrakech, Reykjavik) so ANY planner request for those
destinations — seed script or a live agent — gets realistic names,
descriptions, and licensed photos instead of the generic two-item procedural
placeholder; (2) add an idempotent seed script that runs as the final step of
the existing Docker migrate stage, driving the REAL application layer (Better
Auth's server API for password accounts, direct Drizzle inserts for
organization/membership/vetting rows — mirroring the exact pattern already
proven by packages/api's L3 test helpers — and the real tRPC application
router via `@tripforge/api`'s `buildContainer`/`createContext`/`createAppCaller`
for drafting, listing, licensing, rating, and media) to populate 4-5 vetted
demo agencies, 6+ drafted itineraries, 3+ marketplace listings, 3+ completed
licenses, and 3+ ratings.

## Technical Context

**Language/Version**: TypeScript 5.6 (ES2022 target, Node 20, ESM)

**Primary Dependencies**: `@tripforge/api` (composition root: buildContainer/
createContext/createAppCaller), `@tripforge/db` (Drizzle schema + client),
`better-auth` (server API, already an apps/web dependency), `tsx` (new
devDependency — runs the TypeScript seed script without a build step)

**Storage**: PostgreSQL (existing compose service) via the existing Drizzle
schema — no new tables, no schema version bump

**Testing**: `vitest` (L1 for the curated-catalog lookup helper — pure
function, deterministic); the seed script itself is verified live (INV-027)
against the built compose stack, not unit-tested (it is a one-shot ops
script, same class as `vet-agency.mjs`/`apply-views.mjs`, neither of which
carries a unit test)

**Target Platform**: Docker Compose local stack (`docker compose up --build`),
Linux container (node:20-alpine)

**Project Type**: Web application monorepo (existing `apps/web` + `packages/*`
turborepo structure — no new project type)

**Performance Goals**: N/A (one-shot boot-time script; no request-path
latency budget applies)

**Constraints**: Must be idempotent (safe to re-run against an
already-seeded database with zero duplication or ledger imbalance); must not
introduce a new manual step for `docker compose up`; must not touch the
canonical itinerary schema, the booking/quote flow, or any sealed gate file

**Scale/Scope**: One curated-catalog data module (~4 cities × ~10-12 offers
each), one seed script (~5-5 agencies, 6-8 itineraries, 3-4 listings, 3+
licenses, 3+ ratings), two small additive edits to existing files
(`SupplyContent`, three `search()` methods), plus mechanical wiring
(Dockerfile, docker-compose.yml, knip.json, dependency-cruiser config)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | Feature directly seeds marketplace liquidity data (listings/licenses/ratings) so the "empty marketplace" cold-start risk (PRD §13) is addressed for the demo; does not touch consumer-surface scope. | PASS |
| II. Agent Experience Is the Wedge | No change to itinerary-builder speed/polish; curated content makes agent-facing drafts look more real, does not regress time-to-client-ready-itinerary. Client-facing branding unaffected. | PASS |
| III. Budget-Aware AI, Priced Against Reality | Seeded itineraries are produced through the REAL budget allocator + live-priced (sandbox) supply search — no static/unpriced suggestions are introduced. Curated offers still carry `netRate` in integer minor units, still flow through the same quote/book-eligible port shape. | PASS |
| IV. Canonical Itinerary Schema | No change to `@tripforge/itinerary-schema` or `SCHEMA_VERSION`. The only type addition (`imageUrl?`, `attribution?` on `SupplyContent`) lives in `packages/supply-adapter`, which is explicitly OUTSIDE the canonical schema boundary — items still only ever carry a `MediaRef` array (itinerary-schema's own type), unchanged by this ticket. | PASS |
| V. Integrate Supply, Don't Contract It | Curated catalog lives entirely inside `packages/supply-adapter/src/sandbox/` (the adapter boundary); no supplier API shape crosses out of the package; the port interfaces (`HotelPort`/`ActivityPort`/`TransferPort`) are unchanged. | PASS |
| VI. Trust/Provenance/Revenue-Share Integrity | Revenue-share math for seeded licenses runs through the existing `packages/marketplace`/`packages/domain` split functions (`licenseListing`/`splitTakeRate`) — the seed script never computes a split inline. Media is licensed-stock-only with attribution (constitution content-sourcing rule). Tenant scoping (INV-004) is enforced by using the real tRPC procedures with a correctly-scoped session per agency, not raw cross-tenant inserts. | PASS |

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-demo-seed-data/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   ├── curated-catalog.md
│   └── seed-script.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/supply-adapter/src/
├── ports/common.ts              # SupplyContent gains optional imageUrl/attribution
└── sandbox/
    ├── curated-catalog.ts       # NEW — per-city hotel/activity/transfer fixtures + lookup
    ├── hotel.ts                 # search() checks curated lookup before procedural fallback
    ├── activity.ts              # search() checks curated lookup before procedural fallback
    └── transfer.ts              # search() checks curated lookup before procedural fallback

apps/web/
├── package.json                 # + devDependency tsx, + script "db:seed"
├── scripts/
│   └── seed-demo.ts             # NEW — idempotent seed script (entry point, run via tsx)
└── Dockerfile                   # migrate-stage CMD gains the db:seed step

docker-compose.yml                # migrate service CMD gains the db:seed step (mirrors Dockerfile)
knip.json                         # apps/web workspace entry gains scripts/*.ts
.dependency-cruiser.cjs           # no-orphans pathNot gains ^apps/web/scripts/
```

**Structure Decision**: No new package. The curated catalog is adapter-internal
data (packages/supply-adapter), and the seed script is an apps/web-owned
ops script (apps/web/scripts/), matching the existing precedent of
`packages/db/scripts/` for operator/CLI actions entered via `node`/`tsx`
rather than imported by application code. apps/web is the only place that
already owns a Better Auth server instance, so it is the natural (and only
architecturally consistent) home for a script that needs to create real
password-authenticated accounts.

## Complexity Tracking

*No violations — table omitted.*
