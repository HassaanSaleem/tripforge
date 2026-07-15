# Tasks: Chat-First AI Itinerary Entry

**Input**: Design documents from `/specs/028-chat-first-entry/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — this repo's quality bar (`.kitchenloop/unbeatable-tests.md`,
`.claude/skills/kitchenloop-execute/SKILL.md`) mandates L1/L2 unit/service
coverage plus an L3 integration test for any change touching an integration
point (here: one new tRPC mutation).

**Organization**: Tasks are grouped by user story so each story is
independently completable and testable, per plan.md's Project Structure.

## Phase 1: Setup

No new project/package/tooling setup required — this feature extends
existing files in `packages/llm`, `packages/api`, and `apps/web` only (per
plan.md Structure Decision). Skipping straight to Foundational.

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Add the shared vocabulary every user story needs — the new
`LLMPort` method's types and interface addition. TypeScript requires both
`FakeLLM` and `AnthropicLLM` to conform before anything compiles, so both
implementations land here too (US1's story-specific behavior is the DEPTH of
`FakeLLM`'s extraction rules, added in Phase 3 tests, not the method's mere
existence).

- [ ] T001 Add `InterpretedTripParamsSchema`/`InterpretedTripParams`/`InterpretTripRequestResult` to `packages/llm/src/interpret-trip-request.ts` (new file, mirrors `chat-edit.ts`'s structure) — per data-model.md
- [ ] T002 Add `InterpretTripRequestRequest` type and `interpretTripRequest(req): Promise<InterpretTripRequestResult>` to `LLMPort` in `packages/llm/src/port.ts` (plain `Promise`, NOT an `AsyncGenerator` — research.md D2)
- [ ] T003 [P] Add `interpretTripRequestTool` (forced-tool schema) to `packages/llm/src/tools/interpret-trip-request.ts` (new file, mirrors `tools/propose-itinerary-edit.ts`'s captured-result pattern), using `InterpretedTripParamsSchema`
- [ ] T004 Export `InterpretedTripParamsSchema`/`InterpretedTripParams`/`InterpretTripRequestResult`/`InterpretTripRequestRequest` from `packages/llm/src/index.ts`
- [ ] T005 Implement `FakeLLM.interpretTripRequest` in `packages/llm/src/fake.ts`: deterministic regex/keyword extractor (research.md D7) — destination via `" in "`/`" to "` pattern, nights via `\d+\s*(day|night)s?` regex (days→nights-1, min 1; default 4), party via `for\s+(\d+)` (default adults 2, children 0), budget via currency-code/symbol + amount regex (default currency EUR), trip style via boutique/luxury→premium, budget/cheap→budget keyword match; returns `needsInfo` with a reply naming the missing piece when no destination or no budget amount is found; zero `Math.random()`/wall-clock reads
- [ ] T006 [P] Implement `AnthropicLLM.interpretTripRequest` in `packages/llm/src/anthropic.ts`: ONE `client.beta.messages.create()` call with `tool_choice` forcing the `interpretTripRequestTool` (mirrors `complete()`'s single-call shape, NOT the `toolRunner` loop `draftItinerary`/`chatEditItinerary` use — no supply search happens here), plus a stable system prompt explaining the resolved/needsInfo/failed outcomes
- [ ] T007 Run `pnpm --filter @tripforge/llm build` and `pnpm --filter @tripforge/llm test` to confirm the foundational plumbing compiles and no existing test regressed before starting any user story

**Checkpoint**: `LLMPort.interpretTripRequest` is callable end-to-end against both implementors; nothing in the API or UI surfaces it yet.

## Phase 3: User Story 1 - Start a trip by chatting instead of filling the form (Priority: P1)

**Goal**: From the AI Builder's landing view, a chat message resolves into
the same compare view (spec 019) the structured form already produces.

**Independent Test** (spec.md US1): submit a chat message naming a
destination and a budget from the landing view; verify the compare view
renders 1-3 options; choosing one persists/books/shares/refines exactly as
the form path does.

- [ ] T008 [US1] Add `interpretChatTripRequest()` to `packages/api/src/services/planner.ts` (extend, not a new file — Pre-Write "extend", this file already owns `tripRequestSchema`/`toTripRequest`-equivalent conversion logic): calls `container.llm.interpretTripRequest`, on `resolved` computes `checkIn`/`checkOut` from `params.nights` + `new Date()` (checkIn = now + 21 days, per research.md D3), maps `budgetMajor`→`amountMinor` via a shared currency-minor-unit helper (extract the existing rounding logic `apps/web/lib/planner-form.ts`'s `toTripRequest` uses into a location both the web app and this service can call, OR duplicate the single-line `Math.round` conversion with a comment pointing at the web helper if extraction would cross the web/api package boundary — decide and note the choice inline), validates the result through `tripRequestSchema.parse(...)`, and returns `InterpretChatOutcome` (data-model.md); `needsInfo`/`failed` pass through unchanged
- [ ] T009 [US1] Add `interpretChatRequest` mutation to `packages/api/src/routers/itinerary.ts`, `agentProcedure`-gated, wired to T008's service function (contracts/interpret-chat-request-mutation.md)
- [ ] T010 [US1] Add typed `InterpretChatRequestOutput` export to `apps/web/lib/trpc/client.ts` (mirrors the existing `DraftEvent`/`DraftOutput` export pattern)
- [ ] T011 [US1] Refactor `apps/web/app/(workspace)/workspace/planner.tsx`: extract the body of `handleSubmit`'s `trpc.workspace.itinerary.draft.subscribe(...)` call (including the `activeSubscription` ref guard and `onData`/`onError`/`onComplete` handling) into a `startDraft(tripRequest: DraftInput)` function; `handleSubmit` becomes `toTripRequest(values)` validation + calling `startDraft` (research.md D5) — no behavior change, verified by existing planner tests still passing
- [ ] T012 [US1] Create `apps/web/app/(workspace)/workspace/chat-entry.tsx` (new file): a chat-style input + message list (mirrors `chat-panel.tsx`'s `.tf-chat*` presentation conventions), visible only on the planner's `idle` phase; on submit, calls `trpc.workspace.itinerary.interpretChatRequest.mutate({message})`, shows a "thinking" indicator while in flight (spec FR-009), and on `resolved` calls `startDraft(tripRequest)` (passed down as a prop from `planner.tsx`)
- [ ] T013 [US1] Wire `ChatEntry` into `apps/web/app/(workspace)/workspace/planner.tsx`'s `idle`-phase render, alongside (not replacing) the existing structured form, passing `startDraft` down as a prop
- [ ] T014 [P] [US1] Add `packages/llm/src/__tests__/interpret-trip-request.test.ts` (new file): `FakeLLM.interpretTripRequest` resolves the ticket's own example ("Plan 4 days in Lisbon for 2, ~EUR2000, boutique stay") to `{destination:"Lisbon", nights:4 (or per days-to-nights rule), adults:2, children:0, tripStyle:"premium", budgetMajor:2000, currency:"EUR"}`; a message naming only destination+budget resolves with the documented defaults (research.md D4); repeated calls with the same message produce identical `params` (determinism)
- [ ] T015 [P] [US1] Add `packages/api/src/__tests__/l3-chat-first-entry.test.ts` (new file): `interpretChatRequest` requires agent authentication (unauthenticated/non-agent caller rejected, matches every other `workspace.itinerary.*` gate); a `resolved` output's `tripRequest` passes `tripRequestSchema` validation and, fed into `draftOptions`, reaches a real `"drafted"` compare outcome end-to-end (proves the two entry points are genuinely wired together, not just type-compatible)

**Checkpoint**: An agent can go from the AI Builder landing view to a live-priced compare view using only chat; the structured form is provably unmodified in behavior (T011 is a pure refactor).

## Phase 4: User Story 2 - Clarify instead of guessing when required details are missing (Priority: P2)

**Goal**: A chat message missing a destination or a budget gets a clarifying
reply instead of an attempted (and likely broken) draft.

**Independent Test** (spec.md US2): submit a chat message missing a
destination (or a budget); verify the reply names the missing piece and the
AI Builder stays on the landing view.

- [ ] T016 [P] [US2] Extend `packages/llm/src/__tests__/interpret-trip-request.test.ts`: a message with no identifiable destination yields `needsInfo` with a reply mentioning "destination"; a message with a destination but no identifiable budget amount yields `needsInfo` with a reply mentioning "budget"; a wholly off-topic message ("what's the weather") also yields `needsInfo`
- [ ] T017 [US2] Extend `chat-entry.tsx` (T012): on a `needsInfo` outcome, append the `reply` as an assistant-style message in the local message list and leave the input ready for a new message — no draft attempted, planner phase stays `idle` (spec FR-004)
- [ ] T018 [P] [US2] Extend `packages/api/src/__tests__/l3-chat-first-entry.test.ts`: `interpretChatRequest` with a destination-less message returns `{status:"needsInfo"}` with zero calls into `draftOptions`/the database

**Checkpoint**: Both P1 and P2's core guardrail are complete — chat-first entry resolves real requests and safely declines incomplete ones.

## Phase 5: User Story 3 - Works without a live AI key (Priority: P2)

**Goal**: The keyless/FakeLLM deployment supports chat-first entry
deterministically, with zero network calls.

**Independent Test** (spec.md US3): with no live LLM API key configured,
submit the same chat message twice; verify both interpretations are
identical.

- [ ] T019 [US3] Confirm (no new production code — this story is satisfied by T005's design + explicit test coverage) `packages/llm/src/__tests__/interpret-trip-request.test.ts` includes a dedicated determinism assertion: two calls with an identical message and no scripted responses produce byte-identical `InterpretedTripParams` (already partially covered by T014; this task closes any gap — e.g. explicitly asserting zero `usage.inputTokens`/`outputTokens` non-determinism artifacts and that `FakeLLM` never calls `Date.now()`/`new Date()` internally per research.md D3)

**Checkpoint**: All three user stories are independently verifiable; the keyless demo path is provably deterministic at the LLM boundary.

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T020 [P] Run `pnpm run lint` and fix any violations introduced by T001-T019
- [ ] T021 [P] Run the full `pnpm test` suite (all packages) to confirm zero regressions, per plan.md's Testing section
- [ ] T022 Live Test & Fix per INV-027 (`.claude/skills/kitchenloop-execute/SKILL.md` step 4e, execute-phase — not a task file edit): boot the built compose stack, drive quickstart.md's scenarios 1-3 in a real browser, screenshot evidence, scan compose logs

## Dependencies & Execution Order

- **Phase 1 (Setup)**: none — skipped.
- **Phase 2 (Foundational)**: T001 → T002 → T003 [P with T002 once T001 lands] → T004 → T005 [P with T006] → T006 [P with T005] → T007. BLOCKS all user stories.
- **Phase 3 (US1, P1)**: depends on Phase 2 (T007 checkpoint). T008 → T009 → T010 → T011 [P with T008-T010, different file] → T012 (depends on T010's client types) → T013 (depends on T011 + T012) → T014 [P] → T015 [P]. This is the MVP — ships real value alone.
- **Phase 4 (US2, P2)**: depends on Phase 3 (reuses `chat-entry.tsx` from T012, `interpretChatRequest` from T009). T016 [P] → T017 → T018 [P].
- **Phase 5 (US3, P2)**: depends on Phase 2 only (T005's FakeLLM implementation) — could technically run in parallel with Phase 3/4's non-LLM tasks, but is sequenced last here since it is pure test-coverage closing a guarantee already designed-in.
- **Phase 6 (Polish)**: depends on all prior phases.

## Implementation Strategy

**MVP = Phase 1 + 2 + 3 (User Story 1 only)**: this alone closes the
operator's ask ("chat interface... to add through chat") — an agent can
start a trip by chatting. Phases 4-5 harden the MVP (graceful clarification,
proven determinism) but the feature is demoable and mergeable after Phase 3
if time is constrained; do not ship without Phase 3's L3 test (T015), which
is what proves the two entry points are actually wired together end-to-end
rather than merely type-compatible.
