# Tasks: Workspace Itinerary List

**Input**: Design documents from `specs/012-workspace-itinerary-list/`
**Prerequisites**: plan.md, research.md (D1–D10), data-model.md,
contracts/workspace-list-ui.md, quickstart.md

**Tests**: REQUIRED — contract §6 fixes the L1/L3/L4 obligations; the repo
quality bar makes live verification (INV-027) part of every product-behavior
cycle. No existing assertion may be weakened.

**Organization**: grouped by user story (spec.md US1 list / US2 continue /
US3 freshness) so each story lands as an independently testable increment.

## Phase 1: Setup

- [X] T001 [P] Add `GetItineraryOutput` router-inference type export to
      `apps/web/lib/trpc/client.ts` (research D4; premature-export rule —
      inference only, no server type exports).

## Phase 2: Foundational (blocking all stories)

- [X] T002 Extract the day-by-day rendering from `DraftResult` in
      `apps/web/app/(workspace)/workspace/planner.tsx` into a new shared
      presentational component
      `apps/web/app/(workspace)/workspace/itinerary-days.tsx` (research D5).
      `DraftResult` consumes it with zero visual change; the budget-fit
      table stays in `DraftResult`. Existing e2e/planner assertions must
      stay green unmodified.
- [X] T003 [P] Create pure display helpers in `apps/web/lib/itinerary-list.ts`:
      `formatCreatedDate(iso)` (en-GB + UTC `Intl.DateTimeFormat`, research
      D6) and `listErrorMessage(error)` / `openErrorMessage(error)` wrapping
      the existing `transportErrorMessage` (research D7). No money logic.
- [X] T004 [P] L1 tests in `apps/web/lib/__tests__/itinerary-list.test.ts`:
      `formatCreatedDate` determinism (known ISO → `9 Jul 2026`-style,
      timezone-independent) and failure-wording mapping (contract §6).
- [X] T005 [P] Add the trips-list kit classes to `apps/web/app/globals.css`:
      `.tf-triplist`, `.tf-trip-row` (+ row internals), reusing existing kit
      atoms for badge/empty/buttons (research D9; seed-0009s premium bar).

## Phase 3: User Story 1 — See my agency's trips (P1) 🎯 MVP

**Goal**: `/workspace` lists the agency's itineraries newest-first (title,
currency badge, created date) with a premium empty state and typed failure
state.

**Independent test**: sign in with existing trips → rows render newest-first;
fresh agency → empty state; server failure → in-panel message (spec US1
scenarios 1–4).

- [X] T006 [US1] Create the list panel client component
      `apps/web/app/(workspace)/workspace/itinerary-list.tsx`:
      `ItineraryList({ refreshToken })` — loads
      `trpc.workspace.itinerary.list` on mount and on `refreshToken` change
      (contract §1/§2); states loading / loaded rows (order preserved
      verbatim, no client sorting) / empty (planner + marketplace guidance)
      / failed (`listErrorMessage`, `role="alert"`); rows show title,
      currency badge, `formatCreatedDate` date, Open affordance
      (`.tf-triplist` kit). Zero money arithmetic (FR-009).
- [X] T007 [US1] Create
      `apps/web/app/(workspace)/workspace/workspace-panels.tsx`: client
      wrapper composing `<Planner />` + `<ItineraryList refreshToken={n} />`
      with `refreshToken` state (bump wiring lands in US3; initial value 0)
      (research D2).
- [X] T008 [US1] Modify `apps/web/app/(workspace)/workspace/page.tsx`:
      verified-agent branch renders `<WorkspacePanels />` instead of
      `<Planner />` (INV-024 gate composition unchanged).
- [X] T009 [US1] Create `tests/e2e/workspace-list-journey.spec.ts` (part 1,
      contract §6): fresh agency sees the empty state (planner AND
      marketplace named); after drafting and a PAGE RELOAD the trip row
      appears with title + currency + date (no-reload freshness is US3's
      spec, not this one).

**Checkpoint**: US1 alone is a viable increment (list + empty + failure).

## Phase 4: User Story 2 — Continue work on a listed trip (P2)

