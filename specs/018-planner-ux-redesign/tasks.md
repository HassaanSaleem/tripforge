---

description: "Task list for the planner UX redesign (demo-05-planner-ux)"
---

# Tasks: Planner UX Redesign — Human Labels, Destination Picker, Hero Draft Card

**Input**: Design documents from `/specs/018-planner-ux-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/planner-ui-contract.md, quickstart.md

**Tests**: Included — the touched pure-logic module already has an established Vitest suite (`apps/web/lib/__tests__/planner-form.test.ts`) that every new export must extend, per the quality bar's testing convention for this file.

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3), each independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to spec.md user stories (US1/US2/US3)

## Path Conventions

Existing single web app, `apps/web/` — no new directories. All paths below are relative to the repo root.

---

## Phase 1: Setup

**Purpose**: Confirm no new tooling/dependencies are required before touching implementation files.

- [X] T001 Confirm the worktree baseline is clean and `pnpm test` / `pnpm run lint` are runnable as-is (no new packages, no config changes needed — this feature reuses the existing Next.js/Vitest/ESLint setup in `apps/web`) — confirmed via in-image `docker run --rm tripforge-verify pnpm test` (host `pnpm` is denied in loop sessions)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared destination data/visual-treatment logic that both User Story 2 (picker) and User Story 3 (hero card) depend on (research.md Decision 2/3, data-model.md).

**⚠️ CRITICAL**: T002/T003 must land before any US2 or US3 task begins (US1 does not depend on this phase and may proceed in parallel).

- [X] T002 Add the `HeroDestination` type and `HERO_DESTINATIONS` seed constant (Lisbon/Portugal, Tokyo/Japan, Marrakech/Morocco, Reykjavik/Iceland — id, city, country, flag, gradient) to `apps/web/lib/planner-form.ts`, per data-model.md
- [X] T003 Add the pure `resolveDestinationTreatment(destination: string): { flag: string; gradient: string }` function to `apps/web/lib/planner-form.ts` (case-insensitive match against `HERO_DESTINATIONS`, default-gradient fallback for no match, never throws) — depends on T002 (same file)
- [X] T004 [P] Add shared structural CSS for image-forward gradient cards (`.tf-dest-card`, `.tf-dest-flag`, or equivalent) to `apps/web/app/globals.css`, reusing the `.home-card .cap` gradient technique as the base pattern (structural styling only — actual per-destination gradient values are applied inline from `HeroDestination.gradient` / `resolveDestinationTreatment`, not baked into CSS classes)

**Checkpoint**: Shared destination data + base CSS exist — User Stories 2 and 3 can now begin.

---

## Phase 3: User Story 1 - Human-readable trip preferences (Priority: P1) 🎯 MVP

**Goal**: Budget-mode and trip-style controls show only plain-language labels; the same underlying enum values still reach the draft request.

**Independent Test**: Open the planner; confirm no raw enum text (`hardCap`/`target`/`balanced`/`budget`/`premium`) appears anywhere in the rendered budget-mode/trip-style controls; submit a draft and confirm it succeeds exactly as before.

### Tests for User Story 1

- [X] T005 [P] [US1] Add unit tests to `apps/web/lib/__tests__/planner-form.test.ts` asserting `BUDGET_MODE_LABELS` has a non-raw-enum, non-empty label for every `PlannerFormValues["budgetMode"]` value, and `TRIP_STYLE_LABELS` has one for every non-empty `PlannerFormValues["tripStyle"]` value

### Implementation for User Story 1

- [X] T006 [US1] Add `BUDGET_MODE_LABELS` (`{ hardCap: "Hard cap", target: "Target budget" }`) and `TRIP_STYLE_LABELS` (`{ balanced: "Balanced", budget: "Budget-savvy", premium: "Premium" }`) exported constants to `apps/web/lib/planner-form.ts`
- [X] T007 [P] [US1] Add `.tf-segmented` CSS (radiogroup layout, button states, `aria-checked="true"` highlight, focus ring) to `apps/web/app/globals.css`
- [X] T008 [US1] In `apps/web/app/(workspace)/workspace/planner.tsx`, replace the budget-mode `<select>` with a `role="radiogroup"` `[data-testid="budget-mode-control"]` of `role="radio"` buttons built from `BUDGET_MODE_LABELS`, wired to the existing `values.budgetMode` / `update("budgetMode", …)` — no change to `PlannerFormValues` shape
- [X] T009 [US1] In the same file, replace the trip-style `<select>` with a `[data-testid="trip-style-control"]` segmented control built from `TRIP_STYLE_LABELS` plus an explicit "No preference" option (mapping to the existing `""` value), wired to `values.tripStyle` / `update("tripStyle", …)`
- [X] T010 [US1] Run `pnpm test` (root) and confirm every `planner-form.test.ts` assertion — existing and new — passes; manually confirm in a dev build that no raw enum string renders anywhere in the two controls — 377 tests passed in-image (`docker run --rm tripforge-verify pnpm test`); component build succeeded

**Checkpoint**: User Story 1 fully functional and independently testable — budget mode and trip style are human-labeled, draft submission unaffected.

---

## Phase 4: User Story 2 - Destination picker with seeded hero destinations (Priority: P2)

**Goal**: A searchable destination picker seeded with 4+ hero destinations, each visually distinct, with free-text fallback preserved.

**Independent Test**: Open the planner, use the destination control to select a seeded destination (field populates correctly), then clear it and type an unlisted destination (still accepted); submit and confirm the same destination string reaches the request as before.

### Tests for User Story 2

- [X] T011 [P] [US2] Extend `apps/web/lib/__tests__/planner-form.test.ts` with tests for `resolveDestinationTreatment`: exact match, case-insensitive match, and unmatched-input default fallback (never throws); assert `HERO_DESTINATIONS` contains at least the four spec-required destinations (Lisbon/Portugal, Tokyo/Japan, Marrakech/Morocco, Reykjavik/Iceland)

### Implementation for User Story 2

- [X] T012 [US2] In `apps/web/app/(workspace)/workspace/planner.tsx`, build the destination combobox: local open/filter state on the existing `input#destination`, a `[data-testid="destination-picker"]` panel (shown while focused) listing `[data-testid="destination-option"]` buttons for `HERO_DESTINATIONS` entries filtered case-insensitively against the typed text; selecting an option sets the input to `"{city}, {country}"` and closes the panel; typing continues to work as unmodified free text feeding `toTripRequest` exactly as today
- [X] T013 [P] [US2] Add `.tf-destination-picker` / `.tf-destination-option` CSS (dropdown panel positioning, per-option flag + gradient swatch via `.tf-dest-card` from T004, hover/focus states, mobile-width behavior within the existing `640px` breakpoint) to `apps/web/app/globals.css`
- [X] T014 [US2] Run `pnpm test`; manually verify in a dev build: open picker → select seeded destination → field populates; clear → type unlisted destination → still submits successfully — verified via in-image test run; manual browser verification runs in the Live Test & Fix step (T022)

