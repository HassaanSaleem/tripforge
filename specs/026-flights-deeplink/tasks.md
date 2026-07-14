---

description: "Task list for Flights Card — Indicative Options + Deep-Link Handoff"
---

# Tasks: Flights Card — Indicative Options + Deep-Link Handoff

**Input**: Design documents from `/specs/026-flights-deeplink/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — L1 unit tests on the pure generator (mandatory per this
repo's quality bar) and e2e assertions extending the existing planner/trips
Playwright spec (no new spec file).

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P1/P2)
to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Phase 1: Setup

No setup tasks required — this feature adds no new dependency, package, app,
or scaffolding; it reuses the existing pnpm/turborepo, Next.js, Vitest, and
Playwright toolchain exactly as configured today.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure generator and the shared presentational component every
user story wires into a call site — nothing below is story-specific.

**⚠️ CRITICAL**: No user story task can begin until this phase is complete.

- [X] T001 [P] Implement `IndicativeFlightOption` type, `indicativeFlightOptions()`,
      and `buildFlightSearchUrl()` pure functions in `apps/web/lib/flights.ts`
      per the function contracts in `data-model.md` (deterministic stable-hash
      generation off `destination`; no `Math.random`, no network call; never
      throws on an empty/unusual destination string)
- [X] T002 [P] Unit tests in `apps/web/lib/__tests__/flights.test.ts`:
      determinism (same `(destination, checkIn, checkOut, currency)` tuple
      called twice → byte-identical array), 2-or-3-option count invariant,
      option sets differ across 2+ distinct destinations, no-throw on an
      empty-string/unusual destination, `buildFlightSearchUrl` returns a
      well-formed `https://` URL that contains the destination and both dates
      and omits any origin parameter (spec FR-011)
- [X] T003 [US1][US2][US3] Create the presentational `<FlightsCard>` component
      in `apps/web/app/(workspace)/workspace/flights-card.tsx`: renders the
      2-3 options from `indicativeFlightOptions` (airline, indicative
      departure/return labels, price via the existing `formatMinorAmount`
      helper from `apps/web/lib/planner-form.ts`), an optional read-only
      flights-budget reference line (only when a `flightsBudget` prop is
      passed — FR-008, never computes/mutates it), and a single
      `data-testid="flights-deep-link"` `<a target="_blank" rel="noreferrer">`
      built from `buildFlightSearchUrl`, labeled "Search flights on partner ↗"
      so it cannot be mistaken for an in-platform booking (FR-005) — depends
      on T001

**Checkpoint**: Foundation ready — every user story phase below only wires
`<FlightsCard>` into an existing call site; no new component logic is added
after this point.

---

## Phase 3: User Story 1 - See indicative flight options while reviewing a drafted trip (Priority: P1) 🎯 MVP

**Goal**: A freshly-drafted trip's result view shows a populated flights card
(2-3 indicative options) with no extra agent action.

**Independent Test**: Draft a trip in the AI Builder (`/workspace`) and confirm
the drafted result renders a flights card with 2-3 distinct options.

### Implementation for User Story 1

- [X] T004 [US1] Extend the `"drafted"` view-state phase in
      `apps/web/app/(workspace)/workspace/planner.tsx` to additionally carry
      `tripRequest: DraftInput` (mirrors the existing `"comparing"` phase's
      `view.tripRequest` field) — thread it through `chooseOption`'s existing
      `setView({ phase: "drafted", outcome })` call, which already has the
      value one line above (per `data-model.md` "View-state wiring changes")
- [X] T005 [US1] Render `<FlightsCard>` inside `DraftResult` in
      `apps/web/app/(workspace)/workspace/planner.tsx`, sourcing
      `destination`/`checkIn`/`checkOut` from the newly-threaded `tripRequest`
      (T004) and `flightsBudget` from
      `outcome.fit.categories.find(c => c.category === "flightsTransport")`
      (`{ amountMinor: allocatedMinor, currency: itinerary.currency }`) —
      depends on T003, T004
