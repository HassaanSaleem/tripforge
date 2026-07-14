---

description: "Task list for demo-11-group-travel (021-group-travel)"
---

# Tasks: Group travel — agent-posted departures with seats, joins, and white-label resale

**Input**: Design documents from `/specs/021-group-travel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/group-travel.md, quickstart.md

**Tests**: INCLUDED. The Quality Bar/Constitution mandate L3 integration tests with
state-conservation assertions for money+inventory paths (spec SC-002/SC-005) — this is not
optional for this feature.

**Organization**: Tasks are grouped by user story (spec.md priorities P1-P4) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Path Conventions

Monorepo (pnpm + turborepo): `packages/db`, `packages/marketplace`, `packages/api`,
`apps/web` — per plan.md's Project Structure section.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nothing new to initialize — this feature extends existing packages/apps with
their established tooling (tsconfig, vitest, eslint already configured repo-wide).

- [X] T001 Confirm `pnpm test`/`pnpm run lint` run clean on `origin/main` baseline before
  starting (sanity check, no new tooling needed)

**Checkpoint**: No blocking setup — proceed directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + PMF vocabulary that every user story's flows write to. MUST complete
before any user story implementation.

- [X] T002 Create `packages/db/src/schema-group-travel.ts` with the `group_departure` table
  (id, agency_id via `agencyFk()`, itinerary_id via `itineraryFk()`, departure_date, capacity,
  seats_remaining, price_per_seat_minor via `moneyMinor()`, currency, status, created_at,
  cancelled_at) and indexes (`agency_id`, `itinerary_id`, `status`) per data-model.md
- [X] T003 Add the `group_departure_seat` table to the same file (id, group_departure_id FK
  no-cascade, joined_by_agency_id via `agencyRef()`, traveler_name, traveler_email,
  seat_price_minor via `moneyMinor()`, currency, joined_at) and indexes
  (`group_departure_id`, `joined_by_agency_id`) per data-model.md
- [X] T004 Assemble `schema-group-travel.ts` into `packages/db/src/schema.ts` (import +
  re-export, matching the `schema-marketplace.ts` assembly pattern) and export the new tables
  from `packages/db/src/index.ts`
- [X] T005 [P] Extend the closed PMF event vocabulary in `packages/db/src/pmf-events.ts`:
  add `group_departure_posted` (agencyId, itineraryId, actorUserId — no-money, mirrors
  `listing_created`) and `group_departure_seat_joined` (agencyId = departure owner,
  itineraryId, amountMinor = seat price, currency, actorUserId — mirrors `booking_confirmed`'s
  money shape) to the `PmfEvent` union, `PMF_EVENT_TYPES` array, and the validation switch
- [X] T006 [P] Extend `packages/db/src/__tests__/pmf-events.test.ts` with validation cases for
  both new event types (valid event accepted; missing required field rejected with the correct
  `PmfEventValidationReason`)
- [X] T007 Run `drizzle-kit push` (or the repo's existing migration-apply command) against the
  local/compose Postgres to materialize the two new tables — confirm via `\d group_departure`
  and `\d group_departure_seat` in psql

**Checkpoint**: Schema + PMF vocabulary ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Agent posts a group departure (Priority: P1) 🎯 MVP

**Goal**: An agency posts a group departure from an itinerary it owns, with capacity and
per-seat price; it starts `active` with `seatsRemaining = capacity`.

**Independent Test**: Post a departure from an owned itinerary → verify `seatsRemaining ==
capacity`, `status == active`; posting from another agency's itinerary is refused.

### Tests for User Story 1

- [X] T008 [P] [US1] Unit tests for `postGroupDeparture`/`cancelGroupDeparture` refusal paths
  (not-owner, invalid capacity/price, cancel-not-mine, cancel-already-cancelled) in
  `packages/marketplace/src/__tests__/group-departures.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Create `packages/marketplace/src/group-departures.ts`: `postGroupDeparture`
  (zod input schema per contracts/group-travel.md §1; validates itinerary ownership + capacity
  > 0 + price >= 0; inserts with `seatsRemaining = capacity`, `status = 'active'`; emits
  `group_departure_posted` PMF event in the same transaction) and `cancelGroupDeparture`
  (contracts §2; tenant-scoped to posting agency; flips `status = 'cancelled'`,
  `cancelledAt = now`)
