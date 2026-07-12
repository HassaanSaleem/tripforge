# Tasks: Stream the AI Itinerary Draft Response

**Input**: Design documents from `/specs/016-stream-draft-response/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/itinerary-draft-subscription.md, quickstart.md

**Tests**: Included — this is an integration-point change (tRPC procedure kind
change on an existing money-adjacent flow) and the quality bar
(`.kitchenloop/quality-bar.md`, `.kitchenloop/unbeatable-tests.md`) requires
L2/L3 coverage for integration points; the ticket's own acceptance criteria
require existing draft-flow tests to stay green.

**Organization**: Tasks are grouped by user story (spec.md P1/P1/P2) to enable
independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (progressive UI), US2 (server-side streaming/INV-028), US3 (persistence preserved under streaming)

---

## Phase 1: Setup

- [X] T001 Confirm `@trpc/server`/`@trpc/client` 11.18.0 export `sse`, `tracked`, `httpSubscriptionLink`, `splitLink`, `inferSubscriptionOutput` — verify against the installed package's `.d.ts` (via `docker build -f apps/web/Dockerfile --target build -t tripforge-verify .` then `docker run --rm tripforge-verify node -e "console.log(Object.keys(require('@trpc/server')))"` and the client equivalent). If any name differs from research.md R1/R5, note the actual name for use in T004/T005/T012.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `DraftStep`/`DraftProgressEvent` vocabulary all three user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `DraftStep` union and `DraftProgressEvent` type to `packages/llm/src/port.ts`; change the `LLMPort.draftItinerary` method signature from `(req: DraftItineraryRequest) => Promise<DraftItineraryResult>` to `(req: DraftItineraryRequest) => AsyncGenerator<DraftProgressEvent>` (per data-model.md; `DraftItineraryResult` itself is unchanged)
- [X] T003 Export `DraftStep`/`DraftProgressEvent` from `packages/llm/src/index.ts`

**Checkpoint**: `LLMPort` contract updated — both implementations (US2) and all callers (US1/US3) can now be built against it. This will not typecheck until T004/T005 land; that's expected within this phase.

---

## Phase 3: User Story 2 - Long drafting requests stay within the platform's request-timeout budget (Priority: P1)

**Goal**: The request handler emits data to the client incrementally instead of blocking silently for the whole multi-tool-call draft; the keyless FakeLLM path is unaffected in final output.

**Independent Test**: Call `LLMPort.draftItinerary` directly (both implementations) in a unit test and assert progress events are yielded before the terminal result event; assert the terminal result is unchanged from today's `DraftItineraryResult`.

### Tests for User Story 2

- [X] T004 [P] [US2] In `packages/llm/src/__tests__/planner.test.ts`, add cases asserting `FakeLLM.draftItinerary(...)` (now an async generator) yields, in order: `progress` events for `searchingHotels`, `searchingActivities`, `quotingTransfer`, `quotingCarRental`, `assembling`, then a terminal `result` event whose `.result` is identical to today's drafted/failed outcome for the existing fixture scenarios (drafted, no-proposals failure)
- [X] T005 [P] [US2] In `packages/llm/src/__tests__/planner.test.ts` (or a new `anthropic.test.ts` if none exists for `AnthropicLLM` — check first), add a test that mocks `client.beta.messages.toolRunner` to yield a sequence of tool-loop messages containing `tool_use` blocks for each planner tool name, and asserts `AnthropicLLM.draftItinerary(...)` yields the corresponding `progress` events in order followed by a terminal `result` event with the existing captured-draft/failure logic unchanged

### Implementation for User Story 2

- [X] T006 [US2] Rewrite `FakeLLM.draftItinerary` in `packages/llm/src/fake.ts` as an async generator: replace the `Promise.all([searchHotelRates, searchActivities, quoteTransfer])` fan-out with sequential awaits, yielding `{type:"progress", step:"searchingHotels"}` immediately before the hotel call, `{type:"progress", step:"searchingActivities"}` before activities, `{type:"progress", step:"quotingTransfer"}` before the transfer call, `{type:"progress", step:"quotingCarRental"}` before the car-rental context call, and `{type:"progress", step:"assembling"}` before constructing the final `PlannerDraft`; yield the terminal `{type:"result", result}` with the exact existing drafted/failed logic (depends on T002)
- [X] T007 [US2] Rewrite `AnthropicLLM.draftItinerary` in `packages/llm/src/anthropic.ts` as an async generator: keep the existing `client.beta.messages.toolRunner(...)` construction and `MAX_TOOL_ITERATIONS`/usage-metering logic unchanged; inside the `for await (const message of runner)` loop, for each content block with `type === "tool_use"`, map `block.name` (`search_hotel_rates` → `searchingHotels`, `search_activities` → `searchingActivities`, `quote_transfer` → `quotingTransfer`, `quote_car_rental` → `quotingCarRental`, `submit_itinerary_draft` → `assembling`) and yield the corresponding `{type:"progress", step}` event (skip duplicate consecutive same-step yields is NOT required — simplicity over dedup); after the loop (success or the existing catch path), yield the terminal `{type:"result", result}` exactly as today's return value (depends on T002)

**Checkpoint**: Both `LLMPort` implementations now stream progress + an unchanged terminal result; T004/T005 pass. This phase is independently verifiable with `docker run ... tripforge-verify pnpm test -- packages/llm` before touching the API/UI layers.

---

## Phase 4: User Story 1 - Agent watches drafting progress instead of a static spinner (Priority: P1)

**Goal**: The `workspace.itinerary.draft` procedure and the workspace planner UI expose the streamed progress end-to-end, so an agent sees step-level feedback instead of one static message.

**Independent Test**: Drive the planner form in a browser (or Playwright) against a live-ish stream and observe at least one intermediate progress state before the final drafted itinerary/failure renders; the final rendered result is unchanged from before this feature.

**Depends on**: Phase 3 (US2) — the procedure needs a streaming `LLMPort` to forward.

### Tests for User Story 1

- [X] T008 [US1] Update `packages/api/src/__tests__/draft-flow.test.ts`: split `itinerary.draft` out of the shared RBAC `cases` table (its calling convention changes from a mutation call to a subscription — confirm via T001's findings whether `caller.workspace.itinerary.draft(input)` returns an async iterable directly or a promise-wrapped one for a server-side `createCaller`) and add equivalent anonymous→UNAUTHORIZED / traveler→FORBIDDEN assertions adapted to that calling convention, plus the existing boundary-validation assertions (bad dates, zero party, non-integer money, unknown fields) unchanged in spirit
- [X] T009 [P] [US1] Add an L2 test (new case in `draft-flow.test.ts` or a new `packages/api/src/__tests__/draft-stream.test.ts`) that drives `itineraryRouter.draft` as an async-iterable subscription with a valid input and a `FakeLLM`-backed container, collects all yielded events, and asserts: at least one `progress` event precedes the terminal `result` event, and the terminal event's `.outcome` matches exactly what today's mutation would have returned for the same input
- [X] T010 [P] [US1] Add an L2 test asserting the infeasible-budget case (budget below the flights reserve) yields **zero** `progress` events and goes straight to the terminal `{type:"result", outcome:{status:"infeasible",...}}` event (edge case from spec.md; exercises `planner.ts`'s pre-LLM short-circuit)
- [X] T011 [P] [US1] Update `tests/e2e/planner-journey.spec.ts` (Playwright) to assert the drafting UI shows at least one distinct intermediate status/progress state (not just the static "Designing your trip…" text) before the final drafted-itinerary assertions, while keeping the existing final-result assertions unchanged

### Implementation for User Story 1

- [X] T012 [US1] In `packages/api/src/services/planner.ts`, convert the exported `draftItinerary(container, session, input)` function into an async generator: forward every `{type:"progress",...}` event from the injected `LLMPort.draftItinerary(...)` call unchanged; keep the existing pre-LLM `allocateBudget` infeasibility short-circuit, the post-LLM re-verification, `assembleItinerary`, and the single `db.transaction(...)` persistence write byte-for-byte unchanged; yield exactly one terminal `{type:"progress"... }`-free final event `{type:"result", outcome}` where `outcome` is the existing `DraftOutcome` union (depends on T006, T007)
- [X] T013 [US1] In `packages/api/src/routers/itinerary.ts`, change the `draft` procedure from `agentProcedure...mutation(...)` to `agentProcedure...subscription(...)`, returning the async generator from `draftItinerary(ctx.container, ctx.session, input)` directly (or wrapped per whatever `@trpc/server` 11.18.0's subscription resolver contract requires per T001's findings — e.g. a plain async generator return, no `tracked()` needed per research.md R1/contracts) (depends on T012)
- [X] T014 [US1] In `apps/web/lib/trpc/client.ts`, replace the single `httpBatchLink({url: "/api/trpc"})` with a `splitLink` routing `op.type === "subscription"` operations through `httpSubscriptionLink({url: "/api/trpc"})` and everything else through the existing `httpBatchLink`; update the `DraftOutput`/`DraftInput` type exports to infer from the new subscription shape (`inferSubscriptionOutput`/equivalent per T001) instead of `inferRouterOutputs<...>["draft"]`'s mutation shape (depends on T001)
- [X] T015 [US1] In `apps/web/app/(workspace)/workspace/planner.tsx`, replace `await trpc.workspace.itinerary.draft.mutate(mapped.request)` with `trpc.workspace.itinerary.draft.subscribe(mapped.request, { onData, onError, onComplete })`: extend `PlannerViewState`'s `{phase:"drafting"}` variant with an optional `step` field, update it on each `progress` event via a small step→label map ("Searching hotels…", "Searching activities…", "Pricing transfers…", "Checking car-rental context…", "Assembling your itinerary…"), and on the terminal `result` event apply the exact existing drafted/failed branching (`setView`, `onDrafted?.()`, `draftFailureMessage`) unchanged; store the subscription handle and unsubscribe in `onComplete`/`onError`/a cleanup effect so a late event after unmount is a no-op (depends on T013, T014)
- [X] T016 [US1] Render the `step`-driven progress label in place of the current fixed `"Designing your trip — pricing real inventory…"` text in `planner.tsx` (fall back to the existing fixed text when no `step` has arrived yet, covering the "fails on the very first call" / "no progress ever emitted" edge case) (depends on T015)

**Checkpoint**: An agent can now submit a draft and see progressive status text before the identical final result renders; T008–T011 pass.

---

## Phase 5: User Story 3 - A drafting request that fails or is interrupted leaves no partial state (Priority: P2)

**Goal**: Confirm, under real Postgres, that the persistence contract (INV-021) is unaffected by the transport change — no partial writes on failure or on client disconnect.

**Independent Test**: Force a mid-stream planner failure against a real database and confirm no itinerary row / PMF event was written; simulate a client that stops listening mid-stream and confirm the server-side outcome (and its persistence decision) is unaffected.

**Depends on**: Phase 4 (US1) — exercises the full router→service→LLMPort chain.

### Tests for User Story 3

- [X] T017 [US3] Update `packages/api/src/__tests__/l3-planner-verification.test.ts` (env-gated, real Postgres) to consume `itineraryRouter.draft` as a subscription (collect events, use the terminal `result`), keeping its existing assertions (persisted, budget-fit correct) unchanged in substance
- [X] T018 [US3] Add an L3 case (same file or a new `packages/api/src/__tests__/l3-draft-stream-failure.test.ts`) that forces a planner failure (e.g. a scripted `FakeLLM` failure result, or the existing malformed-output double) partway through a subscription with a real database connected, and asserts **zero** `itinerary` rows and **zero** `trip_created` PMF events exist afterward for that attempt — a state-conservation assertion per the quality bar's money-adjacent-path rule (Constitution VI spirit; INV-021)
- [X] T019 [US3] Add an L3 or L2 case simulating a client that stops iterating the async generator/subscription partway through (e.g. `break` out of a `for await` early) and asserts the server-side generator, when driven to completion independently (as the real fetch-adapter SSE handler would, unaffected by the client subscription state), still reaches the same persistence outcome as an uninterrupted run

### Implementation for User Story 3

- [X] T020 [US3] Audit `packages/api/src/services/planner.ts` (from T012) to confirm the `db.transaction(...)` call and its guarding success condition are structurally unreachable from generator/subscription lifecycle events (no `try/finally` cleanup keyed to consumer cancellation, no early-return triggered by the caller no longer pulling values) — fix if T018/T019 reveal a gap; otherwise this task is a no-op confirmation recorded in the PR body

**Checkpoint**: All three user stories independently verified; persistence contract provably unaffected by the transport change.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Update `specs/005-budget-quote-book/spec.md`'s "Streaming deferral (INV-028)" note and `plan.md`'s Complexity Tracking row to mark the deferral as resolved by this feature (016), per the Development Workflow's spec-amendment discipline (code never silently defines the spec) — link back to specs/016
- [X] T022 [P] Update `docs/architecture/system-architecture.md` if INV-028's wording needs a forward-reference to this feature as the resolved case (only if the current wording reads as still-deferred; otherwise skip — record the check in the PR body)
- [X] T023 Run `specs/016-stream-draft-response/quickstart.md` end-to-end against the built compose stack (this is also the mandatory Live Test & Fix step, not a separate optional pass)
- [X] T024 Full lint + full `pnpm test` pass in the built image (per quickstart.md §2); resolve any regression before opening the PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS Phases 3-5
- **US2 (Phase 3)**: Depends on Phase 2 — independently testable at the `LLMPort` boundary alone
- **US1 (Phase 4)**: Depends on Phase 3 (needs both streaming `LLMPort` implementations to forward)
- **US3 (Phase 5)**: Depends on Phase 4 (exercises the full chain end-to-end against real Postgres)
- **Polish (Phase 6)**: Depends on Phases 3-5 all complete

Unlike a typical spec, these three user stories are **not** parallel/independent of each other — US1 needs US2's streaming `LLMPort`, and US3's persistence proof needs US1's wired-up router/service chain. This is a single narrow transport change threaded through one call chain, not three separable features; the priority split exists to make each layer's correctness independently checkable, not to allow parallel delivery.

### Within Each Phase

- Tests before implementation (write T004/T005 and see them fail against the old `Promise`-returning signature before T006/T007 land; same pattern for T008-T011 before T012-T016, and T017-T019 before T020)
- `packages/llm` (US2) before `packages/api` (US1) before `apps/web` (US1) before L3 (US3) — matches the call chain direction

### Parallel Opportunities

- T004 and T005 (different files/implementations) in parallel
- T009, T010, T011 (different files) in parallel once T008 clarifies the calling convention
- T021, T022 (docs only) in parallel with each other and with T023/T024

---

## Implementation Strategy

### MVP First

Phases 1-2 (Setup + Foundational) then Phase 3 (US2) alone already satisfies
the INV-028 compliance half of the ticket (the request handler streams) even
before the UI changes — useful as a checkpoint, but this ticket ships as one
PR per the Kitchen Loop batching policy (feature-sized tickets are never
split across PRs), so all phases land together.

### Incremental Delivery Within the PR

1. Phase 1 + 2 → contract in place
2. Phase 3 (US2) → both `LLMPort` implementations stream; verify with `packages/llm` tests alone
3. Phase 4 (US1) → full user-visible feature; verify with `packages/api` + `apps/web` tests + e2e
4. Phase 5 (US3) → persistence-contract proof under real Postgres
5. Phase 6 → docs sync, full-suite verification, Live Test & Fix, PR

---

## Discovered scope (beyond the original plan, found during T001/T008 investigation)

T001's package-export check (confirmed via the installed `@trpc/server@11.18.0` type
declarations directly rather than a throwaway Docker run) surfaced two things the
original plan underestimated:

1. **`caller.workspace.itinerary.draft(input)` still returns `Promise<...>` for a
   subscription procedure** (`DecorateProcedure` type, `@trpc/server`) — middleware
   (UNAUTHORIZED/FORBIDDEN) and zod input validation still reject the SAME promise
   before the resolver ever runs. Net effect: `draft-flow.test.ts`'s RBAC/boundary
   tests needed **zero changes** (T008's planned "split out of the shared table" was
   unnecessary — verified, not done, since there was nothing to fix).
2. **Every other L2/L3 test that calls `.workspace.itinerary.draft(...)` purely as
   fixture setup** (draft a trip, then test booking/marketplace/media/client-view/
   itinerary-list) now gets back `Promise<AsyncGenerator<DraftEvent>>` instead of
   `Promise<DraftOutcome>` — **~20 call sites across 7 files**
   (`l3-booking.test.ts`, `l3-itinerary-list.test.ts`, `l3-media.test.ts`,
   `l3-marketplace.test.ts`, `l3-client-view.test.ts`, plus the custom `LLMPort`
   double in `l3-planner-verification.test.ts`). Fixed with a new shared
   `packages/api/src/__tests__/draft-helper.ts` (`draftViaCaller`) that drains the
   stream to the same terminal `DraftOutcome` every one of these tests already
   expected, plus a mechanical per-file call-site swap.
3. **The sealed L3 smoke oracle and the INV-028 fresh-process UAT tool call the
   draft endpoint over raw HTTP** (`tests/integration/smoke.mjs`,
   `tests/integration/uat-fresh-process.mjs`) via a generic JSON POST helper that
   assumed a single JSON mutation response. A subscription-type procedure answers
   over SSE (`text/event-stream`) regardless of request method, and — confirmed
   directly from `@trpc/server`'s `resolveResponse` source —
   **always returns HTTP 200**, with typed errors surfaced as a `serialized-error`
   SSE frame in the body rather than a non-200 status. Fixed by adding
   `parseSSE`/`apiSubscribe` to `tests/integration/harness.mjs` and updating both
   scripts' draft call sites; the same pattern (`trpcSubscribe`, mirroring the
   existing local `trpcMutate`) was added to the 7 `scenarios/incubating/*/
   scenario.mjs` live-scenario scripts that draft as their first step, including
   fixing one assertion (`content-library-media-gap`) that relied on the now-wrong
   `res.status !== 200` invariant for a refused draft input.
4. Added `packages/llm/src/__tests__/anthropic.test.ts` (new file — no such test
   existed before this ticket) mocking `@anthropic-ai/sdk`'s `toolRunner` to assert
   the tool_use → `DraftStep` progress mapping, since `AnthropicLLM.draftItinerary`
   had zero prior test coverage of any kind.

None of this changes the plan's Constitution Check, data model, or contract — it is
exactly the "existing draft-flow tests stay green" acceptance criterion (FR-005),
just a much wider blast radius of call sites than the original task breakdown
assumed before implementation began.
