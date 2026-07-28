# Tasks: Traveler acts on a marketplace itinerary

**Feature**: `specs/041-traveler-marketplace-act` | **Branch**: `kitchen/fix-goal-marketplace-fork-whitelabel-traveler-act`

**Design inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [data-model.md](./data-model.md) · [contracts/clientview-marketplace.md](./contracts/clientview-marketplace.md) · [research.md](./research.md)

Reuse-first: self-book (spec 036), request-agent (spec 022), share-link/My-Trips (010/031), and
white-label copy mechanics (spec 006) are REUSED. New code is browse projection + fork copy +
`marketplace_fork` bolt-on + fork-aware markup fallback + the `/view/marketplace` page.

## Phase 1: Setup

- [ ] T001 Confirm working state: on branch `kitchen/fix-goal-marketplace-fork-whitelabel-traveler-act`, base `origin/campaign/two-sided-surface`; re-read `packages/marketplace/src/white-label.ts`, `packages/marketplace/src/licensing.ts`, `packages/api/src/services/booking/self-book.ts`, `packages/api/src/services/client-view.ts`, `packages/api/src/routers/client-view.ts`, `apps/web/app/(client-view)/view/marketplace/page.tsx` before writing (Pre-Write reuse scan).

## Phase 2: Foundational (blocking — the fork provenance table)

- [ ] T002 Create the `marketplace_fork` bolt-on table in `packages/db/src/schema-marketplace-fork.ts` per data-model.md (columns: id, copy_itinerary_id UNIQUE FK→itinerary cascade, listing_id FK→marketplace_listing, source_itinerary_id itineraryFk, seller_agency_id agencyRef, traveler_user_id FK→user cascade, created_at; indexes unique(copy_itinerary_id), index(traveler_user_id), index(source_itinerary_id)). Header comment: bolt-on, additive, NOT a canonical schema change; no money columns.
- [ ] T003 Wire the table into `packages/db/src/schema.ts` (add to the re-export list, the import list, AND the `schema` object) and export `marketplaceFork` from `packages/db/src/index.ts`.

## Phase 3: User Story 1 — Browse the marketplace as a traveler (P1)

**Goal**: `/view/marketplace` lists active listings with client-safe fields only (INV-020).
**Independent test**: traveler opens `/view/marketplace`, sees real cards, payload has no net/markup/license-price/revenue-share.

- [ ] T004 [P] [US1] Add pure traveler-safe browse projection `browseMarketplaceForTraveler` in `packages/marketplace/src/traveler-browse.ts`: cross-tenant read of `status='active'` listings joined to itinerary + organization (+ agency_vetting for the badge), returning `TravelerMarketplaceCard[]` (listingId, title, agencyName, sellerVetted, currency, fromTotalMinor). Compute `fromTotalMinor` by folding sell prices the SAME way `toClientItineraryView` does (reuse it / a shared helper) — allowlist projection, no seller economics. Export from `packages/marketplace/src/index.ts`.
- [ ] T005 [US1] Add `browseMarketplaceForTraveler` orchestrator in `packages/api/src/services/marketplace-traveler.ts` (loads the listing/itinerary/org rows, applies the projection; single source of truth for the traveler total via `toClientItineraryView`). Export types via `packages/api/src/index.ts` if inference-load-bearing.
- [ ] T006 [US1] Add `clientView.marketplace.browse` (publicProcedure query) to `packages/api/src/routers/client-view.ts`, mounting a new `marketplace` sub-router (mirror `groups`). No input; returns the cards.
- [ ] T007 [US1] Replace the `/view/marketplace` stub: `apps/web/app/(client-view)/view/marketplace/page.tsx` server-renders the browse via the in-process caller; new client grid `apps/web/app/(client-view)/view/marketplace/marketplace-browse.tsx` renders cards (title, agency, verified badge, "from" price) reusing the client-surface shell + existing card styling. Keep the existing nav label (no new nav-label substring collision).

## Phase 4: User Story 2 — Fork a listing into my own trip (P1)

**Goal**: forking an active listing creates a seller-owned copy + share link + My-Trips link + provenance row, landing the traveler on `/view/[token]`.
**Independent test**: fork a listing → new copy in My Trips, opens on trip view, original listing unchanged and still forkable.

- [ ] T008 [P] [US2] Add the pure copy transform `travelerForkCopy(source, { copyId })` in `packages/marketplace/src/traveler-fork.ts` = `{ ...source, id: copyId }` (agencyId unchanged = seller; provenance untouched — no license/rebrand stamp). Export from `packages/marketplace/src/index.ts`. Header comment contrasts it with `whiteLabelCopy` (no reseller re-home, no revenue-share stamp).
- [ ] T009 [US2] Add `forkListingForTraveler(container, session, listingId)` orchestrator in `packages/api/src/services/marketplace-traveler.ts` — ONE transaction: select listing FOR consistency (active? else `not_available`); load source itinerary (missing → `not_available`); insert copy itinerary (agency=seller, document=`parseItinerary(travelerForkCopy(...))`, creationSource inherited, tripRequest inherited); insert `itinerary_share_link` (seller, copy) → token; insert `client_trip_link` (traveler, copy, source `"fork"`, onConflictDoNothing); insert `marketplace_fork` (copy, listing, source, seller, traveler). Return `{ status:"forked", token, path:"/view/"+token }`.
- [ ] T010 [US2] Add `clientView.marketplace.fork` (protectedProcedure mutation, input `{ listingId: z.uuid() }`) to `packages/api/src/routers/client-view.ts`; anonymous → UNAUTHORIZED (procedure-level). Returns the `ForkListingOutcome`.
- [ ] T011 [US2] Add the fork affordance to the browse card (`marketplace-browse.tsx`): a "Plan & book this trip" button calling `clientView.marketplace.fork` then `router.push(path)`; signed-out state shows a sign-in prompt (no fork fired).