- [X] T010 [US1] Export `postGroupDeparture`/`cancelGroupDeparture` (+ their input schemas)
  from `packages/marketplace/src/index.ts`
- [X] T011 [US1] Create `packages/api/src/routers/group-travel.ts` with `post` and `cancel`
  `agentProcedure` mutations, thin-adapter pattern matching
  `packages/api/src/routers/marketplace.ts` (zod parse, session → actor, `NOT_FOUND` thrown
  only for absent/not-owned; business refusals stay typed values)
- [X] T012 [US1] Register `groupTravel: groupTravelRouter` in
  `packages/api/src/routers/workspace.ts`

**Checkpoint**: An agent can post and cancel a group departure end-to-end via the tRPC
surface. Independently testable/demoable now (MVP).

---

## Phase 4: User Story 2 - Seat joined with capacity conserved under concurrency (Priority: P2)

**Goal**: An agent joins a seat on behalf of a named client; capacity is conserved even under
concurrent last-seat races (this is the feature's MONEY-PATH GATE — mandatory L3 coverage).

**Independent Test**: Two concurrent joins against a capacity-1 departure → exactly one
`joined`, one `sold_out`; `seatsRemaining` never negative; zero seat rows on refusal.

### Tests for User Story 2

- [X] T013 [P] [US2] Unit tests for `joinGroupDeparture` refusal paths (sold-out, inactive
  departure, not-found) in `packages/marketplace/src/__tests__/group-departures.test.ts`
  (extends T008's file)
- [X] T014 [US2] L3 integration test in `packages/api/src/__tests__/l3-group-travel.test.ts`
  (env-gated on `DATABASE_URL`, real Postgres, mirrors `l3-marketplace.test.ts`'s harness):
  post → join (happy path, exact state delta) → **concurrent last-seat race** (capacity-1
  departure, two simultaneous `join` calls via `Promise.all`, assert exactly one `joined` +
  one `sold_out`, `seatsRemaining === 0`, exactly one `group_departure_seat` row exists) →
  sold-out/inactive refusal paths leave zero new rows (state conservation, SC-002/SC-003)

### Implementation for User Story 2

- [X] T015 [US2] Add `joinGroupDeparture` to `packages/marketplace/src/group-departures.ts`
  (contracts §4): the atomic conditional `UPDATE group_departure SET seats_remaining =
  seats_remaining - 1 WHERE id = $1 AND status = 'active' AND seats_remaining > 0 RETURNING
  seats_remaining, price_per_seat_minor, currency` inside a `db.transaction`; zero rows
  returned → disambiguate `not_active`/`sold_out` with a follow-up read (capacity decision
  itself never depends on it); one row returned → insert `group_departure_seat` using the
  RETURNED price/currency snapshot, then `recordPmfEvent(tx, { type:
  "group_departure_seat_joined", ... })`
- [X] T016 [US2] Export `joinGroupDeparture` (+ input schema) from
  `packages/marketplace/src/index.ts`
- [X] T017 [US2] Add `join` `agentProcedure` mutation to
  `packages/api/src/routers/group-travel.ts` (contracts §4)

**Checkpoint**: Post + join work end-to-end with proven capacity conservation under
concurrency. This is the highest-risk slice — validate T014 thoroughly before proceeding.

---

## Phase 5: User Story 3 - Agencies browse active group departures (Priority: P3)

**Goal**: A "Group Trips" workspace surface shows active departures (date, price,
seats-remaining, verified-seller badge) so agents can find departures to join clients into.

**Independent Test**: Post one active + one cancelled departure → browse shows only the
active one with current `seatsRemaining`.

### Tests for User Story 3

- [X] T018 [P] [US3] Unit test for `browseGroupDepartures` (active-only filter, `mine`
  projection, `sellerVetted` projection) in
  `packages/marketplace/src/__tests__/group-departures.test.ts` (extends T008/T013's file)

### Implementation for User Story 3

- [X] T019 [US3] Add `browseGroupDepartures` to
  `packages/marketplace/src/group-departures.ts` (contracts §3): joins `group_departure` →
  `itinerary` (title) → `organization` (posting agency name), reuses `vettedAgencyIds` from
  `packages/marketplace/src/vetting.ts` for the verified badge, filters `status = 'active'`,
  projects `mine` from `actor.agencyId`
- [X] T020 [US3] Export `browseGroupDepartures` from `packages/marketplace/src/index.ts`
- [X] T021 [US3] Add `browse` `agentProcedure` query to
  `packages/api/src/routers/group-travel.ts` (contracts §3)
- [X] T022 [P] [US3] Create `apps/web/app/(workspace)/group-travel/group-trip-card.tsx`: an
  image-forward card component (departure date, "X of N seats left", per-seat price via the
  existing `formatMinorAmount` helper, `tf-badge tf-badge--verified` Verified badge when
  `sellerVetted`) extending the `tf-market-card`/`tf-badge`/`tf-btn--cta` class vocabulary from
  `apps/web/app/(workspace)/marketplace/listing-browse.tsx`
- [X] T023 [US3] Create `apps/web/app/(workspace)/group-travel/group-travel-panel.tsx`
  (client component): loads `trpc.workspace.groupTravel.browse.query()` on mount, renders a
  `GroupTripCard` grid, includes the post form (US1) and join action (US2) — mirrors
  `apps/web/app/(workspace)/marketplace/marketplace-panel.tsx`'s state-machine structure
- [X] T024 [US3] Create `apps/web/app/(workspace)/group-travel/page.tsx` route entry
  (mirrors `apps/web/app/(workspace)/marketplace/page.tsx`)
- [X] T025 [US3] Add a "Group Trips" nav destination to the workspace sidebar (locate the
  spec-017 dashboard-app-shell nav config during implementation — likely
  `apps/web/app/(workspace)/layout.tsx` or a sibling nav-items file — and add the new route)
- [X] T026 [P] [US3] Playwright e2e spec `apps/web/tests/e2e/group-travel.spec.ts` (or the
  repo's existing e2e directory): post a departure, browse shows it with correct
  seats-remaining, join decrements the displayed count

**Checkpoint**: Full agent-facing browse/post/join UI is live and demoable.

---

## Phase 6: User Story 4 - Group departure white-labeled by another agency (Priority: P4)

**Goal**: Licensing a group departure's itinerary via the EXISTING marketplace mechanism
additionally seeds an independent seat pool for the reseller.

**Independent Test**: License a listed group departure as a second agency → reseller's new
`group_departure` row has `seatsRemaining == capacity` equal to the original's capacity;
original's `seatsRemaining` is unaffected by the reseller's subsequent joins.

### Tests for User Story 4

- [X] T027 SKIPPED — no `licensing.test.ts` file exists in this codebase; per the established
  convention (listings.test.ts covers only pure input-schema bounds; every DB-transaction
  behavior of `licenseListing`/`createListing` is proven exclusively at L3), the additive
  group-departure-copy behavior is covered by T028's L3 assertions instead of a new unit-test
  file with a DB stub
- [X] T028 [US4] L3 integration test addition in
  `packages/api/src/__tests__/l3-group-travel.test.ts` (extends T014's file): list a group
  departure's itinerary → license it as agency B → assert B's `group_departure.capacity ==
  seatsRemaining == A's original capacity`; B's clients join seats → assert A's original
  `seatsRemaining` is UNCHANGED; existing revenue-share conservation identity
  (`price == platformTake + sellerCredit`) still holds unchanged (SC-004)

### Implementation for User Story 4

- [X] T029 [US4] Extend `licenseListing` in `packages/marketplace/src/licensing.ts`: after the
  white-label itinerary copy insert, look up an `active` `group_departure` row for
  `listing.itineraryId`; if found, insert a new `group_departure` row for `copyId`
  (`agencyId = actor.agencyId`, same `departureDate`/`pricePerSeatMinor`/`currency`,
  `capacity` = the original's `capacity`, `seatsRemaining = capacity`, `status = 'active'`) —
  additive, no-op when absent (contracts §5)

**Checkpoint**: All four user stories work end-to-end, independently and together.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 [P] Run `pnpm run lint` and fix any findings across all new/edited files
- [X] T031 [P] Run `pnpm test` (full root suite) — confirm zero regressions in existing
  marketplace/booking/PMF suites alongside the new tests
- [X] T032 Run quickstart.md end-to-end against the built compose stack (INV-027 Live Test —
  see kitchenloop-execute SKILL.md step 4e for the full protocol); capture screenshots to
  `.kitchenloop/evidence/<iteration>/demo-11-group-travel/`
- [ ] T033 Write the sealed UAT test card to `.kitchenloop/uat-cards/demo-11-group-travel.md`
  per the UAT Gate protocol

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (schema must exist
  before any service function can write to it).
- **User Story 1 (Phase 3)**: Depends on Foundational only. MVP — ships independently.
- **User Story 2 (Phase 4)**: Depends on Foundational + US1 (needs a postable/cancelable
  departure to join against — reuses T009's `group_departure` row shape, though its own
  service function `joinGroupDeparture` is a separate, additive export).
- **User Story 3 (Phase 5)**: Depends on Foundational + US1 (browse needs postable
  departures) + US2 (the panel's join action calls US2's procedure) for the FULL UI, but the
  `browseGroupDepartures` service function itself (T019-T021) only depends on US1.
- **User Story 4 (Phase 6)**: Depends on Foundational + US1 (needs a `group_departure` row to
  copy) + the EXISTING (unchanged) spec-006 marketplace listing/license flow.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Parallel Opportunities

- T005/T006 (PMF vocabulary + its tests) can run parallel to T002-T004 (schema) — different
  files, though both are Foundational and must complete before Phase 3.
- Within Phase 5, T022 (card component) is parallel to T019-T021 (service/router) — different
  files/layers.
- T027 (licensing unit test) and T028 (L3 test) in Phase 6 can be written in parallel; T029
  (the actual `licenseListing` edit) depends on neither test being GREEN first (tests-first
  convention: write failing tests, then implement).
- T030/T031 (lint/test) in Polish can run in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) + Phase 2 (Foundational — schema + PMF vocabulary).
2. Complete Phase 3 (US1 — post/cancel).
3. **STOP and VALIDATE**: post a departure via the tRPC surface, confirm `seatsRemaining ==
   capacity` in Postgres.

### Incremental Delivery (recommended given the MONEY-PATH GATE)

1. Foundational → Phase 3 (US1, post/cancel) → validate.
2. Phase 4 (US2, join + capacity conservation) → validate T014's concurrent-race assertion
   FIRST, before touching UI — this is the ticket's MANDATORY money-path proof.
3. Phase 5 (US3, browse UI) → validate visually.
4. Phase 6 (US4, white-label) → validate the independent-seat-pool assertion.
5. Phase 7 (Polish, Live Test, UAT card).

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T014 (the concurrent last-seat race L3 test) is the single most important test in this
  feature — it is the mechanical proof of SC-002, the ticket's MONEY-PATH GATE requirement.
  Do not mark User Story 2 complete without it passing against real Postgres.
- Commit after each task or logical group (matches the Kitchen Loop's per-ticket-in-bundle
  convention, though this is a single feature-sized ticket on its own branch).
