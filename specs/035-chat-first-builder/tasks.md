# Tasks: Chat-First, Multi-Turn Build-to-Book (Agent Surface)

**Feature**: `specs/035-chat-first-builder` | **Branch**: `kitchen/fix-goal-chat-first-builder-primary`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contract**: [contracts/interpret-chat-request-mutation.md](./contracts/interpret-chat-request-mutation.md)

Tests ARE requested (acceptance mandates L3 chat→draft→book coverage + keyless determinism). No canonical-schema / money-path / supply-adapter change (FR-012).

## Phase 1: Setup

- [ ] T001 Confirm the feature branch `kitchen/fix-goal-chat-first-builder-primary` is checked out off `origin/campaign/two-sided-surface` and the compose stack builds (`docker compose up --build --wait`) before any change — baseline green.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 Extend the tRPC input `interpretChatRequestInputSchema` in `packages/api/src/routers/itinerary.ts` to `z.strictObject({ message: z.string().min(1), priorMessages: z.array(z.string().min(1)).max(20).optional() })` (additive; absent ⇒ single-shot). Update the procedure's doc comment to note multi-turn (spec 035).
- [ ] T003 Update `interpretChatTripRequest` in `packages/api/src/services/planner.ts` to accept `{ message: string; priorMessages?: string[] }`, join `[...(priorMessages ?? []), message].join("\n")`, and pass the joined transcript as `message` to `container.llm.interpretTripRequest`. Everything downstream (date resolve, `tripRequestSchema.safeParse`, outcome) unchanged. `packages/llm` MUST remain untouched.

## Phase 3: User Story 1 — Multi-turn chat builds a trip and offers to proceed (P1) 🎯 MVP

**Goal**: From an empty state, the agent supplies details across turns; the system accumulates, resolves, and offers "Build my trip" into the existing pipeline.

**Independent test**: send destination in one message + budget in a later message → assistant accumulates, offers to proceed → "Build my trip" → compare view (1–3 options), zero form fields filled.

- [ ] T004 [P] [US1] Add a unit test in `packages/api/src/services/__tests__/interpret-chat-trip-request.test.ts` (new file) that calls `interpretChatTripRequest` with `{ message: "around 2000 EUR for 4 nights, 2 people", priorMessages: ["Plan a trip to Lisbon"] }` under `FakeLLM` and asserts `resolved` with destination Lisbon, party {2,0}, budget 200000 EUR; plus a case where only a destination is present ⇒ `needsInfo`, and a determinism case (same transcript twice ⇒ identical `tripRequest`).
- [ ] T005 [US1] Extend `packages/api/src/__tests__/l3-chat-first-entry.test.ts` (real Postgres) with a NEW case: a multi-turn `priorMessages` request resolves and is fed into the EXISTING `draftViaCaller` pipeline end-to-end (chat→draft→book handoff), asserting a drafted itinerary whose title contains the destination; keep the single-message back-compat case and the RBAC ladder case passing unchanged.
- [ ] T006 [US1] Rework `apps/web/app/(workspace)/workspace/chat-entry.tsx` to accumulate the agent's turns: keep an ordered `agentTurns: string[]`; each submit calls `interpretChatRequest.mutate({ message, priorMessages: <turns before this one> })`. On `needsInfo` append the reply and keep going. On `resolved`, store the `tripRequest`, append an assistant confirmation summarising it (destination, nights, party, budget), and render a **"Build my trip"** CTA (`data-testid="chat-build-cta"`) that calls `onResolved(tripRequest)`. A later message re-interprets the full transcript and replaces the pending resolved request (CTA always reflects the latest).
- [ ] T007 [US1] Preserve the busy/thinking state and in-flight guard (FR-010); reuse the existing `.tf-chat-*` theme classes; ensure `onResolved` still hands the resolved `tripRequest` to the SAME `startDraft` in `planner.tsx` (no pipeline fork, FR-004).

**Checkpoint**: US1 independently demonstrable — multi-turn chat → Build my trip → compare → choose → draft.

## Phase 4: User Story 2 — Chat primary; form behind a toggle; Discover → form mode (P2)

**Goal**: chat is the primary idle surface; the form is an option behind a toggle; a pre-seeded destination opens in form mode.

**Independent test**: idle with no `?destination=` → chat primary, form hidden until toggle; `?destination=` → form mode, destination pre-filled.

