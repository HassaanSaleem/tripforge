# Tasks: Seller Earnings Surface

**Input**: Design documents from `/specs/014-seller-earnings-surface/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/seller-earnings.md, quickstart.md

**Tests**: L1/L2 unit + L3 integration tests ARE included — the quality bar
(`.kitchenloop/quality-bar.md`) mandates L3 coverage for integration points,
and this feature touches a money-adjacent read path (revenue-share ledger).

**Organization**: Tasks are grouped by user story (US1 = earnings on the
marketplace card, US2 = Listed mark in the workspace) so each can be built
and verified independently.

## Phase 1: Setup

- [X] T001 Add `sum` to the drizzle re-export line in `packages/db/src/index.ts` (alongside existing `avg`, `count`) — the only shared infra change (research D3)

## Phase 2: Foundational

*(none — both user stories extend existing, already-scoped read procedures; no new shared scaffolding is required beyond T001)*

## Phase 3: User Story 1 — See what a listing has earned (Priority: P1) 🎯 MVP

**Goal**: A seller sees, on their own listing card on the marketplace page, the exact license count and total seller-credit earned — zero for never-licensed, exact for licensed N times, and never visible for another agency's listing.

**Independent Test**: License one listing twice from two different agencies; load the marketplace page as the seller; confirm "2" and the exact conserved sum appear on that card only.

- [X] T002 [P] [US1] Create `packages/marketplace/src/earnings.ts`: `EarningsAggregate` interface (`licenseCount`, `sellerCreditTotalMinor`) and `earningsAggregates(db, sellerAgencyId, listingIds)` — group-by query over `revenueShareLedger` joined to `marketplaceLicense` on `licenseId`, filtered by `revenueShareLedger.sellerAgencyId` and `marketplaceLicense.listingId IN (...)`, mirroring `ratingAggregates` in `packages/marketplace/src/ratings.ts` (research D1/D2)
- [X] T003 [US1] DEVIATION (recorded, not skipped): `ratingAggregates` — the exact precedent this mirrors — has zero dedicated L1 unit tests (it requires a real Drizzle query builder; mocking it would be a first-of-its-kind brittle pattern in this codebase). Folded T003's assertions into T005's L3 coverage instead, which is the established test level for DB-dependent aggregation helpers here.
- [X] T004 [US1] Extend `BrowseListing` interface and `browseListings()` in `packages/marketplace/src/listings.ts`: add `licenseCount: number | null` and `sellerCreditTotalMinor: number | null`; call `earningsAggregates` with `actor.agencyId` and the ids of rows where `sellerAgencyId === actor.agencyId`; default `mine` rows with no aggregate entry to `{ licenseCount: 0, sellerCreditTotalMinor: 0 }`; leave both fields `null` for `mine: false` rows (data-model.md, contracts §1)
- [X] T005 [US1] Extend `packages/api/src/__tests__/l3-marketplace.test.ts`: in the existing "US2" license-flow test (or a new `it`), license the same listing from two independent reseller agencies, then call `browseListings` as the seller and assert `licenseCount === 2` and `sellerCreditTotalMinor` equals the exact sum of both `sellerCreditMinor` ledger values (spec SC-003); assert the SAME response's rows for listings NOT owned by the seller have `licenseCount === null` and `sellerCreditTotalMinor === null`
- [X] T006 [P] [US1] Add a pure formatting helper (e.g. `formatEarnings(licenseCount, sellerCreditTotalMinor, currency)`) to `apps/web/lib/marketplace-flow.ts`, reusing `formatMinorAmount` — no new money arithmetic, only display formatting
- [X] T007 [US1] Render the earnings figure on the seller's own card in `ListingCard` (`apps/web/app/(workspace)/marketplace/marketplace-panel.tsx`), guarded on `listing.mine` (alongside the existing "Your listing" badge), using T006's helper
- [X] T008 [US1] Add/extend a Playwright e2e spec asserting the marketplace card shows "0 licenses"/zero earnings before any license, then the exact count/total after licensing from a second and third browser context

**Checkpoint**: User Story 1 is independently functional and verifiable — a seller can see their earnings on the marketplace page.

## Phase 4: User Story 2 — Know which of my trips are on the marketplace (Priority: P2)

**Goal**: The workspace trip list shows a "Listed" mark (with fee + currency) for a trip with an active listing, and no mark otherwise.

**Independent Test**: List one of an agency's trips; load that agency's workspace trip list; confirm only that trip shows "Listed · {fee} {currency}".

- [X] T009 [US2] Extend `MyItinerary` interface and `listItineraries()` in `packages/api/src/services/itineraries.ts`: LEFT JOIN `itinerary` to `marketplaceListing` on `itineraryId` AND `status = 'active'`; add `listing: { listingId; priceMinor; currency } | null` to each row (data-model.md, contracts §2, research D4)
- [X] T010 [US2] Extend `packages/api/src/__tests__/l3-itinerary-list.test.ts`: assert a freshly-drafted (unlisted) trip has `listing: null`; assert the same trip after `createListing` has `listing` populated with the correct `listingId`/`priceMinor`/`currency`; assert after `deactivateListing` the trip reverts to `listing: null`
- [X] T011 [P] [US2] Add a pure formatting helper (e.g. `formatListedBadge(listing)`) to `apps/web/lib/itinerary-list.ts`, reusing `formatMinorAmount` — no new money arithmetic
- [X] T012 [US2] Render the "Listed" mark in the trip row in `apps/web/app/(workspace)/workspace/itinerary-list.tsx`, using T011's helper; no mark when `trip.listing` is `null`
- [X] T013 [US2] Extend the workspace-list Playwright e2e spec (or add a new one) asserting the Listed mark appears after listing a trip and disappears after deactivating it (deactivation-clears assertion covered at L3 in T010; the e2e proves the UI wiring end-to-end)

**Checkpoint**: User Story 2 is independently functional and verifiable — a seller sees which trips are listed from the workspace.

## Phase 5: Polish & Cross-Cutting

- [ ] T014 Run `pnpm run lint` and `pnpm test` at the repo root; fix any findings
- [ ] T015 Live Test & Fix (INV-027) per quickstart.md — boot the built stack, run smoke + full e2e, drive the browser journey (Playwright MCP, screenshots), scan logs, fix any defect in-cycle
- [ ] T016 Write the sealed UAT card for seed-0030 per `.claude/skills/kitchenloop-execute/UAT-GATE.md`

## Dependencies & Execution Order

- **Setup (T001)** blocks both user stories (T002 and T009 both need `sum` exported).
- **User Story 1 (T002–T008)** and **User Story 2 (T009–T013)** touch disjoint files (`packages/marketplace/*` + marketplace-panel.tsx vs. `packages/api/src/services/itineraries.ts` + itinerary-list.tsx) — fully independent after T001; may be implemented in either order or in parallel.
- Within each story, the aggregation/service layer task precedes its L3 test extension, which precedes the UI task, which precedes its e2e task (standard bottom-up order).
- **Polish (T014–T016)** runs after both stories are complete.

## Parallel Example

```
# After T001 completes, these can run in parallel (different files):
T002 [P] [US1] packages/marketplace/src/earnings.ts
T009      [US2] packages/api/src/services/itineraries.ts   # not marked [P] only because
                                                              # it's the sole task in its file;
                                                              # still parallel-safe with T002
```

## Implementation Strategy

**MVP = User Story 1 only** (T001–T008): closes the highest-severity gap
(sellers cannot see they are paid at all) and is independently shippable.
User Story 2 (the workspace "Listed" mark) is a lower-priority sibling
convenience that can follow in the same PR (both are small) or a later one
without blocking US1.
