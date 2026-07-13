# Tasks: Multi-Option AI Itinerary Generation

**Input**: Design documents from `/specs/019-multi-option-planner/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — this repo's quality bar (`.kitchenloop/unbeatable-tests.md`,
`.claude/skills/kitchenloop-execute/SKILL.md`) mandates L1/L2 unit/service
coverage plus an L3 integration test for any change touching an integration
point (here: the tRPC subscription boundary + DB persistence).

**Organization**: Tasks are grouped by user story so each story is
independently completable and testable, per plan.md's Project Structure.

## Phase 1: Setup

No new project/package/tooling setup required — this feature extends
existing files in `packages/llm`, `packages/api`, and `apps/web` only (per
plan.md Structure Decision). Skipping straight to Foundational.

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Change the LLMPort planner-draft vocabulary from "one draft" to
"one or more labeled drafts" — every consumer (FakeLLM, AnthropicLLM,
planner.ts, the existing L3 test) must move together, since `DraftItineraryResult`
is a single shared type (data-model.md). Both user stories depend on this.

- [x] T001 Add `DraftVariant` union + `DRAFT_VARIANT_LABELS` map and `NamedPlannerDraft` interface to `packages/llm/src/planner-draft.ts` (data-model.md "DraftVariant"/"NamedPlannerDraft" — `PlannerDraftSchema`/`PlannerDraftItemSchema` themselves stay byte-for-byte unchanged)
- [x] T002 Change `DraftItineraryResult`'s `"drafted"` arm in `packages/llm/src/port.ts` from `{ draft: PlannerDraft }` to `{ drafts: NamedPlannerDraft[] }` (data-model.md "DraftItineraryResult — CHANGED"); update the doc comment above `LLMPort.draftItinerary`
- [x] T003 [P] Rewrite `FakeLLM.draftItinerary` in `packages/llm/src/fake.ts` to build 3 deterministic variants (`budgetSavvy`/`balanced`/`premium`) from ONE shared tool-lookup pass per research.md D2 (budgetSavvy = cheapest hotel + fewer activities + cheapest transfer; balanced = today's existing selection unchanged; premium = priciest-available hotel/transfer with fallback to cheapest when only one offer exists, one extra activity per day when available), de-duplicating any variants that end up identical so `drafts` never contains two byte-identical entries (FR-010); keep the `plannerScripts` short-circuit unchanged (still returns its scripted result verbatim, now expected to already be shaped as `{ drafts: [...] }` by the test that scripts it)
- [x] T004 [P] Update `packages/llm/src/anthropic.ts`'s `draftItinerary` prompt/tool schema per research.md D3: `submit_itinerary_draft` (single) → `submit_itinerary_drafts` (1-3 labeled `PlannerDraft`s), still one tool-loop round trip, still only offer-reference proposals (INV-001)
- [x] T005 Update `packages/api/src/__tests__/l3-planner-verification.test.ts` and any other test constructing `FakeLLMOptions.plannerScripts` or asserting on `DraftItineraryResult` shape to the new `{ status: "drafted"; drafts: NamedPlannerDraft[] }` shape (grep `plannerScripts` and `status: "drafted"` across `packages/llm` and `packages/api` test files first, per this repo's "fix all callsites in one pass" policy — do not leave any consumer on the old shape)
- [x] T006 Run `pnpm --filter @tripforge/llm test` and `pnpm --filter @tripforge/api test` to confirm the foundational shape change compiles and existing tests pass before starting either user story

**Checkpoint**: `packages/llm` now speaks "1-3 labeled drafts"; nothing downstream is broken yet (services/routers/UI still assume one draft — updated next).

## Phase 3: User Story 1 - Compare multiple drafted options (Priority: P1)

**Goal**: Submitting the planner form shows 2-3 distinct, priced, labeled
options — nothing persisted yet.

**Independent Test** (spec.md US1): submit a valid trip request; verify 2-3
options render, each with a distinct label/price and at least one
distinguishing highlight.

- [x] T007 [US1] In `packages/api/src/services/planner.ts`, split the current `draftItinerary` generator into a shared internal core (LLM tool-loop call + `verifiedSupplyCatalog` + per-variant `assembleItinerary`, all pure/no-DB — contracts/itinerary-draft-subscription.md) and a new exported `draftOptions()` generator that yields progress events then a terminal `{ status: "drafted", options: DraftOption[] }` (or `infeasible`/`planner_failed`) WITHOUT any `db.transaction`/`recordPmfEvent` call — each `DraftOption` = `{ variant, label, itinerary, fit }` per data-model.md, `itinerary.id` a fresh in-memory `randomUUID()` never written to DB
- [x] T008 [US1] Export the new `CompareOutcome`/`DraftOption` types from `packages/api/src/services/planner.ts` (mirrors the existing `DraftOutcome`/`DraftEvent` export pattern) for the router and UI to import
- [x] T009 [US1] Update `packages/api/src/routers/itinerary.ts`'s `draft` subscription to call `draftOptions()` instead of the old `draftItinerary()`, per contracts/itinerary-draft-subscription.md (input schema `tripRequestSchema` unchanged, authorization gate unchanged)
- [x] T010 [US1] Regenerate/update the tRPC-derived `DraftEvent`/`DraftOutput` type exports consumed by the web app in `apps/web/lib/trpc/client.ts` to reflect the new compare-time `CompareOutcome` shape
- [x] T011 [US1] In `apps/web/lib/planner-form.ts`, extend `draftFailureMessage`'s exhaustive switch if the `NonDraftedOutcome` union shape changed, and add a pure helper (e.g. `optionHighlight(option: DraftOption): string`) that derives a one-line highlight (hotel name / activity count) from an option's `itinerary` for the compare cards — no client-side money arithmetic (FR-009 pattern), only display formatting via the existing `formatMinorAmount`
- [x] T012 [US1] In `apps/web/app/(workspace)/workspace/planner.tsx`, replace the `"drafted"` view state's single-outcome assumption with a new `"comparing"` phase: render one card per `DraftOption` (label, `formatMinorAmount` total, budget-fit indicator, 1-2 highlights via T011's helper), each with a "Choose this option" action; wire the `draft` subscription's terminal event into this new `"comparing"` state instead of directly showing `DraftResult`
- [x] T013 [P] [US1] Add/extend a `packages/llm` unit test asserting `FakeLLM.draftItinerary` returns 2-3 distinct variants for a normal multi-day/multi-offer trip request, and that no two returned variants are identical in hotel offerId + activity count + total item count (FR-010, mirrors quickstart.md scenario 1)
- [x] T014 [P] [US1] Extend `packages/api/src/__tests__/l3-planner-verification.test.ts` (or a sibling test file) asserting `draftOptions()` performs ZERO `itinerary` table inserts and ZERO `trip_created` PMF events regardless of how many options are returned (contracts/itinerary-draft-subscription.md "Persistence... NO LONGER happens on this procedure")

**Checkpoint**: Compare view is fully functional and independently verifiable; nothing is persisted yet (US2 needed to actually create a trip).

## Phase 4: User Story 2 - Select one option and continue exactly as today (Priority: P1)

**Goal**: Picking a compared option persists exactly one trip, identical in
every respect to today's single-draft flow.

**Independent Test** (spec.md US2): from a rendered compare view, pick one
option; verify exactly one new trip appears in the trip list, the builder
view opens on it, and booking/share behave unchanged.

- [x] T015 [US2] In `packages/api/src/services/planner.ts`, add `selectDraftOption(container, session, input: { tripRequest: TripRequest; variant: DraftVariant })` generator reusing the T007 shared core: re-run the tool loop + verification + assembly for ALL variants, then if the requested `variant` is present, `stampProvenance` + persist (`db.transaction` inserting the `itinerary` row + `recordPmfEvent({ type: "trip_created", ... })`, identical to the pre-existing single-draft transaction) and yield the pre-existing single-option `DraftOutcome` shape (`{ status: "drafted", itinerary, fit }`); if the variant isn't present in the fresh regeneration, yield `{ status: "planner_failed", reason: "no_proposals" }` (contracts/select-draft-subscription.md)
- [x] T016 [US2] Add a `selectDraftInputSchema` (zod, `strictObject({ tripRequest: tripRequestSchema, variant: z.enum(["budgetSavvy","balanced","premium"]) })`) and a new `selectDraft: agentProcedure.input(...).subscription(...)` procedure to `packages/api/src/routers/itinerary.ts`, wired to `selectDraftOption` (contracts/select-draft-subscription.md)
- [x] T017 [US2] In `apps/web/app/(workspace)/workspace/planner.tsx`, wire each compare card's "Choose this option" action to call `trpc.workspace.itinerary.selectDraft.subscribe({ tripRequest, variant }, { onData, onError, onComplete })` (same subscription-handling pattern as the existing `draft` call, including the `activeSubscription` unsubscribe-on-unmount guard already in the component); on a `"drafted"` terminal result, transition to the EXISTING `"drafted"` view state unchanged (so `DraftResult`/`BookingFlow`/`ShareControl` render exactly as they do today) — show a "Finding your trip…" progress state while selecting, reusing the existing `STEP_LABEL` map
- [x] T018 [US2] Handle the selecting-phase failure paths in `planner.tsx`/`planner-form.ts`: reuse `draftFailureMessage`/`draftErrorMessage` for `selectDraft`'s outcome/error exactly as `draft` does today, so a re-verification failure at selection time (edge case: inventory changed) surfaces the same typed, human-readable message the single-draft flow already has
- [x] T019 [P] [US2] Extend `packages/api/src/__tests__/l3-planner-verification.test.ts` asserting: (a) `selectDraftOption` with a valid variant inserts exactly ONE `itinerary` row and records exactly ONE `trip_created` PMF event; (b) calling it twice with different variants for the same `tripRequest` produces two separate trips (no accidental de-dup/overwrite); (c) a `tripRequest`/`variant` pair that regenerates as infeasible yields the typed `infeasible`/`planner_failed` outcome with ZERO DB writes (state-conservation on the failure path, matching this repo's money-path test convention)
- [x] T020 [US2] Full-flow regression: extend or add a test exercising `draft` (compare) → pick a variant → `selectDraft` (persist) → assert the persisted itinerary's `document`/`pricing` matches what a direct call to the OLD single-draft pipeline would have produced for the `balanced` variant (backward-compatible pricing/content for the default variant, per research.md D2)

**Checkpoint**: End-to-end compare → select → persisted, bookable, shareable trip works exactly like the old single-draft flow.

## Phase 5: User Story 3 - Keyless demo stays fully functional (Priority: P2)

**Goal**: Deterministic, reproducible options with zero network calls in the
keyless FakeLLM deployment.

**Independent Test** (spec.md US3): with no LLM API key configured, submit
the same trip request twice; verify identical option sets both times.

- [x] T021 [P] [US3] Add a `packages/llm` unit test asserting `FakeLLM.draftItinerary` called twice with an identical `DraftItineraryRequest` returns byte-identical `drafts` arrays (same variant order, same offerIds, same title) — no `Math.random()`/wall-clock dependency anywhere in the new variant-selection logic added in T003
- [x] T022 [P] [US3] Add a `packages/llm` unit test for the edge case in research.md D2/spec.md Edge Cases: a trip request whose supply catalog yields only one hotel/one transfer offer still returns at least 1 distinct option and never two options identical in hotel + activity count + transfer (FR-010)

**Checkpoint**: All three user stories independently verified.

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T023 Run `pnpm run lint` and `pnpm test` (root, full workspace) and fix any fallout across `packages/llm`, `packages/api`, `apps/web`
- [x] T024 Live Test & Fix (INV-027): boot the built compose stack keyless, drive quickstart.md scenarios 1-3 via Playwright MCP with per-step screenshots into `.kitchenloop/evidence/5/demo-04-multi-option/`, scan compose logs for non-allowlisted ERROR lines, fix any defect found and re-verify (max 3 cycles)
- [x] T025 Update `specs/019-multi-option-planner/checklists/requirements.md` and mark this tasks.md's items complete; record the PR's spec-alignment table (FR-001..FR-012 → implementing file(s) → test(s))

## Dependencies & Execution Order

- **Phase 2 (Foundational) blocks Phase 3 and Phase 4** — `DraftItineraryResult`'s shape change (T001-T002) must land before ANY consumer code (services/routers/UI/tests) is touched, per this repo's "fix all callsites in one pass" policy (T005-T006 verify nothing is left on the old shape).
- **Phase 3 (US1) blocks Phase 4 (US2)** in this plan only because both are P1 and Phase 4's UI wiring (T017) extends the SAME `planner.tsx` compare-card markup Phase 3 introduces (T012) — they are sequenced, not independently deployable, but each has its own independent test criteria per spec.md.
- **Phase 5 (US3)** only needs Phase 2 (FakeLLM) — it can run in parallel with Phase 3/4 once T001-T006 land.
- **Phase 6 (Polish)** runs last, after all user stories.

## Parallel Execution Examples

- Within Phase 2: T003 (FakeLLM) and T004 (AnthropicLLM) touch different files and can run in parallel once T001-T002 land.
- Within Phase 3: T013 (FakeLLM unit test) and T014 (L3 persistence-absence test) touch different files/packages and can run in parallel once T007-T009 land.
- Within Phase 5: T021 and T022 are both new, independent test cases in the same file — write together but each is a self-contained assertion.

## Implementation Strategy

**MVP = Phase 2 + Phase 3 + Phase 4** (both P1 user stories) — a demo that
can compare options but never persist one, or persist without ever comparing,
delivers no value; they ship together in this PR. Phase 5 (P2, determinism
tests) and Phase 6 (polish/live-test) close out the same PR since this is a
single feature-sized ticket per the batching policy (not bundled with other
tickets).
