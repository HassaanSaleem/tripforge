# Implementation Plan: Seller Earnings Surface

**Branch**: `014-seller-earnings-surface` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-seller-earnings-surface/spec.md`

## Summary

Extend the two existing seller-facing marketplace reads
(`workspace.marketplace.browseListings` and `workspace.itinerary.list`) with
read-only aggregates already fully derivable from data the platform writes
today: per-listing license count + seller-credit total (from
`revenue_share_ledger`, seller-scoped), and a trip's active-listing fee +
currency. No new table, no new money math, no schema version bump — the
conservation identity (`price = platform_take + seller_credit`) that
`licenseListing` already enforces per row is simply summed and displayed.

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm workspace, Next.js 15 app router + tRPC)

**Primary Dependencies**: `@tripforge/db` (Drizzle ORM over Postgres), `@tripforge/marketplace`, `@trpc/server`, existing `apps/web` client (`lib/trpc/client.ts`)

**Storage**: PostgreSQL — reuses existing `revenue_share_ledger`, `marketplace_license`, `marketplace_listing`, `itinerary` tables; no migration

**Testing**: vitest (L1/L2 unit, `packages/marketplace/src/__tests__`, `apps/web/lib/__tests__`), L3 integration against real Postgres (`packages/api/src/__tests__/l3-marketplace.test.ts`, `l3-itinerary-list.test.ts`), Playwright e2e, Live Test & Fix (INV-027)

**Target Platform**: Web (existing `apps/web` Next.js app), tRPC API surface

**Project Type**: Web application (monorepo: `packages/*` domain/adapters, `apps/web` UI)

**Performance Goals**: N/A beyond existing read-path expectations (small per-agency listing counts; no new N+1 — aggregation is a single grouped query per read, mirroring `ratingAggregates`)

**Constraints**: Read-side only; MUST NOT alter `revenueShareBps` split calculation, `licenseListing` transaction, or `revenue_share_ledger` schema; earnings figures MUST be seller-scoped (INV-004) — never returned for a listing the caller does not own

**Scale/Scope**: Two extended read procedures, two UI surfaces (marketplace panel, workspace trip list), one new small aggregation helper mirroring `ratingAggregates`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First**: PASS. Directly serves marketplace liquidity — sellers who cannot see they are paid have no reason to keep listing (Constitution I rationale, PRD supply-side trust). Strengthens the wedge into the network for the supply side.
- **II. Agent Experience Is the Wedge**: PASS. Read-only surface addition inside the existing agent workspace/marketplace UI; no regression risk to time-to-client-ready-itinerary (does not touch the planner/build path).
- **III. Budget-Aware AI**: N/A — no AI/planning surface touched.
- **IV. Canonical Itinerary Schema**: PASS. No schema field added or changed; the itinerary document is untouched. No migration note required.
- **V. Integrate Supply, Don't Contract It**: N/A — no supplier adapter touched.
- **VI. Trust, Provenance & Revenue-Share Integrity**: PASS — this feature is squarely inside this principle's intent (revenue-share terms enforced *and visible*). The existing money path (`licenseListing`, `revenue_share_ledger`) is read, never re-computed or re-derived by a parallel calculation; the conservation identity is not re-validated here (already enforced at write time and proven in `l3-marketplace.test.ts`) — this feature only sums already-conserved rows. No new money-path write, so no new sandbox-provider integration test is required by this principle; the existing L3 money-path tests remain the money-safety net. A new L3 assertion is added per spec FR-002/SC-003 for the aggregate's exactness, per the quality bar's mandate for integration points.

**Result: PASS, no complexity deviations.**

## Project Structure

### Documentation (this feature)

```text
specs/014-seller-earnings-surface/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── seller-earnings.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/db/src/index.ts                              # +1 export (sum) — INV-017 barrel
packages/marketplace/src/listings.ts                   # extend BrowseListing + browseListings
packages/marketplace/src/earnings.ts                   # NEW: earningsAggregates (mirrors ratings.ts pattern)
packages/marketplace/src/__tests__/earnings.test.ts    # NEW: unit tests for the aggregation helper
packages/api/src/services/itineraries.ts               # extend MyItinerary + listItineraries (active-listing join)
packages/api/src/__tests__/l3-marketplace.test.ts       # extend: N-license earnings assertion
packages/api/src/__tests__/l3-itinerary-list.test.ts    # extend: Listed-mark assertion
apps/web/lib/marketplace-flow.ts                       # extend: earnings formatting helper(s)
apps/web/lib/itinerary-list.ts                          # extend: Listed-mark formatting helper(s)
apps/web/app/(workspace)/marketplace/marketplace-panel.tsx      # render earnings on mine: true cards
apps/web/app/(workspace)/workspace/itinerary-list.tsx           # render Listed mark
apps/web/lib/trpc/client.ts                             # type re-exports if the output shape needs a named type
```

**Structure Decision**: Extends the existing marketplace domain package
(`packages/marketplace`), the existing itinerary read service
(`packages/api/src/services/itineraries.ts`), and the existing two UI panels
— no new package, no new route, no new procedure name (both
`workspace.marketplace.browseListings` and `workspace.itinerary.list` already
exist and are the correct seams per the ticket's own file pointers).

## Complexity Tracking

*No violations — table omitted.*
