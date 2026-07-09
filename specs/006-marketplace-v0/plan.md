# Implementation Plan: Marketplace v0 — list, license/white-label, ratings, revenue-share plumbing

**Branch**: `kitchen/fix-seed-0006-marketplace-v0` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-marketplace-v0/spec.md`

## Summary

Build the P0 trade layer: vetted agencies list finished canonical itineraries with
license terms; other vetted agencies license them and receive a provenance-stamped
white-label copy; the license fee split (seller credit + platform take) is recorded
in the SAME database transaction as the license and copy (INV-012); licensees rate
listings. New `packages/marketplace` holds the flows as pure-ish service functions
over the db handle; split math is a pure domain function (INV-010); five new Drizzle
tables; thin tRPC procedures under `workspace.marketplace.*`; PMF events reuse the
existing vocabulary (`take_rate_accrued`, `trip_created(source=licensed)`) plus two
additive no-money types. No canonical-schema change: `ListedItinerarySchema` and the
provenance block shipped with seed-0002 already define everything the marketplace
needs (no version bump — no operator schema gate).

## Technical Context

**Language/Version**: TypeScript 5.x (workspace-pinned), Node 22, pnpm + turborepo monorepo

**Primary Dependencies**: Drizzle ORM (PostgreSQL), tRPC v11, zod, Better Auth (session/org context), `@tripforge/{domain,itinerary-schema,db,shared}`

**Storage**: PostgreSQL — single system of record (INV-003); schema applied via `drizzle-kit push` (compose migrate stage)

**Testing**: vitest L1/L2 (root `pnpm test`); env-gated L3 against the compose Postgres (`DATABASE_URL`, per specs/004 harness conventions and `l3-booking.test.ts` precedent); INV-027 live gate against the built compose image

**Target Platform**: Next.js app routes (stateless serverless-correct per INV-028 — the marketplace keeps ZERO in-process cross-request state; every flow is one short DB transaction)

**Project Type**: web monorepo (apps/web + packages/*)

**Performance Goals**: standard API latency; license path is one short transaction (lock listing → 3 inserts + 2 events)

**Constraints**: INV-002 (provenance travels), INV-004 (tenancy), INV-009 (integer minor units), INV-010 (money math only in domain), INV-011 (failure-branch conservation), INV-012 (split recorded in the license transaction), INV-021 (PMF events in the same transaction), INV-028 (no in-process state)

**Scale/Scope**: P0 liquidity milestone — live liquidity in 1–2 destination niches; no pagination/search sophistication at v0

## Constitution Check

*GATE: evaluated before Phase 0 research; re-evaluated after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | This feature IS the trade layer (P0 pillar). Every flow (list/license/rate) deepens liquidity directly. |
| II. Agent Experience Is the Wedge | PASS | No builder-path change → time-to-client-ready-itinerary unaffected. The white-label copy re-homes to the reseller's agency; client-view branding rules (INV-020/024) apply unchanged to copies. |
| III. Budget-Aware AI, Priced Against Reality | PASS (N/A) | No AI surface in this feature; no planner output involved. |
| IV. Canonical Itinerary Schema | PASS | Copies are full canonical itineraries; listing validates against the existing `ListedItinerarySchema` refinement (seed-0002). NO schema change, NO version bump — provenance fields already exist. The white-label transform is a pure function producing a schema-valid document. |
| V. Integrate Supply, Don't Contract It | PASS | The marketplace trades finished itineraries — zero supplier/port calls in any flow; `packages/marketplace` does not import `supply-adapter`. |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | Vetting gate enforced mechanically at list AND license; provenance stamped into the copy inside the transaction; split recorded in the SAME transaction (INV-012); ratings restricted to licensees; money path covered by L3 tests incl. forced-failure conservation (INV-011). |
| MVP Scope Discipline | PASS | Exactly the PRD P0 marketplace scope ("vetted agents list, others license/white-label; ratings + revenue-share plumbing"). Booking-side revenue-share honoring on resold-trip margins is P1 ("provenance & revenue-share hardening") and explicitly deferred. PMF events emitted (take-rate per active agent, resold:self-built). |
| Development Workflow | PASS | SDD artifacts in this directory; money-path L3 release gate planned; simplicity default (no P1 features: no resale-permission matrices, no payouts/settlement, no discovery feed). |

**Post-Phase-1 re-check (2026-07-09)**: PASS — design introduces no schema fork, no
supplier coupling, no money math outside `packages/domain`, no P1+ scope. Two
open semantic defaults (vetting mechanism, take-rate default) are surfaced for
operator review in spec.md "Decisions surfaced for operator review".

## Project Structure

### Documentation (this feature)

```text
specs/006-marketplace-v0/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── marketplace.md   # Phase 1 output — workspace.marketplace.* contract
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/marketplace/            # NEW package — the trade-layer flows
├── package.json                 # deps: @tripforge/{db,domain,itinerary-schema,shared}, zod
├── tsconfig.json
└── src/
    ├── index.ts                 # public surface
    ├── vetting.ts               # isVetted(db, agencyId) — the who-may-list gate
    ├── white-label.ts           # pure copy transform (provenance + lineage + re-home)
    ├── listings.ts              # createListing / browseListings / deactivateListing
    ├── licensing.ts             # licenseListing — the INV-012 money transaction
    ├── ratings.ts               # rateListing (licensees only, upsert)
    └── __tests__/               # L1/L2 (pure transform, input schemas, refusals)

packages/domain/src/money.ts     # EXTEND: splitTakeRate(price, takeRateBps) pure fn
packages/db/src/schema.ts        # EXTEND: 5 tables (listing/license/ledger/rating/vetting)
packages/db/src/pmf-events.ts    # EXTEND: listing_created + listing_rated event types
packages/db/scripts/vet-agency.mjs  # NEW operator vetting action (out-of-band, P0)
packages/api/src/routers/marketplace.ts  # NEW thin router → workspace.marketplace.*
packages/api/src/routers/workspace.ts    # EXTEND: mount marketplace router
packages/api/src/__tests__/l3-marketplace.test.ts  # NEW L3 (money path, conservation)
packages/api/src/__tests__/marketplace-rbac.test.ts # NEW L2 caller ladder (reuse pattern)
```

**Structure Decision**: the ticket mandates `packages/marketplace`. Service
functions take `(db, actor, input)` — NOT the api `Container` — so the package
has no dependency on `packages/api` (no cycle) and no supply ports (it needs
none). The api layer stays a thin adapter: session → actor, zod parse, typed
outcome → TRPCError mapping, exactly like `routers/booking.ts`.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

## Pre-Write Discipline (recorded for the PR body)

- **reuse**: `ListedItinerarySchema`, `ProvenanceSchema`, `stampProvenance`,
  `scopedWhere`/`tenantScope`, `recordPmfEvent` (+ existing `take_rate_accrued`,
  `trip_created` event types), `agentProcedure`, `parseItinerary`, uuid/`bigint`
  column conventions, L3 harness conventions from `l3-booking.test.ts`.
- **extend**: `packages/domain/money.ts` (+`splitTakeRate`), `packages/db/schema.ts`
  (+5 tables), `packages/db/pmf-events.ts` (+2 no-money types), `workspaceRouter`
  (+marketplace).
- **new**: `packages/marketplace` (flows), `routers/marketplace.ts` (thin),
  `vet-agency.mjs` (operator action). Justification: no existing package owns
  trade-layer semantics; the ticket and architecture both name the package.