**Goal**: opening a row renders the canonical day-by-day plan with the
existing booking + share flows composed beneath (contract §3).

**Independent test**: draft → reload → open from the list → days render,
booking controls quote/book, share mints the durable link, Back returns.

- [X] T010 [US2] Extend `itinerary-list.tsx` with the open-in-place view
      (research D3/D4): Open → `trpc.workspace.itinerary.get` → opened view
      renders trip title, `<ItineraryDays />`, a verbatim booking-status
      line when `bookings[]` is non-empty, then `<BookingFlow
      itinerary={...} />` + `<ShareControl itineraryId={...} />` keyed by
      itinerary id; failure → `openErrorMessage` with the list still usable;
      "Back to trips" closes the view (data-model state machine).
- [X] T011 [US2] Extend `tests/e2e/workspace-list-journey.spec.ts` (part 2):
      open a listed trip → day items visible, booking controls present,
      share control present; Back returns to the list (contract §6).

## Phase 5: User Story 3 — New work shows up without a reload (P3)

**Goal**: draft success refreshes the list in place; a licensed white-label
copy is listed on the next workspace visit (contract §4).

**Independent test**: draft with the workspace open → row appears without
reload; license cross-agency → buyer's `/workspace` lists the copy.

- [X] T012 [US3] Add the additive optional `onDrafted?: () => void` prop to
      `Planner` in `apps/web/app/(workspace)/workspace/planner.tsx` (fires
      exactly on `status === "drafted"`); `workspace-panels.tsx` passes a
      `refreshToken` bump (research D2). Backward-compatible — no other
      Planner call sites change.
- [X] T013 [P] [US3] Extend
      `packages/api/src/__tests__/l3-itinerary-list.test.ts` (research D10,
      contract §6): agency A lists a drafted trip, agency B licenses it via
      the real marketplace path → B's `workspace.itinerary.list` contains
      the receipt's copy id; A's list ids are unchanged by the trade. No
      existing assertion weakened.
- [X] T014 [US3] Extend `tests/e2e/workspace-list-journey.spec.ts` (part 3):
      (a) with `/workspace` open, draft a trip → the row appears WITHOUT a
      page reload; (b) agency B lists, agency A licenses on `/marketplace`,
      navigate to `/workspace` → the white-label copy row is listed (spec
      SC-003).

## Phase 6: Polish & verification gates

- [X] T015 Run the deterministic suites per quickstart §2: in-image
      `pnpm test` (L1/L2/L3 — L3 against compose Postgres) + `pnpm run
      lint`; fix to green without weakening anything.
- [X] T016 Live Test & Fix (INV-027, quickstart §1–§5): boot the BUILT
      compose stack, `node tests/integration/smoke.mjs`, full
      `npx playwright test`, Playwright-MCP QA journey of the changed flow
      with per-step screenshots to `.kitchenloop/evidence/iter-3/seed-0017/`,
      compose-log scan (pattern `ERROR|FATAL|Unhandled`, empty allowlist);
      fix any defect in-cycle (max 3 rebuild cycles), teardown.

## Dependencies & execution order

- Phase 1 (T001) and Phase 2 (T002–T005) block story work; T003→T004
  (helpers before their tests), T002 is independent of T003/T005.
- US1 (T006–T009): T006 needs T003/T005; T007 needs T006; T008 needs T007;
  T009 needs T008.
- US2 (T010–T011): needs US1 (T006 panel) + T001/T002; T011 needs T010.
- US3 (T012–T014): T012 needs T007; T013 independent of UI (can run
  parallel with any UI task after Phase 2); T014 needs T012.
- Phase 6 last; T016 strictly after T015.

**Parallel opportunities**: T001 ∥ T002 ∥ T003 ∥ T005; T004 ∥ T005 after
T003; T013 ∥ T010–T012.

## Implementation strategy

MVP = Phase 1–3 (US1): the list panel alone already fixes the ticket's core
gap. US2 (open/continue) and US3 (freshness + L3 pin) complete the ticket's
acceptance criteria — all three ship in this cycle's single PR, but each
checkpoint is independently testable if the cycle must stop early.
