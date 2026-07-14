# Implementation Plan: Group travel — agent-posted departures with seats, joins, and white-label resale

**Branch**: `021-group-travel` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-group-travel/spec.md`

## Summary

Add group-departure metadata (capacity, seats-remaining, per-seat price) bolted onto an
existing itinerary — not a schema fork. An agency posts a departure; agents join seats on
behalf of named clients with an atomic conditional-decrement claim gate (never oversells,
resolves last-seat races to exactly one winner); agencies browse active departures; and a
group departure is listable/licensable via the EXISTING, unchanged marketplace
listing/license mechanism, extended additively so a license transaction also seeds an
independent seat pool for the reseller's white-labeled copy. Reuses `splitTakeRate`,
`whiteLabelCopy`, `isVetted`/`vettedAgencyIds`, the marketplace listing/license tables, and
the booking claim-gate's atomic-conditional-update discipline — no canonical schema change,
no new revenue-share semantics.

## Technical Context

**Language/Version**: TypeScript (pnpm + turborepo monorepo, existing tsconfig)

**Primary Dependencies**: Drizzle ORM (Postgres), tRPC + zod, `@tripforge/domain` (money,
`splitTakeRate`), `@tripforge/marketplace` (extended), `@tripforge/itinerary-schema`, Next.js
App Router (UI)

**Storage**: PostgreSQL — 2 new tables (`group_departure`, `group_departure_seat`), additive
only; canonical itinerary schema (SCHEMA_VERSION 0.1.0) is UNCHANGED (no migration note
required per Constitution IV — group metadata lives in its own table, exactly like
`marketplace_listing`)

**Testing**: Vitest (L1/L2 unit + service tests), Vitest L3 against real Postgres
(`packages/api/src/__tests__/l3-group-travel.test.ts`, env-gated on `DATABASE_URL`,
mirroring `l3-marketplace.test.ts`/`l3-booking.test.ts`), Playwright e2e for the browse/post/
join UI, Playwright MCP live journey (INV-027)

**Target Platform**: Existing web app (`apps/web`, Next.js App Router) + `packages/api` tRPC
surface; no mobile UI in this cycle (mobile consumes the same tRPC router later if needed —
out of scope)

**Project Type**: Web application (monorepo: packages + apps/web)

**Performance Goals**: N/A beyond existing app conventions — no new latency-sensitive path
(join is a single short transaction, same class as booking claim/license)

**Constraints**: Capacity conservation MUST hold under concurrent requests (SC-002); money
in integer minor units (INV-009); tenant scoping (INV-004); no canonical schema change
(Constitution IV); no supplier-port involvement (a group departure is agent-authored fixed-
price inventory, not live-priced aggregator inventory)

**Scale/Scope**: 2 new DB tables, 1 extended DB module import site (`licensing.ts`), 1 new
marketplace-package module (`group-departures.ts`), 1 new tRPC router, 1 new UI section
(browse/post/join), 2 new PMF event types (additive), 1 new L3 test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | Extends the trade layer (B2B2B white-label reuse) and deepens agent-workspace utility (B2B2C group sales) — directly serves marketplace liquidity per spec's framing | PASS |
| II. Agent Experience Is the Wedge | Agent posts/joins/browses inside the existing workspace surface; no regression to time-to-client-ready-itinerary (additive feature, doesn't touch the builder) | PASS |
| III. Budget-Aware AI Priced Against Reality | N/A — group departures are agent-authored fixed-price inventory, not AI-planner output; no planner change | N/A |
| IV. Canonical Itinerary Schema | NO schema change. Group metadata is bolt-on (separate `group_departure` table + FK), exactly like `marketplace_listing` (spec 006 precedent). No version bump, no migration note needed | PASS |
| V. Integrate Supply, Don't Contract It | No supply-port involvement — group departures never call a supplier adapter; FR explicitly scopes this out (spec Assumptions) | PASS |
| VI. Trust, Provenance & Revenue-Share Integrity | Reuses the EXISTING, already-integration-tested license transaction (conserved split, atomic, vetting-gated) unchanged. Capacity conservation gets its own L3 test with forced-concurrency assertions (state conservation on the failure path), mirroring the booking claim gate. No NEW revenue-share semantics introduced (spec Assumptions explicitly defers three-way originator credit to the still-open `RESALE-SHARE-SEMANTICS` operator-desk row — DIRECTIVE ALWAYS-HALT boundary respected) | PASS |
| MVP Scope Discipline (P0 vs P1+/non-goals) | Public, anonymous self-serve traveler join (no agent intermediary) would edge into the P2 consumer-surface non-goal boundary. Spec scopes v0 to agent-initiated joins only (reuses the existing agent-workspace tenant-scoped surface, zero new public routes) — stays inside P0 | PASS (scoped) |

**Result**: No violations. No Complexity Tracking entries required.

**Post-Phase-1 re-check**: Design artifacts (data-model.md, contracts/group-travel.md,
quickstart.md) confirm the pre-Phase-0 analysis holds — 2 new bolt-on tables (no canonical
schema touch), the license-transaction extension is additive-only (no-op for non-group
listings, so spec 006's existing Constitution VI guarantees are untouched), the capacity
claim gate is a same-class generalization of an already-reviewed pattern (booking claim
gate), and no revenue-share semantics beyond the already-shipped two-way split are
introduced. Constitution Check result unchanged: PASS, no new Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/021-group-travel/
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
├── schema-group-travel.ts       # NEW — group_departure, group_departure_seat tables
├── schema.ts                    # EDIT — assemble + re-export the new module
├── pmf-events.ts                # EDIT — additive: group_departure_posted, seat_joined event types
└── index.ts                     # EDIT — export new tables/helpers from package public surface

packages/marketplace/src/
├── group-departures.ts          # NEW — postGroupDeparture, cancelGroupDeparture,
│                                 #       browseGroupDepartures, joinGroupDeparture (the claim gate)
├── licensing.ts                 # EDIT — additive: license transaction also seeds the
│                                 #       reseller's independent group-departure copy when present
└── index.ts                     # EDIT — export new flows

packages/api/src/routers/
├── group-travel.ts               # NEW — groupTravelRouter (post/cancel/browse/join), agentProcedure
└── workspace.ts                  # EDIT — register groupTravel: groupTravelRouter

apps/web/app/(workspace)/group-travel/
├── group-travel-panel.tsx        # NEW — client component: browse grid + post form + join action
├── group-trip-card.tsx           # NEW — image-forward card (departure date, seats-left, price, Verified badge)
└── page.tsx                      # NEW — route entry, mirrors apps/web/app/(workspace)/marketplace/page.tsx

apps/web/app/(workspace)/<nav location, TBD during implementation — spec 017 dashboard-app-shell sidebar>
└── EDIT — add "Group Trips" nav destination

packages/api/src/__tests__/
└── l3-group-travel.test.ts       # NEW — real-Postgres: post → browse → concurrent last-seat
                                   #       join race → white-label with independent seat pools

apps/web/tests/e2e/ (or wherever existing e2e specs live)
└── group-travel.spec.ts          # NEW — Playwright: post, browse, join, seats-left updates
```

