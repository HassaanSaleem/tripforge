# Tasks: Conversational AI Itinerary Editing

**Input**: Design documents from `/specs/020-chat-itinerary-editing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — this repo's quality bar (`.kitchenloop/unbeatable-tests.md`,
`.claude/skills/kitchenloop-execute/SKILL.md`) mandates L1/L2 unit/service
coverage plus an L3 integration test for any change touching an integration
point (here: two new tRPC procedures + DB persistence).

**Organization**: Tasks are grouped by user story so each story is
independently completable and testable, per plan.md's Project Structure.

## Phase 1: Setup

No new project/package/tooling setup required — this feature extends
existing files in `packages/domain`, `packages/llm`, `packages/api`, and
`apps/web` only (per plan.md Structure Decision). Skipping straight to
Foundational.

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Add the shared vocabulary and plumbing every user story needs —
the domain edit-application function, the new `LLMPort` method (both
implementors, since TypeScript requires full interface conformance before
anything compiles), the service-layer generator/mutation, and the two new
router procedures. No user story is independently testable until this lands.

- [X] T001 Add `applyItineraryEdit()` pure function to `packages/domain/src/edit.ts` (new file): handles `removeItem` (find by `id` across `itinerary.days`, refuse with `item_not_found` if absent, refuse with `empty_result` if it would leave the trip with zero items anywhere) and `addItem` (verify the offer against a passed-in `VerifiedOffer[]`, convert currency, construct the Item using the SAME per-port shape `assembleItinerary` builds in `packages/domain/src/assemble.ts` lines 169-209, fold in the hotel-replaces-existing-stay rule from research.md D6). Reuse `categoryForPort`/`rebalanceAllocations`/`allocationsTotalMinor` from `packages/domain/src/budget.ts` and `CategoryFit`/`RebalanceMove`/`VerifiedOffer` types from `assemble.ts` (data-model.md "ApplyEditOutcome") — do not redefine them. Export `ItineraryEditProposal`/`ApplyEditResult` types and the function from `packages/domain/src/index.ts`.
- [X] T002 [P] Add `ChatEditRequest`/`ChatEditResult`/`ChatEditProposal`/`HotelSuggestion` types to `packages/llm/src/chat-edit.ts` (new file), and `ChatEditStep`/`ChatEditProgressEvent`/`LLMPort.chatEditItinerary()` to `packages/llm/src/port.ts` (data-model.md), mirroring `DraftStep`/`DraftProgressEvent`/`LLMPort.draftItinerary` exactly (progress events, then one terminal result event)
- [X] T003 [P] Implement `FakeLLM.chatEditItinerary` in `packages/llm/src/fake.ts`: deterministic keyword-rule interpreter over the lowercased message (research.md D7) — remove/delete → item-id lookup by title-substring match against the itinerary summary; swap/replace/suggest + hotel/stay → call `tools.searchHotelRates` and return 2-3 `HotelSuggestion`s (cheapest-first, excluding the current stay's offerId if present); add + transfer/transport/taxi/car keywords → `tools.quoteTransfer` + cheapest-not-already-present pick; add + anything else → `tools.searchActivities` + cheapest-not-already-present pick, with "day N" extracted from the message text (default day 1, clamped to the itinerary's day count); no match → fixed clarifying reply, `edit: null`, `suggestions: []`. Zero `Math.random()`/wall-clock reads.
- [X] T004 [P] Implement `AnthropicLLM.chatEditItinerary` in `packages/llm/src/anthropic.ts` plus a new `packages/llm/src/tools/propose-itinerary-edit.ts` (mirrors `submit-itinerary-drafts.ts`'s captured-result pattern): system prompt explains the three supported outcomes (direct add/remove, hotel suggestions, clarify) and reuses the EXISTING `searchHotelRatesTool`/`searchActivitiesTool`/`quoteTransferTool` plus the new propose-edit tool, bounded by the existing `MAX_TOOL_ITERATIONS` loop
- [X] T005 Add `interpretChatEdit()` (streamed generator) and `applyChatEdit()` (direct function) to `packages/api/src/services/itineraries.ts` (extend, not a new file — Pre-Write "extend", this file already owns `loadOwnedItinerary`/`persistDocument`): `interpretChatEdit` loads the itinerary via the EXISTING `loadOwnedItinerary`, builds the `{id,kind,title,dayNumber}` summary, calls `container.llm.chatEditItinerary`, and on a terminal result either applies via `applyChatEdit` + `persistDocument` and yields `"applied"`, or yields `"suggested"`/`"no_change"`/`"failed"` with zero DB writes (contracts/chat-edit-subscription.md); `applyChatEdit` loads the itinerary, re-derives `VerifiedOffer[]` via a `canonicalCriteria`-style fresh supply search keyed off the itinerary's persisted `trip_request` column, calls `applyItineraryEdit`, and persists on `"applied"` (contracts/apply-chat-edit-mutation.md) — cross-tenant/unknown `itineraryId` is `{status:"not_found"}` in both, no existence oracle (INV-004)
- [X] T006 Add `chatEdit` (subscription) and `applyChatEdit` (mutation) procedures to `packages/api/src/routers/itinerary.ts`, wired to T005's service functions, `agentProcedure`-gated identically to `attachMedia`/`detachMedia`
- [X] T007 Add typed `ChatEditEvent`/`ChatEditOutcome`/`HotelSuggestion`/`ApplyChatEditOutcome` re-exports to `apps/web/lib/trpc/client.ts` (mirrors the existing `DraftEvent`/`DraftOutput` export pattern)
- [X] T008 Run `pnpm --filter @tripforge/domain test`, `pnpm --filter @tripforge/llm test`, and `pnpm --filter @tripforge/api test` to confirm the foundational plumbing compiles and no existing test regressed before starting any user story

**Checkpoint**: `chatEdit`/`applyChatEdit` are callable end-to-end (both LLM implementors satisfy the interface); nothing in the UI surfaces them yet.

## Phase 3: User Story 1 - Add or remove an item by chatting (Priority: P1)

**Goal**: A chat panel next to a saved itinerary applies direct add/remove
edits immediately, with the assistant confirming what changed.

**Independent Test** (spec.md US1): open a saved itinerary, ask the chat to
add an activity to a specific day, verify it appears; ask it to remove an
existing item by name, verify it's gone; both changes survive a reload.

- [X] T009 [US1] Create `apps/web/app/(workspace)/workspace/chat-panel.tsx` (new file): message list (agent/assistant turns, session-scoped React state per spec Assumptions — no persistence), a text input + submit, and a "thinking…" indicator (FR-014) shown while a `chatEdit` subscription is in flight, following the existing `tf-*` design-system class conventions
- [X] T010 [US1] Wire `ChatPanel` into `apps/web/app/(workspace)/workspace/planner.tsx`'s `DraftResult` section (keyed by `itinerary.id`, same convention as `BookingFlow`/`ShareControl`): on submit, call `trpc.workspace.itinerary.chatEdit.subscribe({itineraryId, message}, {onData, onError, onComplete})` using the SAME `activeSubscription`-ref unsubscribe-on-unmount guard already in the component; on an `"applied"` terminal result, replace the currently-displayed `itinerary`/`fit` in view state with the new ones from the outcome so `DraftResult`'s existing day list and budget table re-render with no separate refetch; append the assistant's `reply` to the chat message list for every terminal outcome (`applied`/`suggested`/`no_change`/`failed`)
- [X] T011 [P] [US1] Add `packages/domain/src/__tests__/edit.test.ts` (new file): `removeItem` removes the correct item and reduces its category's spend, unknown `itemId` → `item_not_found` (itinerary unchanged, reference-equal or deep-equal check), removing the only item across every day → `empty_result` (itinerary unchanged); `addItem` (activity/transfer) converts currency like `assembleItinerary` does, rebalances via `rebalanceAllocations` when the category would overrun (buffer-first, flights reserve untouched), and the allocation total is conserved before/after (mirrors `assembleItinerary`'s own conservation guard)
- [X] T012 [P] [US1] Add `packages/llm/src/__tests__/chat-edit.test.ts` (new file): `FakeLLM.chatEditItinerary` resolves "add a food tour on day 2"-style messages to an `addItem` edit on the correct day, "remove the [title]"-style messages to a `removeItem` edit targeting the correct existing `id`, and an unmatched-title removal request to `edit: null` with a clarifying reply (spec.md US1 acceptance scenario 3)
- [X] T013 [P] [US1] Add `packages/api/src/__tests__/l3-chat-edit.test.ts` (new file): `chatEdit` against a cross-tenant or unknown `itineraryId` yields `{status:"not_found"}` with zero DB writes (mirrors `attachMedia`/`detachMedia`'s existing L3 assertions); an `"applied"` add/remove outcome updates exactly the target itinerary's `document` column (no new row) and the change is visible on a subsequent `loadOwnedItinerary` read (persistence, spec.md SC-005)

**Checkpoint**: Direct add/remove via chat is fully functional and independently verifiable.

## Phase 4: User Story 2 - Swap the hotel via inline suggestions (Priority: P1)

**Goal**: Hotel-related chat requests show 2-3 suggestion cards; clicking
"Add to trip" on one replaces the current stay via a direct, LLM-free mutation.

**Independent Test** (spec.md US2): ask the chat about hotel options, verify
suggestion cards render without changing the itinerary; click "Add to trip"
on one, verify the stay is replaced and the change persists.

- [X] T014 [US2] Extend `ChatPanel` (`apps/web/app/(workspace)/workspace/chat-panel.tsx`) to render a `"suggested"` terminal outcome's `suggestions` as inline cards (name, `formatMinorAmount` price) within the assistant's chat turn, each with an "Add to trip" button
- [X] T015 [US2] Wire each suggestion card's "Add to trip" button to `trpc.workspace.itinerary.applyChatEdit.mutate({itineraryId, edit: {type:"addItem", dayNumber, port:"hotel", offerId}})` (dayNumber taken from the current stay's day if one exists, else day 1 per research.md D6); on success, replace the displayed `itinerary`/`fit` exactly as T010 does for `chatEdit`'s `"applied"` outcome; surface `"item_not_found"`/`"invalid_edit"` as a plain error line in the chat
- [X] T016 [P] [US2] Extend `packages/domain/src/__tests__/edit.test.ts`: an `addItem` with `port:"hotel"` when a stay item already exists removes the old stay and inserts the new one on the same day (research.md D6), conserving the allocation total; an `addItem` with `port:"hotel"` when NO stay exists yet simply adds it
- [X] T017 [P] [US2] Extend `packages/llm/src/__tests__/chat-edit.test.ts`: "swap the hotel for something boutique near the water" and "suggest a hotel" both resolve to `edit: null` plus 2-3 distinct `HotelSuggestion`s excluding the current stay's offerId, with the SAME two message variants producing the same suggestion set when the itinerary state is unchanged
- [X] T018 [P] [US2] Extend `packages/api/src/__tests__/l3-chat-edit.test.ts`: `applyChatEdit` re-derives the offer from a fresh supply search rather than trusting a client-supplied price (assert the persisted item's price matches the server's own search result, not any client-passed value); a cross-tenant `itineraryId` → `{status:"not_found"}`; an `offerId` that no longer exists in a fresh search → `{status:"invalid_edit"}`, zero DB writes

**Checkpoint**: Both P1 stories (direct edits + hotel suggestions) are complete; the ticket's full acceptance scenario (add, remove, swap-via-card) is exercisable end-to-end.

## Phase 5: User Story 3 - Budget stays visible and accurate after every edit (Priority: P2)

**Goal**: The existing budget-fit table re-displays, accurately, immediately
after every applied edit — no manual refresh, no re-running the planner.

**Independent Test** (spec.md US3): apply an edit that pushes a category over
its allocation; verify the budget summary shown right after reflects the new
spend and the category's over/under-budget state.

- [X] T019 [US3] Confirm (and adjust if needed) that T010/T015's "replace the displayed itinerary/fit" step re-renders the EXISTING `tf-fit-table` budget table in `planner.tsx`'s `DraftResult` component unchanged (reuse, not a new component) — the table already reads `fit.categories` from whatever outcome is in view state, so no new UI is needed, only confirming the wiring from T010/T015 actually feeds it
- [X] T020 [P] [US3] Extend `packages/domain/src/__tests__/edit.test.ts`: an `addItem` that pushes a category over its allocation returns `fit.categories` with that category's `state: "overTarget"` (mirrors `assembleItinerary`'s own `CategoryFit` derivation) and a non-empty `rebalances` list when a donor category had headroom; a `removeItem` reduces `spentMinor` for the correct category without changing `allocatedMinor`

**Checkpoint**: All three P1/P2-core stories verified; budget accuracy holds across every edit path.

## Phase 6: User Story 4 - Works without a live AI key (Priority: P2)

**Goal**: The full chat-edit flow (add, remove, hotel suggestions) is
deterministic and reproducible with no `ANTHROPIC_API_KEY` configured.

**Independent Test** (spec.md US4): with no LLM API key, run the same chat
request twice against identical starting itineraries; verify identical
outcomes.

- [X] T021 [P] [US4] Add a `packages/llm/src/__tests__/chat-edit.test.ts` case: `FakeLLM.chatEditItinerary` called twice with an identical `ChatEditRequest` (same message, same itinerary summary, same injected tool results) returns byte-identical results (same edit/suggestions/reply) — no `Math.random()`/wall-clock dependency anywhere in T003's logic

**Checkpoint**: All four user stories independently verified.

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T022 Run `pnpm run lint` and `pnpm test` (root, full workspace) and fix any fallout across `packages/domain`, `packages/llm`, `packages/api`, `apps/web`
- [X] T023 Live Test & Fix (INV-027): boot the built compose stack keyless, drive quickstart.md scenarios 1-4 via Playwright MCP with per-step screenshots into `.kitchenloop/evidence/5/demo-03-chat-builder/`, scan compose logs for non-allowlisted ERROR lines, fix any defect found and re-verify (max 3 cycles)
- [X] T024 Update `specs/020-chat-itinerary-editing/checklists/requirements.md` and mark this tasks.md's items complete; record the PR's spec-alignment table (FR-001..FR-014 → implementing file(s) → test(s))

## Dependencies & Execution Order

- **Phase 2 (Foundational) blocks every user story** — `LLMPort.chatEditItinerary` must exist on BOTH implementors (T003/T004) and the router procedures (T006) must exist before any UI wiring (T009+) or L3 test (T013+) has anything to call.
- **Phase 3 (US1) blocks Phase 4 (US2)** only in the sense that both extend the SAME `chat-panel.tsx` file (T009 creates it, T014 extends it) — they are sequenced for file-conflict reasons, not because US2 depends on US1's behavior; each has its own independent test criteria per spec.md and US2's mutation path (`applyChatEdit`) works even if US1's direct-edit path were absent.
- **Phase 5 (US3)** only needs Phase 3/4's view-state wiring (T010/T015) to already replace `itinerary`/`fit` — it adds no new procedure, only tests + a wiring confirmation.
- **Phase 6 (US4)** only needs Phase 2 (FakeLLM, T003) — it can run in parallel with Phase 3/4/5 once Phase 2 lands.
- **Phase 7 (Polish)** runs last, after all user stories.

## Parallel Execution Examples

- Within Phase 2: T002 (llm types), T003 (FakeLLM), and T004 (AnthropicLLM) touch different files and can run in parallel once T001 (domain edit.ts) lands, since both LLM implementations only need the shared types, not each other.
- Within Phase 3: T011 (domain unit test), T012 (FakeLLM unit test), and T013 (L3 test) touch different files/packages and can run in parallel once T009-T010 land.
- Within Phase 4: T016, T017, and T018 are independent test files and can run in parallel once T014-T015 land.

## Implementation Strategy

**MVP = Phase 2 + Phase 3 + Phase 4** (both P1 user stories) — a chat that
only adds/removes but can never touch the trip's hotel, or one that only
handles hotels but nothing else, delivers half the ticket's acceptance
scenario; they ship together in this PR. Phase 5 (P2, budget-display
confirmation) and Phase 6 (P2, determinism tests) close out the same PR since
this is a single feature-sized ticket per the batching policy (not bundled
with other tickets). Phase 7 (polish/live-test) closes the cycle.