**Checkpoint**: User Story 2 fully functional and independently testable — destination picker works standalone; User Story 1 controls unaffected.

---

## Phase 5: User Story 3 - Hero itinerary card for the drafted result (Priority: P3)

**Goal**: The drafted-itinerary result renders as a single image-forward hero card (day timeline + budget breakdown) instead of a plain table, with identical underlying data.

**Independent Test**: Draft an itinerary; confirm the result is a hero card (not a plain table) showing the same title/total/day content/budget-fit values as before; draft a second time and confirm the card fully replaces the first; trigger a failure and confirm no hero card renders.

### Tests for User Story 3

- [X] T015 [P] [US3] Add/confirm test coverage in `apps/web/lib/__tests__/planner-form.test.ts` that `formatMinorAmount` output is unchanged and still the only money-rendering path used (no new client-side arithmetic introduced by the hero-card work) — existing `formatMinorAmount` test suite is untouched and still green; hero header reuses it directly, no new arithmetic added

### Implementation for User Story 3

- [X] T016 [US3] In `apps/web/app/(workspace)/workspace/planner.tsx`, replace the `DraftResult` plain-table layout with the hero-card structure: `[data-testid="draft-hero-header"]` (title + total, background from `resolveDestinationTreatment`), the existing `ItineraryDays` day content unchanged, and a restyled but data-identical `[data-testid="budget-fit"]` breakdown (category/allocated/planned/state rows unchanged) — also routed the header's budget-mode text through `BUDGET_MODE_LABELS` (it was previously rendering the raw enum, the same bug class as FR-001)
- [X] T017 [P] [US3] Add `.tf-draft-hero` CSS (hero header, day-timeline layout, restyled budget-fit presentation) to `apps/web/app/globals.css`, reusing the `.home-card .cap` gradient technique
- [X] T018 [US3] Run `pnpm test`; manually verify in a dev build: draft renders as a hero card; a second draft fully replaces the first (keyed by `itinerary.id`, unchanged from today); a failure path (e.g. budget below reserve) shows the existing failure message with no hero card — verified via in-image test run; manual browser verification runs in the Live Test & Fix step (T022)

