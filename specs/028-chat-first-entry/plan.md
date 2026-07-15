# Implementation Plan: Chat-First AI Itinerary Entry

**Branch**: `kitchen/fix-ai-builder-chat-first-entry` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-chat-first-entry/spec.md`

## Summary

Today the AI Builder's landing view has exactly one entry point: the structured
form (destination/dates/party/style/budget), which drives
`workspace.itinerary.draft` → compare 1-3 options (spec 019) → `selectDraft`
persists the choice → the existing `ChatPanel` (spec 020) then handles all
post-draft refinement. This feature adds a SECOND entry point on the SAME
landing view: a chat box. One new non-streaming `LLMPort` method,
`interpretTripRequest`, maps a single natural-language message to either a
resolved parameter set or a "needs more info" reply — never a supply-search
tool loop, so it does not need to stream (INV-028 governs handlers that drive
a tool loop; this one doesn't). A new service function turns a resolved
interpretation into the exact same `TripRequest` shape the form already
produces (filling unstated fields with the form's own defaults), and the
client feeds that request into the EXISTING `draft` subscription — the
compare/select/book/share/refine flow downstream is untouched. No canonical
itinerary schema change; no new persisted entity.

## Technical Context

**Language/Version**: TypeScript (Node.js, pnpm workspace monorepo)

**Primary Dependencies**: tRPC (mutation for interpretation; the existing SSE
subscription for drafting), Zod, existing `@tripforge/llm`
(LLMPort/FakeLLM/AnthropicLLM), React (Next.js app router) for the chat-entry
component — no new package dependency.

**Storage**: N/A for this feature's own surface — a chat trip request is
never persisted (spec Key Entities); it only produces the same `TripRequest`
value the structured form already produces in-memory before calling `draft`.

**Testing**: Vitest (L1 — `FakeLLM.interpretTripRequest` deterministic
extraction; L2 — the new service function's default-filling and date
resolution; L3 — `packages/api/src/__tests__/l3-*.test.ts` pattern for the new
`interpretChatRequest` mutation, tenant-scoping), Playwright (live/UAT
journey: chat-first entry reaching the compare view).

**Target Platform**: Web (Next.js app in `apps/web`), tRPC API
(`packages/api`), Docker Compose for live verification.

**Project Type**: Web application (existing turborepo). No new package.

**Performance Goals**: Interpretation is a single LLM call (no tool loop, no
supply search) — one round trip, well under the existing `draft` subscription's
own per-step latency envelope; the subsequent draft/select pipeline is
byte-identical to today's form path and inherits its existing performance
characteristics.

**Constraints**: INV-013 (LLM calls only via LLMPort, pinned model
`claude-haiku-4-5`); INV-028 (a handler that drives an LLM TOOL LOOP must
stream) — `interpretTripRequest` explicitly does NOT drive a tool loop (no
supply search happens during interpretation), so it is correctly a plain
mutation, not a subscription — documented here so a future reader does not
mistake this for an INV-028 violation; INV-005 (no supplier API shapes cross
the LLM package boundary — `interpretTripRequest` returns only text-derived
scalars: destination string, nights count, party counts, style enum, budget
major-unit number, currency code); INV-023 (agent-gated procedure); INV-004
(tenant-scoped — inherited for free since the result never touches the
database; the resolved request is scoped only when it reaches the EXISTING
`draft`/`selectDraft` procedures, unchanged); INV-001 (no canonical itinerary
schema change — this feature never constructs or touches an `Itinerary`
document, only the pre-existing `TripRequest` input shape).

**Scale/Scope**: Single feature touching `packages/llm` (new port method +
FakeLLM/AnthropicLLM implementations + one new structured-output tool),
`packages/api` (new service function in the existing `services/planner.ts` +
one new router mutation), `apps/web` (small chat-entry addition to
`planner.tsx`, refactoring `handleSubmit`'s subscribe logic into a
reusable helper so both entry points call the same code). No new package, no
schema version bump.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First**: N/A direct marketplace impact, but strengthens
  Principle II (agent tool polish) — this is the operator's explicit ask.
  PASS.
- **II. Agent Experience Is the Wedge**: Closes a named gap in the AI
  Builder's headline tool (chat-first drafting) without regressing
  time-to-client-ready-itinerary — the form path is untouched, and the chat
  path reaches the SAME compare view the form does, just via a different
  input method. PASS.
- **III. Budget-Aware AI, Priced Against Reality**: The interpretation step
  produces ONLY the request parameters (destination/dates/party/style/budget)
  — it never proposes a priced item itself. Every price and inventory item in
  the resulting itinerary still comes from the EXISTING budget-allocator +
  live-supply-verification pipeline (`plannerCore`/`draftOptions`), unchanged.
  PASS.
- **IV. Canonical Itinerary Schema**: No schema change. This feature produces
  a `TripRequest` (the pre-existing, already-validated input to `draft`) —
  the same shape `toTripRequest()` already builds from form values. It never
  constructs, reads, or migrates an `Itinerary` document. **No migration note
  required.** This explicitly resolves the ticket's own flagged HALT
  condition: research confirmed no schema change is needed (see
  research.md Decision 1), so this is NOT an operator-gate HALT.
- **V. Integrate Supply, Don't Contract It**: No new supplier surface —
  `interpretTripRequest` never calls a supply port; it maps text to scalars
  only. The AnthropicLLM implementation's structured-output tool schema
  carries `{destination, nights, adults, children, tripStyle?, budgetMajor,
  currency}` — no supplier payload shape crosses the LLM package boundary.
  PASS.
- **VI. Trust, Provenance & Revenue-Share Integrity**: Not a money-movement
  path — the interpretation step produces a request, not a price; every price
  the agent eventually sees/books still flows through the existing
  supply-verification + booking pipeline, which already carries its own L3
  money-path tests, unaffected by this feature. PASS.
- **PMF instrumentation (Governance)**: No new PMF event type — the existing
  `trip_created` event still fires once, at `selectDraft` time, regardless of
  which entry point produced the `TripRequest`. PASS.

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/028-chat-first-entry/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/llm/src/
├── port.ts                    # LLMPort: + interpretTripRequest() — plain
│                               #   async method (NOT a generator/stream; no
│                               #   tool loop runs during interpretation)
├── interpret-trip-request.ts  # NEW: InterpretTripRequestResult/Interpreted
│                               #   TripParams zod types (mirrors chat-edit.ts)
├── fake.ts                    # FakeLLM.interpretTripRequest: deterministic
│                               #   regex/keyword extractor (mirrors
│                               #   chatEditItinerary's keyword-rule style)
├── anthropic.ts                # AnthropicLLM.interpretTripRequest: ONE
│                               #   forced-tool-call (betaZodTool), no runner
│                               #   loop needed (mirrors complete()'s single
│                               #   client.messages.create() shape, but with
│                               #   a forced tool_choice for structured output)
└── tools/interpret-trip-request.ts  # NEW: forced-tool schema (mirrors
                                #   propose-itinerary-edit.ts's captured-
                                #   result pattern)

packages/api/src/services/
└── planner.ts                  # EXTEND (Pre-Write "extend"): add
                                #   interpretChatTripRequest() — calls
                                #   container.llm.interpretTripRequest, fills
                                #   defaults (mirrors toTripRequest()'s
                                #   defaults), resolves nights -> checkIn/
                                #   checkOut via `new Date()` (no clock
                                #   injection exists in Container; matches
                                #   existing direct Date.now()/new Date() use
                                #   in services/booking/*.ts)

packages/api/src/routers/
└── itinerary.ts                 # + interpretChatRequest (mutation)

apps/web/app/(workspace)/workspace/
├── planner.tsx                  # refactor: extract handleSubmit's
│                               #   draft.subscribe(...) call into a
│                               #   startDraft(tripRequest) helper so both
│                               #   the form and the new chat entry call the
│                               #   SAME code (no duplication); render the
│                               #   new chat-entry component on the idle
│                               #   phase, alongside the form
└── chat-entry.tsx               # NEW: chat-first entry UI (single input +
                                #   message list for clarifying replies) —
                                #   idle-phase-only, mirrors chat-panel.tsx's
                                #   presentation conventions (.tf-chat*) but
                                #   is its own component (different
                                #   lifecycle: unmounts once a draft starts,
                                #   never touches an existing itineraryId)

apps/web/lib/
└── trpc/client.ts               # typed InterpretChatRequestOutput export

packages/llm/src/__tests__/
└── interpret-trip-request.test.ts   # NEW: L1 — FakeLLM deterministic
                                #   extraction (destination/nights/party/
                                #   budget/style, needsInfo paths)

packages/api/src/__tests__/
└── l3-chat-first-entry.test.ts      # NEW: L3 — interpretChatRequest mutation,
                                #   tenant-scoping (agentProcedure gate),
                                #   resolved output feeds draft successfully
```

**Structure Decision**: Extend the existing single-project turborepo layout —
no new package. The change is confined to an extension of the existing
`packages/llm` port/fake/anthropic trio (one new method, mirroring how spec
020 added `chatEditItinerary` alongside `draftItinerary`), an extension of
the existing `packages/api/src/services/planner.ts` (already the home of the
`TripRequest`-producing pipeline this feature feeds), one new router
mutation, and a small addition to the existing planner page plus one new
presentation-only component — matching how spec 020 added `chat-panel.tsx`
alongside `planner.tsx`.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
