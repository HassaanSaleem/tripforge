# Tasks: Licensed-Copy & Resale Provenance Badges

**Input**: Design documents from `/specs/024-licensed-copy-badges/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the spec's own acceptance criteria require an e2e assertion, and the
project's quality bar (`.kitchenloop/unbeatable-tests.md`) requires L1/L2 coverage for any
read-projection change.

**Organization**: Tasks are grouped by user story (US1 = reseller recognizes own copies, P1; US2 =
buyer sees resale depth, P2). Both stories are fully independent — different service files
(`itineraries.ts` vs `listings.ts`), different display-helper files, different UI components — and
can be implemented/tested in either order or in parallel.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No new dependencies, packages, or tooling — this feature extends four existing files
(`itineraries.ts`, `listings.ts`, `itinerary-list.ts`, `marketplace-flow.ts`) and three existing
components. Nothing to initialize.

## Phase 2: Foundational

No blocking prerequisites — `parseItinerary`, the `Provenance` schema, the batched-lookup pattern
(`vettedAgencyIds`), and all three consuming UI components already exist and already work. US1 and
US2 can start immediately and in parallel.

---

## Phase 3: User Story 1 - Reseller recognizes own licensed copies (Priority: P1) 🎯 MVP

**Goal**: The sell-form picker and workspace trip list mark a licensed white-label copy with a
badge naming the original author's agency.

**Independent Test**: License a listing, then open the picker and the workspace trip list — the
copy is marked and attributed; a self-authored original is not.

### Tests for User Story 1

- [x] T001 [P] [US1] L1/L2 test: `listItineraries` projection in `packages/api/src/__tests__/l3-itinerary-list.test.ts` (or a new co-located `itineraries-projection.test.ts` if the L3 file is DB-only) — own original (lineage depth 0) → `licensedCopy: null`; a licensed copy (depth 1) → `{ originalAuthorAgencyName, generation: 1 }`; a re-licensed chain (depth 2) → `generation: 2` with the FIRST author's name, not the intermediate reseller's.
- [x] T002 [P] [US1] L1 test: `formatLicensedCopyBadge` in `apps/web/lib/__tests__/itinerary-list.test.ts` — pins the exact badge string for a `{ originalAuthorAgencyName, generation }` input, matching the `formatListedBadge` precedent in the same file.

### Implementation for User Story 1

- [x] T003 [US1] Add a batched agency-name lookup (mirroring `vettedAgencyIds` in `packages/marketplace/src/vetting.ts:23`) and extend `listItineraries`/`MyItinerary` in `packages/api/src/services/itineraries.ts`: select `document`, `parseItinerary` per row, derive `generation = provenance.rebrandLineage.length`, resolve `originalAuthorAgencyName` via the batched lookup when `generation >= 1`, else `licensedCopy: null`.
- [x] T004 [P] [US1] Add `formatLicensedCopyBadge({ originalAuthorAgencyName, generation })` to `apps/web/lib/itinerary-list.ts`, next to `formatListedBadge` — pure, DOM-free.
- [x] T005 [US1] Render the badge in the sell-form picker's `<option>` text in `apps/web/app/(workspace)/marketplace/listing-form.tsx` (append after `(currency)`, alongside the existing `" — already listed"` suffix precedent).
- [x] T006 [US1] Render the badge as a new `<span className="tf-badge tf-badge--licensed" data-testid="trip-licensed-copy">` beside the existing currency/listed badges in `apps/web/app/(workspace)/workspace/itinerary-list.tsx`, only when `trip.licensedCopy !== null`.
- [x] T007 [US1] Add `.tf-badge--licensed` styling to `apps/web/app/globals.css` (reuse the existing `.tf-badge` base; no new visual language beyond an accent color, matching `.tf-badge--verified`/`.tf-badge--listed` precedent).
- [x] T008 [US1] e2e: extend `tests/e2e/marketplace-journey.spec.ts` — after licensing a listing, assert the picker option text and the workspace trip-list row both carry the licensed-copy marker with the correct original-author name.

**Checkpoint**: US1 fully functional and testable independently — license → picker/workspace-list marker, verified end-to-end.

---

## Phase 4: User Story 2 - Buyer sees resale depth on the marketplace (Priority: P2)

**Goal**: Cross-tenant marketplace listing cards show a platform-authored resale/generation marker
for any listing whose underlying itinerary has lineage depth ≥ 1.

**Independent Test**: License + re-list a copy, then browse as a third agency — the re-listed card
shows "Resale · Gen 1"; a chain re-license shows "Gen 2"; an original shows nothing.

### Tests for User Story 2

- [x] T009 [P] [US2] L1/L2 test: `browseListings` projection in `packages/marketplace/src/__tests__/listings.test.ts` — a listing on a never-licensed itinerary → `resaleGeneration: null`; a listing on a licensed copy (depth 1) → `resaleGeneration: 1`; a listing on a re-licensed chain (depth 2) → `resaleGeneration: 2`.
- [x] T010 [P] [US2] L1 test: `formatResaleBadge` in `apps/web/lib/__tests__/marketplace-flow.test.ts` — pins the exact `"Resale · Gen N"` string, matching the `formatShareBps`/`formatRating` precedent in the same file.

### Implementation for User Story 2

- [x] T011 [US2] Extend `browseListings`/`BrowseListing` in `packages/marketplace/src/listings.ts`: join `itineraryTable` on `marketplaceListing.itineraryId`, select `document`, `parseItinerary`, derive `resaleGeneration = rebrandLineage.length || null`.
- [x] T012 [P] [US2] Add `formatResaleBadge(generation: number)` to `apps/web/lib/marketplace-flow.ts`, next to `formatShareBps` — pure, DOM-free.
- [x] T013 [US2] Render the badge as a new `<span className="tf-badge tf-market-resale" data-testid="listing-resale-badge">` inside the existing `.tf-market-meta` row in `apps/web/app/(workspace)/marketplace/listing-browse.tsx`, only when `listing.resaleGeneration !== null`.
- [x] T014 [US2] Add `.tf-market-resale` styling to `apps/web/app/globals.css` (reuse `.tf-badge` base, same accent family as T007 for visual consistency between the two provenance markers).
- [x] T015 [US2] e2e: extend `tests/e2e/marketplace-journey.spec.ts` (or add a sibling spec) — agency A lists an original, agency B licenses + re-lists the copy, agency C browses and sees B's card marked "Resale · Gen 1"; A's original card carries no marker.

**Checkpoint**: US1 AND US2 both work independently; both provenance markers are live end-to-end.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T016 [P] Run `specs/024-licensed-copy-badges/quickstart.md` Scenario 1 and Scenario 2 manually against the built compose stack as part of Live Test & Fix (INV-027), screenshotting each step.
- [ ] T017 Confirm no lineage-depth-0 itinerary shows either marker anywhere (FR-006) — spot-check in the same Live Test pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup / Foundational**: none — both empty, no blocking work.
- **User Story 1 (Phase 3)**: no dependencies — can start immediately.
- **User Story 2 (Phase 4)**: no dependencies on US1 — different files throughout (`listings.ts` vs
  `itineraries.ts`, `marketplace-flow.ts` vs `itinerary-list.ts`, `listing-browse.tsx` vs
  `listing-form.tsx`/`itinerary-list.tsx`). Can run in parallel with US1 or after it.
- **Polish (Phase 5)**: depends on both US1 and US2 being complete (Live Test drives both
  scenarios in one pass, per the loop's batching-of-overhead policy).

### Within Each User Story

- Tests (T001-T002, T009-T010) before implementation, and should fail first against the
  pre-change projection (`licensedCopy`/`resaleGeneration` fields don't exist yet).
- Service projection (T003, T011) before display helper (T004, T012) before UI render (T005-T006,
  T013) before e2e (T008, T015).
- CSS (T007, T014) can land alongside its story's UI task.

### Parallel Opportunities

- T001 and T002 in parallel (different files). T009 and T010 in parallel (different files).
- Once each story's projection task lands, its display-helper task is parallelizable with the
  other story's entire phase.
- US1 (Phase 3) and US2 (Phase 4) can be worked fully in parallel by two independent agents/passes
  — recommended here to be done sequentially in one pass (single implementer, single PR per this
  loop's batching policy for a feature-sized ticket), but the task graph itself has no cross-story
  edge.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001-T008 (US1) → STOP and validate independently (license → picker/workspace-list marker).
2. This alone resolves the ticket's highest-witnessed friction (the PR #31 false PRODUCT_FAIL
   class) and could ship standalone if time-boxed.

### Full Delivery (this cycle's plan)

1. US1 (T001-T008) → US2 (T009-T015) → Polish (T016-T017) → one PR covering both stories (per the
   ticket's own acceptance criteria, which spans both surfaces).