**Checkpoint**: All three user stories independently functional — full planner redesign complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency, responsive, and gate checks across all three stories.

- [X] T019 [P] Verify the segmented controls, destination picker, and hero card all remain usable at the existing `max-width: 640px` breakpoint in `apps/web/app/globals.css` (extend media-query rules if any control overflows) — each new class block ships its own `@media (max-width: 640px)` rule
- [X] T020 Update the file-header comment block in `apps/web/app/(workspace)/workspace/planner.tsx` to note the presentation-only redesign scope, preserving the existing INV-023/024/028 provenance notes
- [X] T021 Run `pnpm run lint` and `pnpm test` across the full worktree as the final pre-Live-Test gate — both clean in-image (0 lint errors, 377/377 tests passing)
- [X] T022 Execute the quickstart.md live-browser validation steps (`specs/018-planner-ux-redesign/quickstart.md`) against the built compose stack as part of Live Test & Fix (INV-027) — PASS, zero defects, evidence in `.kitchenloop/evidence/5/demo-05-planner-ux/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS User Stories 2 and 3 (not User Story 1).
- **User Story 1 (Phase 3)**: Depends only on Setup — can proceed in parallel with Phase 2.
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2).
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2). Does not depend on User Story 2, though both touch `planner.tsx` so should be sequenced (not hand-edited concurrently) to avoid merge friction within the single implementer working this ticket.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories.
- **US2 (P2)**: No functional dependency on US1; shares `planner.tsx` and `planner-form.ts` as files, so implement after US1 lands to avoid rework on the same component.
- **US3 (P3)**: No functional dependency on US1/US2; shares the same two files, implement last for the same reason.

### Parallel Opportunities

- T002/T003 (Foundational) can run alongside T005-T010 (US1), since US1 doesn't touch destination logic.
- T004, T007, T013, T017 (all CSS-only additions to `globals.css`) are `[P]` relative to their sibling component-logic tasks, but since they land in the same file across phases, apply them in task-ID order to avoid clobbering each other's diffs.
- T005, T011, T015 (test-file additions) are `[P]` within their own phase but, like the CSS file, share `planner-form.test.ts` — apply in order.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) and Phase 3 (US1).
2. **STOP and VALIDATE**: confirm zero raw enum text renders and draft submission still works.
3. This alone already satisfies the ticket's single biggest "debug form" complaint and can ship as a standalone increment if time-boxed.

### Incremental Delivery (full ticket scope, as planned for this cycle)

1. Setup → Foundational → US1 → US2 → US3 → Polish, in that order (single-implementer sequencing avoids concurrent edits to the shared `planner.tsx`/`planner-form.ts`/`globals.css` files).
2. Each story phase ends with its own checkpoint (`pnpm test` green, manual dev-build spot check) before moving to the next.
3. Polish phase runs the full lint/test suite once more and then the Live Test & Fix protocol (quickstart.md) as the release gate.