- [ ] T008 [US2] In `apps/web/app/(workspace)/workspace/planner.tsx`, add `entryMode: "chat" | "form"` state initialised to `initialDestination ? "form" : "chat"`. In the idle view, render `<ChatEntry onResolved={startDraft} />` as primary when `entryMode === "chat"` with a "Prefer a guided form?" toggle (`data-testid="entry-toggle-form"`).
- [ ] T009 [US2] Gate the structured `<form>` render on `entryMode === "form"` (rendered across all phases so it survives a draft failure — US3), with a "Build by chatting instead" toggle (`data-testid="entry-toggle-chat"`). Ensure `initialDestination` still pre-fills the destination field (spec 023 hand-off) and no other field changes.
- [ ] T010 [US2] Verify the discover-journey e2e still passes unchanged (arrives via `?destination=` → form mode → pre-filled Destination + defaulted other fields). No change to `discover-journey.spec.ts` expected.

**Checkpoint**: US2 demonstrable — chat primary by default; toggle to form and back; Discover lands on a pre-filled form.

## Phase 5: User Story 3 — Form path unchanged + keyless determinism (P2)

**Goal**: form behaves byte-identically (incl. failure survival); keyless multi-turn interpretation deterministic.

**Independent test**: run the form-driven draft/compare/choose/book journey unchanged; infeasible budget → one message + form survives; same conversation twice → identical resolved params.

- [ ] T011 [US3] Update the shared e2e helper `draftParisTrip` in `tests/e2e/support.ts` to open the structured form via the toggle (`data-testid="entry-toggle-form"`) right after `goto("/workspace")`, before filling fields (fixes all ~12 helper-using specs at one site).
- [ ] T012 [US3] Update `tests/e2e/planner-journey.spec.ts` (US1 + US2 tests) to open the form via the toggle after each `goto("/workspace")` before asserting the Draft button / filling the form; keep the failure-survival assertion (form retained) and the signed-out negative (US3) intact.
- [ ] T013 [US3] Add `tests/e2e/chat-first-journey.spec.ts` (NEW): from a fresh signed-up agency on `/workspace`, drive the multi-turn chat (turn 1 destination, turn 2 budget) → assert clarifying reply then confirmation + "Build my trip" → click it → compare → choose → `draft-result`, all without touching the form; plus assert the "Prefer a guided form?" toggle reveals the form. Add a `KITCHENLOOP-COVERAGE` block only if it matches the existing `spec.dimensions` vocabulary (else omit — see GROUP-TRAVEL-DIMENSION desk lesson).

**Checkpoint**: US3 green — form regression-free; keyless determinism proven by T004/T005.

## Phase 6: Polish & Cross-Cutting

- [ ] T014 Run `pnpm run lint` and `pnpm test` in the built image (all L1/L2/L3 green, incl. the new/changed suites) and the full Playwright e2e suite against the compose stack (INV-027) — no weakened assertions.
- [ ] T015 Live Test & Fix (INV-027): boot the built stack, browser-QA Scenarios A/B/C from quickstart.md with per-step screenshots to the evidence dir, scan compose logs against the allowlist, fix any defect in-cycle (max fix cycles), record the Live Test Evidence verdict in the PR body.
- [ ] T016 Author the UAT card `.kitchenloop/uat-cards/goal-chat-first-builder.md` (browser steps for the multi-turn chat build; no long-token transcription; pin exact copy) and run the zero-context `uat-evaluator`.

## Dependencies

- Phase 2 (T002–T003) blocks all user stories (shared input/service surface).
- US1 (Phase 3) is the MVP; US2 (Phase 4) and US3 (Phase 5) build on the same `planner.tsx`/`chat-entry.tsx` but are independently testable.
- T011–T013 (e2e) depend on the UI changes (T006/T008/T009) existing.
- Phase 6 gates the PR.

## Parallel opportunities

- T004 [P] (unit test) can be written alongside T002/T003.
- Within US2/US3 the e2e helper edits (T011) and the new journey (T013) touch different files and can proceed in parallel once the UI is in place.

## MVP scope

**User Story 1** alone (Phases 1–3) delivers the core value: an agent builds a whole trip via multi-turn chat and proceeds to booking. US2/US3 make it the *primary* surface and guarantee no form regression.