## Phase 5: User Story 3 — Self-book my forked trip at the agency's price (P1, MONEY PATH)

**Goal**: self-booking a fork copy charges the SOURCE seller's markup; seller keeps markup; conservation on failure; no new take-rate.
**Independent test**: L3 — fork a quoted-at-M listing, self-book, assert sell = net×(1+M), markup_ledger under seller, forced-failure charges nothing.

- [ ] T012 [US3] Extend `deriveMarkupBps` in `packages/api/src/services/booking/self-book.ts`: before reading `booking_quote`, look up `marketplace_fork` by `copy_itinerary_id = itineraryId`; if found, derive markup from the fork's `source_itinerary_id`'s most-recent quote (else DEFAULT_MARKUP_BPS). Single extra indexed query, no recursion; unchanged for non-fork itineraries. Update the doc comment to explain the fork basis (bound b, FR-010/011).
- [ ] T013 [US3] Write L3 test `packages/api/src/__tests__/l3-traveler-marketplace-fork.test.ts` on real Postgres asserting: seller-markup pricing (M≠default) with markup_ledger under the seller; default-never-zero for an unquoted source; conservation on forced component failure (nothing charged, no orphan rows, holds released); seller-agency attribution on every money row; two independent forks of one listing; refusal (`not_available`) writes zero rows. Follow the existing `l3-traveler-self-book.test.ts` harness.

## Phase 6: User Story 4 — Request an agent for my forked trip (P2)

**Goal**: request-agent from a fork routes to the seller (reused handoff).
**Independent test**: fork, submit handoff, seller's `/trip-requests` shows it.

- [ ] T014 [US4] Verify (and add an L2/L3 assertion if not already covered) that `submitTripHandoffRequest` on a fork copy's token records the handoff against the SELLER agency (the copy's owning agency) — reuse `clientView.requestHandoff` unchanged; the fork's `/view/[token]` already surfaces the request-agent form via `TripFork`. No new procedure.

## Phase 7: Polish & Cross-Cutting

- [ ] T015 [P] Add e2e journey `tests/e2e/traveler-marketplace-journey.spec.ts`: traveler signs in → `/view/marketplace` shows a listing → fork → lands on `/view/[token]` → appears in My Trips → self-book review renders; assert NO net/markup/license strings in the marketplace page HTML (INV-020 negative). Reuse `tests/e2e/support.ts` helpers; pick a disjoint nav/test label.
- [ ] T016 [P] Add an L1/L2 unit test for `travelerForkCopy` (agencyId preserved, id replaced, provenance untouched) and `browseMarketplaceForTraveler` projection (key set = client-safe fields only) in `packages/marketplace/src/__tests__/`.
- [ ] T017 Run `pnpm run lint` + `pnpm test` (in the built image), fix knip/TS4023 export-surface issues, ensure depcruise boundary conformance (pure transforms in `packages/marketplace`, orchestration in `packages/api/services`, no supplier shapes crossing).
- [ ] T018 Live Test & Fix (INV-027): `docker compose down -v && docker compose up --build --wait`; run `db:push` via the migrate service; drive the quickstart browser journey via Playwright MCP with per-step screenshots into `.kitchenloop/evidence/11/goal-marketplace-fork-whitelabel/`; scan compose logs for non-allowlisted ERROR; fix→rebuild→re-test (max 3 cycles).

## Dependencies & Order

- **Setup (T001)** → **Foundational (T002–T003)** blocks everything (the table must exist).
- **US1 (T004–T007)**, **US2 (T008–T011)** depend only on Foundational. US1 and US2 are largely parallel but US2's UI (T011) lives in US1's `marketplace-browse.tsx`, so do T007 before T011.
- **US3 (T012–T013)** depends on US2 (needs `marketplace_fork` + fork to exist to price/test).
- **US4 (T014)** depends on US2 (needs a fork token).
- **Polish (T015–T018)** after the stories.

## Parallel Opportunities

- T004 (browse projection) ∥ T008 (fork copy transform) — different files, both after T003.
- T015 (e2e) ∥ T016 (unit tests) in Polish.

## Implementation Strategy

**MVP = US1 + US2 + US3** (browse → fork → self-book at seller price with L3 money proof). US4 is
a thin reuse. The money path (US3/T012–T013) is the load-bearing gate: L3 conservation + seller
attribution must pass before the PR is done.