- [X] T006 [US1] Extend the existing planner-draft e2e spec under `tests/e2e/`
      (reuse the existing draft-a-trip helper in `tests/e2e/support.ts` — do
      not fork a new spec file) with an assertion that after drafting, the
      flights card renders with 2-3 options (query by a stable
      `data-testid="flights-card"` added on the card's root element in T003)

**Checkpoint**: User Story 1 is fully functional and independently testable —
drafting any trip shows a populated flights card.

---

## Phase 4: User Story 2 - Hand off to a partner to actually search/book flights (Priority: P1)

**Goal**: The flights card's deep-link action opens an external tab and never
touches TripForge's own booking/payment state.

**Independent Test**: From a rendered flights card, activate the deep-link
action and confirm a new tab opens to an external URL with zero TripForge
mutation requests fired.

### Implementation for User Story 2

- [X] T007 [US2] Confirm/finish the deep-link `<a>` in
      `apps/web/app/(workspace)/workspace/flights-card.tsx` (built in T003)
      opens in a new tab (`target="_blank" rel="noreferrer"`), is copy-labeled
      unambiguously as an external handoff (FR-005), and exposes a stable
      `data-testid="flights-deep-link"` for test targeting
- [X] T008 [US2] Extend the e2e spec from T006 with an assertion that clicking
      `[data-testid="flights-deep-link"]` opens a new tab/popup to an external
      URL (Playwright `page.waitForEvent("popup")`, matching this repo's
      existing external-link e2e conventions) and that no
      `workspace.itinerary.*` or `workspace.booking.*` mutation fires as a
      result (assert on network requests captured during the click, or via
      Live Test's `browser_network_requests` evidence)

**Checkpoint**: User Stories 1 AND 2 both work independently — the card
renders and its deep-link hands off safely with no in-platform side effect.

---

## Phase 5: User Story 3 - See the same flights card when reopening a saved trip (Priority: P2)

**Goal**: Reopening a previously-saved trip from the trip list shows the same
deterministic flights card as the original drafting session.

**Independent Test**: Draft and save a trip, navigate to `/trips`, reopen it,
and confirm the flights card renders with the same options as at draft time.

### Implementation for User Story 3

- [X] T009 [US3] Destructure `overview.tripRequest` (already returned by
      `workspace.itinerary.get` via `itineraryOverview` — currently unused) in
      `apps/web/app/(workspace)/workspace/itinerary-list.tsx`
- [X] T010 [US3] Render `<FlightsCard>` in the reopened-trip detail section of
      `apps/web/app/(workspace)/workspace/itinerary-list.tsx`, sourcing
      `destination`/`checkIn`/`checkOut` from `overview.tripRequest` (T009)
      and `flightsBudget` from
      `itinerary.pricing.categories.find(c => c.category === "flightsTransport")?.allocated`
      — depends on T003, T009
- [X] T011 [US3] Extend the e2e spec from T006 with an assertion that
      reopening a previously-drafted trip from `/trips` renders a flights card
      whose options are identical to the ones shown right after drafting it
      (proves determinism across the draft-time and reopen-time render paths,
      spec SC-003)

**Checkpoint**: All three user stories are independently functional — the
feature is complete per spec.md's acceptance scenarios.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] Run `pnpm run lint` (in-image per `.kitchenloop/` verify
      recipe) and fix any findings across all files touched by T001-T011
- [X] T013 [P] Run the full `pnpm test` suite (in-image) — confirm zero
      regression in the existing planner/itinerary-list/e2e suites alongside
      the new `flights.test.ts`
- [X] T014 Live Test & Fix (INV-027, ADR-0003): boot the built compose stack,
      drive `quickstart.md`'s 3 scenarios via Playwright MCP, screenshot each
      step to `.kitchenloop/evidence/6/demo-10-flights-deeplink/`, scan
      compose logs against the allowlist, fix any defect found live in this
      same cycle
- [ ] T015 Write the sealed UAT test card
      `.kitchenloop/uat-cards/demo-10-flights-deeplink.md` per
      `.claude/skills/kitchenloop-execute/UAT-GATE.md`, covering the three
      `quickstart.md` scenarios with exact, no-placeholder steps and expected
      output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies beyond the existing codebase —
  BLOCKS all user stories (T003 depends on T001; T002 can run in parallel
  with T001/T003 since it only tests T001's exports)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T003) — no dependency on
  US2/US3
- **User Story 2 (Phase 4)**: Depends on Phase 2 (T003, specifically the
  deep-link element built there) — independently testable from US1, though in
  practice both render on the same card
- **User Story 3 (Phase 5)**: Depends on Phase 2 (T003) — no dependency on
  US1/US2 (a different call site, `itinerary-list.tsx` vs `planner.tsx`)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Parallel Opportunities

- T001 and T002 can be worked in parallel once the function signatures in
  `data-model.md` are agreed (T002 imports T001's exports, so in practice
  write T001 first, then T002 — both touch different files)
- Once T003 lands, US1 (T004-T006) and US3 (T009-T011) touch entirely
  different files (`planner.tsx` vs `itinerary-list.tsx`) and can proceed in
  parallel
- T012 and T013 (Polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
Task: "Implement flights.ts pure functions in apps/web/lib/flights.ts"
Task: "Unit tests in apps/web/lib/__tests__/flights.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T003)
2. Complete Phase 3: User Story 1 (T004-T006)
3. **STOP and VALIDATE**: draft a trip, confirm the flights card renders —
   this alone satisfies the ticket's core acceptance criterion ("a flights
   card shows indicative options")

### Incremental Delivery

1. Foundational → US1 (MVP: card renders on draft) → US2 (deep-link proven
   safe) → US3 (persists across reopen) → Polish (lint/test/Live Test/UAT)
2. Given this is a single small PR (not a multi-PR rollout), all phases ship
   together in one cycle — the ordering above is for implementation sequencing
   within that one cycle, not separate releases.