**Structure Decision**: Extends the existing marketplace package and its sibling `apps/web`
workspace routes — matches the established pattern used by spec 006 (marketplace-v0) and
spec 011 (marketplace-ui). No new top-level package: group-travel logic is a marketplace
sub-concern (it is listed/licensed through the unchanged marketplace mechanism), so it lives
in `@tripforge/marketplace` per the Pre-Write Discipline "extend" decision, not "new".

## Pre-Write Discipline (recorded per `.claude/skills/typescript-clean-architecture/SKILL.md`)

- **`@tripforge/marketplace` package**: **extend** — group departures are listed/licensed
  through the unchanged `licenseListing`/`whiteLabelCopy`/`splitTakeRate` mechanism; a new
  module (`group-departures.ts`) sits alongside `listings.ts`/`licensing.ts` in the same
  package rather than forking a parallel package.
- **`licenseListing` transaction** (`packages/marketplace/src/licensing.ts`): **extend** —
  additive step inside the existing transaction (seed the reseller's group-departure copy
  when the source itinerary has one); zero behavior change for itineraries without group
  metadata (existing spec 006 tests stay green).
- **Capacity claim gate**: **generalize the atomic-conditional-update pattern**, not reuse the
  literal `lockQuoteRowsInClaimOrder` function — that helper exists specifically for
  MULTI-ROW id-ordered locking (many `booking_quote` rows claimed together). A group-trip
  join only ever touches ONE `group_departure` row, so the simpler, equally-safe form is a
  single `UPDATE ... SET seats_remaining = seats_remaining - 1 WHERE id = $1 AND status =
  'active' AND seats_remaining > 0 RETURNING ...` (the same "belt-and-braces conditional
  UPDATE" discipline already used at `packages/api/src/services/booking/book.ts` Phase 2,
  just single-row). Documented here so the plan doesn't silently reinvent an ad-hoc pattern.
- **PMF events** (`packages/db/src/pmf-events.ts`): **extend** the closed vocabulary
  (additive union members + `PMF_EVENT_TYPES` array + validation switch), following the exact
  precedent of `listing_created`/`take_rate_accrued` (no-money + money-bearing variants
  already coexist).
- **UI cards**: **extend the established pattern** from `listing-browse.tsx`'s `ListingCard`
  (same `tf-market-card`/`tf-badge`/`tf-btn--cta` class vocabulary) — new `GroupTripCard`
  component, not a generic reusable card abstraction (matches existing one-card-per-surface
  precedent; no premature abstraction).
- **New package**: **none** — no capability here is orthogonal enough to marketplace to
  justify a new package (Pre-Write Discipline extraction threshold not met).

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
