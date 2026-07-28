# Implementation Plan: Chat-First, Multi-Turn Build-to-Book (Agent Surface)

**Branch**: `kitchen/fix-goal-chat-first-builder-primary` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/035-chat-first-builder/spec.md`

## Summary

Promote the agent AI Builder's chat entry from a single-shot form-filler (spec 028) to the **primary, multi-turn conversational build path**. The agent supplies trip details across several messages; the system accumulates the conversation, resolves it to the SAME trip request the form produces, offers an explicit "Build my trip" confirmation, and hands off into the UNCHANGED compare→choose→book pipeline (spec 019/009). The structured form stays available behind a toggle. Keyless determinism is preserved.

**Technical approach**: accumulation happens ONE LAYER ABOVE the LLM boundary (exactly where spec 028 already resolves absolute dates). The tRPC `interpretChatRequest` input gains an optional `priorMessages: string[]`; the `interpretChatTripRequest` service joins `[...priorMessages, message]` into a single conversation text and passes it to the UNCHANGED `LLMPort.interpretTripRequest`. Because FakeLLM's interpreter already scans the whole message text, joining the transcript yields deterministic cross-turn accumulation with **zero change to `packages/llm`**. The client `chat-entry.tsx` keeps the running transcript, sends `priorMessages` each turn, and on `resolved` renders a confirmation + "Build my trip" CTA that calls the existing `startDraft`. `planner.tsx` reorders the idle view so chat is primary and the form is behind a toggle (form-mode when `?destination=` is present).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 22, React 19 / Next.js 15 (App Router)

**Primary Dependencies**: tRPC v11 (typed browser client + SSE subscriptions), `@tripforge/llm` (LLMPort: AnthropicLLM + FakeLLM), `@tripforge/api` (planner service), Zod (input parse functions), `@tripforge/itinerary-schema` (unchanged)

**Storage**: Postgres/Drizzle — **untouched**. No new table, no migration. The conversation is session-scoped React state only.

**Testing**: Vitest (L1 service/interpreter units, L3 real-Postgres via compose `DATABASE_URL`), Playwright e2e against the built compose image (INV-027)

**Target Platform**: Dockerized Next.js web app (compose); keyless FakeLLM demo mode + funded Anthropic Haiku mode

**Project Type**: Web application (monorepo: `apps/web` frontend + `packages/api` backend + `packages/llm` port)

**Performance Goals**: interpretation is a single non-streamed LLM call (or instant regex under FakeLLM); no new network round trips per turn beyond the one interpret mutation; downstream draft/book performance is unchanged (reuses existing streamed pipeline).

**Constraints**: no canonical-schema change; no money-path change; no supplier-API shape outside the adapter; keyless determinism (no `Math.random`/wall-clock in the interpreter); INV-004/023/024 tenant + role scoping preserved; existing form-path e2e must stay green.

**Scale/Scope**: ~2 product files changed (`chat-entry.tsx`, `planner.tsx`), 1 api input + 1 service function, 0 LLM-package changes; tests: extend 1 L3 suite + 1 service unit test + 1 shared e2e helper + 2 planner e2e specs updated + 1 new e2e journey.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| **I. Marketplace-First** | PASS | Improves the agent build wedge that feeds the marketplace; no consumer-generic-planner drift (agent surface only; consumer surface explicitly deferred to `goal-consumer-planner`). |
| **II. Agent Experience Is the Wedge** | PASS (advances) | Directly reduces time-to-client-ready-itinerary by making the fastest build path conversational; polish is first-class. No regression to the form path (FR-007). |
| **III. Budget-Aware AI, Priced Against Reality** | PASS | Reuses the SAME budget-aware, live-priced compare/select pipeline; chat only produces a *request*, never priced/bookable output. Every saved price/item still comes from live supply (FR-008). |
| **IV. Canonical Itinerary Schema** | PASS | No schema change, no new persisted entity, no migration (FR-012). The resolved trip request is the existing structured parameter set — not itinerary content. |
| **V. Integrate Supply, Don't Contract It** | PASS | Supply-adapter boundary untouched; no supplier API shape crosses interpretation; the draft/select pipeline is unchanged (FR-008/FR-012). |
| **VI. Trust, Provenance & Revenue-Share Integrity** | PASS | No money path touched (markup/net-rate/take-rate/revenue-share unchanged, FR-012). RBAC ladder preserved — `interpretChatRequest` stays `agentProcedure`, tenant-scoped (INV-004/023/024, FR-011). |
| **Non-Goals** | PASS | Not a generic consumer planner; agent surface only. |
| **MVP Scope (P0)** | PASS | Agent-side build-layer polish — squarely P0. No P1+/deferred roadmap item. |

**Money-path gate**: FR-012 asserts no money-path change; still, the L3 handoff test confirms the chat-resolved request flows into the same draft that books at server-side prices (no client-trusted pricing). **No ALWAYS-HALT trigger** (no constitution amendment, no schema version bump, no revenue-share/client-ownership change). Result: **Constitution Check PASSES — cleared for Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/035-chat-first-builder/
├── plan.md              # This file
├── spec.md              # Feature spec (/speckit-specify)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── interpret-chat-request-mutation.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/web/app/(workspace)/workspace/
├── chat-entry.tsx        # CHANGED: multi-turn transcript + resolve confirmation + "Build my trip" CTA
└── planner.tsx           # CHANGED: chat primary in idle; form behind a toggle (form-mode when ?destination=)

packages/api/src/
├── routers/itinerary.ts  # CHANGED: interpretChatRequest input gains optional priorMessages
└── services/planner.ts   # CHANGED: interpretChatTripRequest accepts priorMessages; joins transcript

packages/llm/             # UNCHANGED (interpretTripRequest stays single-shot over given text)

packages/api/src/__tests__/
└── l3-chat-first-entry.test.ts   # CHANGED: add multi-turn accumulation → draft handoff case

packages/api/src/services/__tests__/ (or existing planner test file)
└── ...                   # CHANGED: unit test for transcript-join accumulation

tests/e2e/
├── support.ts                    # CHANGED: draftParisTrip opens the form via the toggle
├── planner-journey.spec.ts       # CHANGED: open the form via the toggle (US1/US2)
└── chat-first-journey.spec.ts    # NEW: multi-turn chat → build → book, without the form
```

**Structure Decision**: Web-application monorepo. This feature is confined to the agent workspace planner UI (`apps/web/app/(workspace)/workspace`) and the planner interpret service/input (`packages/api`). The LLM port package is deliberately untouched to keep the change minimal and the keyless-determinism guarantee trivially preserved.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

The one design decision worth recording (not a violation): accumulation is realised by **joining the transcript above the LLM boundary** rather than by adding conversation memory *inside* the LLM port. Rejected alternative: extend `LLMPort.interpretTripRequest` to take a structured message history. Rejected because (a) it changes the port surface and every adapter + its tests for no product-visible gain, (b) FakeLLM already scans full text so joining accumulates for free, and (c) it keeps the keyless determinism guarantee a pure function of the transcript string. See research.md D1.
