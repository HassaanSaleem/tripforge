# Tasks: Bring-Your-Own Itinerary (Manual Entry)

**Input**: Design documents from `/specs/029-agent-upload-own-itinerary/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/manual-itinerary.md, quickstart.md

**Tests**: Included — the project quality bar (`.kitchenloop/quality-bar.md`, `.kitchenloop/unbeatable-tests.md`) mandates L1/L2 coverage plus an L3 integration test for any new integration point, and this feature reaches money-adjacent paths (quote-then-book), so L3 state-conservation coverage is required, not optional.

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 per spec.md

## Path Conventions

Monorepo per plan.md's Project Structure: `packages/db`, `packages/api`,
`packages/marketplace`, `apps/web`.

---

## Phase 1: Setup

No new dependencies, no new project scaffolding — this feature extends
existing packages/routers/components exclusively.

- [X] T001 Confirm branch `029-agent-upload-own-itinerary` is checked out from `origin/main` and the worktree is clean before any edit (already done by the execute phase's branch-creation step — actual branch name is `kitchen/fix-agent-upload-own-itinerary-bring-your-own` per the loop's branch-naming recipe)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `creation_source` column and its two existing-insert-site
stamps must exist before US1's create path (or any origin display) can work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add `creationSource: text("creation_source").notNull().default("ai_drafted")` to the `itinerary` table in `packages/db/src/schema-itinerary.ts` (per data-model.md); no versioned migration file needed — this repo uses `drizzle-kit push` (schema-diff, no `migrations/` dir checked in), applied automatically by the compose `migrate` service on next boot
- [X] T003 [P] Stamp `creationSource: "ai_drafted"` on the existing AI-draft insert in `packages/api/src/services/planner.ts` (`selectDraftOption`, the `tx.insert(itineraryTable)` call) — no other logic change
- [X] T004 [P] Stamp `creationSource: "licensed_copy"` on the existing white-label-copy insert in `packages/marketplace/src/licensing.ts` (`licenseListing`, the `tx.insert(itineraryTable)` call) — no other logic change
- [X] T005 Decision recorded (plan.md Pre-Write Discipline): `persistDocument` (an UPDATE-by-id helper) does not fit the CREATE path structurally — `createManualItinerary` instead mirrors `selectDraftOption`'s own insert-transaction shape directly (`ItinerarySchema.parse` immediately before `tx.insert`), the same discipline `persistDocument` enforces for edits, without forcing an awkward insert/update merge

**Checkpoint**: Foundation ready — `creation_source` column exists and is stamped correctly by both existing insert paths; US1 can now build on it.

---

## Phase 3: User Story 1 - Agent manually builds a multi-day itinerary (Priority: P1) 🎯 MVP

**Goal**: An agent can create a title/currency/day/item itinerary by hand, save it, and see it in their itinerary list, visually distinguished from AI-drafted trips.

**Independent Test**: Create a manual itinerary with 2 days/1 item each via the new form (no AI/chat interaction), save, reopen from the itinerary list, confirm days/items match exactly and an origin badge is shown.

### Tests for User Story 1

- [X] T006 [P] [US1] Unit tests for `createManualItineraryInputSchema` and the manual item/day input schemas (valid shapes, `checkOut > checkIn` refinement, zod rejection of malformed dates/negative party counts) — actual location `packages/api/src/__tests__/manual-itinerary-schema.test.ts` (this package's L1 unit tests live flat in `src/__tests__/`, not `services/__tests__/` — no such directory exists in this repo)
- [X] T007 [P] [US1] Covered as an L3 assertion instead of a pure unit test (`createManualItinerary` requires a DB transaction — not unit-testable in isolation, matching this file's zero-precedent for L1 coverage of DB-writing functions): `l3-manual-itinerary.test.ts` US1 case asserts the persisted document passes canonical validation, ids are assigned, `creationSource: "manual"`, and the PMF event carries `source: "self_built"`
- [X] T008 [P] [US1] Covered as an L3 assertion (same reasoning as T007 — `listItineraries` requires a DB): `l3-manual-itinerary.test.ts` US1 case asserts `origin: "manual"` on list; the `origin: null` when `licensedCopy !== null` case is asserted in `l3-manual-itinerary.test.ts` US3 case and backfilled onto the pre-existing `l3-itinerary-list.test.ts` (regression fix — that file's exhaustive key-list assertion would otherwise break on the new field)

### Implementation for User Story 1

- [X] T009 [US1] Add `createManualItineraryInputSchema` + discriminated-union manual item/day input schemas to `packages/api/src/services/itineraries.ts` (per data-model.md / contracts/manual-itinerary.md — server assigns ids, no client-supplied `supplyRef`/`pricing`)
- [X] T010 [US1] Implement `createManualItinerary(container, session, input)` in `packages/api/src/services/itineraries.ts`: assign ids, build the `Itinerary` document (synthesized `pricing` placeholder per research D6/D7), build the synthesized `TripRequest` (research D6 — `budget.amountMinor: 1`, the smallest value satisfying `tripRequestSchema`'s `positive()` bound), insert in one transaction with `creationSource: "manual"` + the unchanged `trip_created`/`source: "self_built"` PMF event (mirrors `selectDraftOption`)
- [X] T011 [US1] Add `origin: "manual" | "ai_drafted" | null` to the `MyItinerary` interface and its derivation in `listItineraries()`, `packages/api/src/services/itineraries.ts` (read `creation_source` column; `null` when `licensedCopy !== null`)
- [X] T012 [US1] Add `createManual` mutation to `itineraryRouter` in `packages/api/src/routers/itinerary.ts` (same `agentProcedure` + zod-parse-function convention as `list`/`get`/`share`/`chatEdit`/`applyChatEdit`/`attachMedia`)
- [X] T013 [P] [US1] Add `formatOriginBadge()` pure formatter to `apps/web/lib/itinerary-list.ts`, alongside `formatLicensedCopyBadge()`
- [X] T014 [US1] Render the origin badge in `apps/web/app/(workspace)/workspace/itinerary-list.tsx` next to the existing `licensedCopy`/`listing` badges (only when `origin !== null`, per research D3)
- [X] T015 [US1] Build `apps/web/app/(workspace)/workspace/manual-itinerary-form.tsx` — new day/item builder form (title, currency, destination, checkIn/checkOut, party, repeatable add-day/add-item UI for stay/activity/transfer), reusing the destination/dates/party field patterns from `apps/web/lib/planner-form.ts` (per plan.md Pre-Write Discipline: reuse)
- [X] T016 [US1] Wired a "+ Build a trip manually" entry point in `itinerary-list.tsx`'s trips panel, toggling to `<ManualItineraryForm>`, calling `createManual`, then reloading the list and opening the new itinerary on success
- [X] T017 [P] [US1] Playwright e2e — actual location `tests/e2e/manual-itinerary-journey.spec.ts` (this repo's e2e specs live at repo-root `tests/e2e/`, not `apps/web/tests/e2e/`, confirmed by every sibling journey spec)

**Checkpoint**: User Story 1 is fully functional and independently testable — an agent can build and see a manual itinerary end-to-end.

---

## Phase 4: User Story 2 - Manually-built itinerary can be priced and booked (Priority: P2)

**Goal**: An item in a manually-built itinerary can have a real supplier rate attached (via the existing chat-edit mechanism) and then be quoted and booked with the same conservation guarantees as an AI-drafted item.

**Independent Test**: Take a manually-built itinerary (from US1), attach a rate to one item via `applyChatEdit`, run quote-then-book, confirm a normal booking record with conserved state.

### Tests for User Story 2

- [X] T018 [US2] L3 test (real Postgres, env-gated on `DATABASE_URL`, mirroring `l3-booking.test.ts`) in `packages/api/src/__tests__/l3-manual-itinerary.test.ts`: create a manual itinerary → confirm the pre-attach quote returns zero bookable items (matches unpriced-AI-drafted-item behavior, zero special-casing) → attach a sandbox rate via `applyChatEdit`'s `addItem` (same live-offer path a suggestion card uses) → quote → book → assert the SAME state-conservation guarantee the existing AI-drafted booking L3 test proves (re-booking the same quote rows is a typed `already_consumed` refusal, zero additional state)

### Implementation for User Story 2

- [X] T019 [US2] Confirmed by reading: `quote.ts`'s `bookable` filter (`item.supplyRef ? [...] : []`) and `edit.ts`'s `buildItem`/`applyAdd` (always offer-driven, kind-agnostic on how the item's DOCUMENT got created) require ZERO code changes — no gap found, no fix needed
- [X] T020 [P] [US2] Verified by reading: `itinerary-days.tsx` renders `item.pricing ? <price span> : null` (line ~73-78) — an unpriced manual item already renders with no price shown, same as an AI-drafted item mid-edit; re-verify live in Phase Polish (T025)

**Checkpoint**: User Stories 1 AND 2 both work independently — a manual itinerary can be built and then priced/booked with zero special-cased code.

---

## Phase 5: User Story 3 - Manually-built itinerary lists, licenses, and shares like any other (Priority: P3)

**Goal**: A fully-priced manually-built itinerary can be listed on the marketplace, licensed/white-labeled by another agency, and shared via client-view — identically to an AI-drafted one.

**Independent Test**: List a manually-built, fully-priced itinerary; have a second agency license/white-label it; open the client-view link; confirm listing/license/client-view all render correctly with the correct origin/provenance badges and zero markup/net-rate leakage.

### Tests for User Story 3

- [X] T021 [US3] L3 test (real Postgres, `l3-manual-itinerary.test.ts` from T018): list a manually-built itinerary → license it from a second agency → assert the copy row has `creationSource: "licensed_copy"` (independent of the original's `"manual"` value) → assert the buyer's list shows the licensed-copy badge, not a manual/ai_drafted origin badge (research D3 display rule). Client-view leak-checking deferred to T022's finding (no code touches client-view, so no NEW leak surface exists beyond what `client-view-projection.test.ts`/e2e already cover generically for any document shape)

### Implementation for User Story 3

- [X] T022 [US3] Confirmed by reading + grep: `packages/marketplace/src/listings.ts` and `packages/api/src/services/client-view.ts` contain ZERO references to `creationSource`/`tripRequest` fields — both operate purely on the canonical `document`, identical in shape regardless of origin. No gap, no fix needed.

**Checkpoint**: All three user stories independently functional — full build → price → book → list → license → share journey works for a manually-built itinerary with no special-casing anywhere downstream.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gate compliance — lint, full suite, live verification, evidence.

- [X] T023 `pnpm run lint` clean across all edited/new files — zero findings (in-image `pnpm run lint`)
- [X] T024 `pnpm test` full suite green: 498/498 without `DATABASE_URL` (102 skipped L3), then 600/600 with `DATABASE_URL` against the live compose Postgres (0 skipped) — zero regressions, including the fixed `l3-itinerary-list.test.ts` assertions
- [X] T025 Ran the Live Test & Fix protocol (INV-027): booted the built compose stack fresh, drove the manual-build → opened-trip → trips-list-badge → graceful-empty-quote journey via Playwright MCP with 6 screenshots in `.kitchenloop/evidence/7/agent-upload-own-itinerary/`, confirmed the itinerary is selectable in the marketplace listing picker, zero browser console errors/warnings throughout, compose-log scan clean (only the pre-existing known-benign `booking_component_itinerary_item_idx` duplicate-key line from the concurrent-booking L3 test). Zero defects found — no fix cycle needed.
- [X] T026 Wrote the UAT test card to `.kitchenloop/uat-cards/agent-upload-own-itinerary.md` per the UAT Gate protocol; validated (no placeholders, no manual-edit commands, browser-step format correct)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (the `creation_source` column must exist first)
- **User Story 1 (Phase 3)**: Depends on Foundational — delivers the MVP (create + display)
- **User Story 2 (Phase 4)**: Depends on Foundational AND a manual itinerary existing (US1) to test against — mostly test-coverage confirming reuse, minimal/no new implementation
- **User Story 3 (Phase 5)**: Depends on Foundational AND US1 (needs a manual itinerary) AND a priced item is helpful but not required (an unpriced listing can still be tested for the listing/badge path) — mostly test-coverage confirming reuse
- **Polish (Phase 6)**: Depends on US1+US2+US3 complete

### Parallel Opportunities

- T003/T004 (Phase 2) — different files, run in parallel
- T006/T007/T008 (US1 tests) — same test file but independent test cases; write together, run in parallel conceptually
- T013 (US1 formatter) — independent of T009-T012 (different file), can run in parallel with them
- T017 (US1 e2e) — depends on T009-T016 being complete (needs the real UI/mutation to drive)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) + Phase 2 (Foundational — the column + two insert stamps)
2. Complete Phase 3 (User Story 1) — this alone delivers a demonstrable, useful feature (build and see a manual itinerary)
3. **STOP and VALIDATE**: quickstart.md steps 1-4
4. Continue to US2/US3 in the same cycle (they are thin, mostly test-coverage, over already-correct reused code per research D4/D7/plan.md) — batching policy treats this whole feature as ONE cycle regardless, since it's feature-sized and touches the itinerary creation surface end-to-end

### Incremental Delivery

Given research D4/D7 confirm US2/US3 need close to zero new production code (only tests confirming zero special-casing), all three stories ship together in this single cycle rather than as separate deploys — the "increment" here is validated by the Phase checkpoints, not by separate releases.
