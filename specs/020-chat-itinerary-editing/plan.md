# Implementation Plan: Conversational AI Itinerary Editing

**Branch**: `kitchen/fix-demo-03-chat-builder-conversational-editing` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-chat-itinerary-editing/spec.md`

## Summary

Today an itinerary is only ever produced whole, by the one-shot/multi-option
planner flow (specs 005/016/019); once persisted there is no way to refine it
except starting over. This feature adds multi-turn conversational editing on
top of an already-persisted itinerary: a chat panel resolves natural-language
requests to one of (a) a direct, immediately-applied add/remove of one item,
(b) 2-3 inline hotel suggestion cards the agent explicitly commits to via an
"Add to trip" action, or (c) a no-op clarifying reply. Every applied edit
re-derives the budget-fit breakdown using the SAME rebalancing math
`assembleItinerary` already uses, and persists via the SAME load-mutate-persist
pattern `attachMedia`/`detachMedia` already established on the itinerary
document. LLMPort grows one new streamed method (mirroring `draftItinerary`'s
existing shape) so the interpretation step's tool loop honors INV-028. No
canonical itinerary schema change — items already carry a stable `id`.

## Technical Context

**Language/Version**: TypeScript (Node.js, pnpm workspace monorepo)

**Primary Dependencies**: tRPC (SSE subscriptions + mutations), Zod, Drizzle ORM/Postgres, existing `@tripforge/llm` (LLMPort/FakeLLM/Anthropic SDK), `@tripforge/domain` (budget rebalancing — pure functions), `@tripforge/itinerary-schema`, `@tripforge/supply-adapter` (hotel/activity/transfer search, reused, not extended), React (Next.js app router) for the chat panel

**Storage**: PostgreSQL via Drizzle (`itinerary` table) — unchanged shape; edits read-modify-write the existing `document` jsonb column exactly like `attachMedia`/`detachMedia` do today; no new table (chat transcript is not persisted, per spec Assumptions)

**Testing**: Vitest (L1/L2 unit — domain edit-application function, FakeLLM chat interpretation; L3 integration — `packages/api/src/__tests__/l3-*.test.ts` pattern, tenant-scoping + persistence), Playwright (live/UAT journey)

**Target Platform**: Web (Next.js app in `apps/web`), tRPC API (`packages/api`), Docker Compose for live verification

**Project Type**: Web application (existing turborepo: apps/web + packages/api + packages/llm + packages/domain + packages/itinerary-schema + packages/supply-adapter). No new package.

**Performance Goals**: A chat request resolves and (if applicable) applies within the same latency envelope as today's draft/selectDraft subscriptions (one LLM tool-loop round trip plus at most one supply re-search) — no added round trips beyond what interpretation itself requires.

**Constraints**: INV-009/010 (integer minor units only, no client-side money arithmetic), INV-013 (LLM calls only via LLMPort, pinned model `claude-haiku-4-5`), INV-028 (any handler driving an LLM tool loop must stream via SSE subscription, not a blocking mutation), INV-001 (no forked/private itinerary schema — items already have stable `id`s, no migration needed), INV-005 (no supplier API shapes outside the supply-adapter boundary), INV-004 (tenant scoping via `scopedWhere(agencyId)`, matching `attachMedia`/`detachMedia`)

**Scale/Scope**: Single feature touching `packages/llm` (new chat-edit port method + FakeLLM/AnthropicLLM implementations + one new tool), `packages/domain` (new pure edit-application function reusing `categoryForPort`/`rebalanceAllocations`), `packages/api` (new chat-edit service function + two router procedures), `apps/web` (new chat panel component). No new package, no schema version bump.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First**: N/A direct marketplace impact, but strengthens Principle II (agent tool polish), which the constitution treats as the wedge that earns the right to build the network. PASS.
- **II. Agent Experience Is the Wedge**: This is the operator's explicitly named single biggest "AI agent" gap — conversational refinement is core agent-tool polish, and it does not regress time-to-client-ready-itinerary (it operates on an already-drafted trip, not the initial draft path). PASS.
- **III. Budget-Aware AI, Priced Against Reality**: Every add/replace is priced from a fresh, live supply re-search (never a placeholder or client-echoed value, FR-006/FR-012); the budget-fit breakdown re-derives after every edit using the SAME rebalancing logic `assembleItinerary` already uses (buffer-donor-first, flights reserve untouchable). Hotel suggestions are real, currently-available offers, not static text. PASS.
- **IV. Canonical Itinerary Schema**: No schema change. Items already carry a stable `id` (`packages/itinerary-schema/src/item.ts`); edits target existing items by that id and construct new items using the exact same per-port shape `assembleItinerary` already produces. **No migration note required.** PASS.
- **V. Integrate Supply, Don't Contract It**: No new supplier surface — reuses the existing `PlannerToolDeps`/supply-adapter search ports (hotel/activity/transfer) exactly as the planner does today; the new LLM tool for proposing an edit carries only `{type, itemId?, dayNumber?, port?, offerId?}` (offer-reference vocabulary, never a supplier payload shape). PASS.
- **VI. Trust, Provenance & Revenue-Share Integrity**: Not a money-movement/marketplace path (booking, take-rate, revenue-share, and the `stampProvenance`-set provenance fields are untouched by an item add/remove/replace) — no new sandbox-integration-test obligation beyond what booking already has. Tenant scoping preserved via the same `scopedWhere(agencyId)` pattern `attachMedia`/`detachMedia` already use — a cross-tenant `itineraryId` is a typed `not_found`, no existence oracle. PASS.
- **PMF instrumentation (Governance)**: This feature does not create or license a trip — no new PMF event type is introduced or required; the itinerary's existing `trip_created` event (fired once, at `selectDraft` time) is unaffected. PASS.

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/020-chat-itinerary-editing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/domain/src/
├── edit.ts               # NEW: applyItineraryEdit() — pure function; reuses
│                          #   categoryForPort/rebalanceAllocations/allocationsTotalMinor
│                          #   from budget.ts; shares offer→Item construction with assemble.ts
└── index.ts               # export the new edit module's public types/functions

packages/llm/src/
├── port.ts                # LLMPort: + chatEditItinerary() — mirrors draftItinerary's
│                          #   AsyncGenerator<progress|result> shape (INV-028)
├── fake.ts                 # FakeLLM.chatEditItinerary: deterministic keyword-rule
│                          #   interpreter over the SAME injected PlannerToolDeps
├── anthropic.ts             # AnthropicLLM.chatEditItinerary: tool loop reusing the
│                          #   existing search tools + one new propose-edit tool
├── tools/proposeItineraryEditTool.ts   # NEW: mirrors submitItineraryDraftsTool.ts's
│                          #   captured-result pattern
└── chat-edit.ts            # NEW: ChatEditProposal / ChatEditResult / HotelSuggestion types

packages/api/src/services/
└── itineraries.ts          # EXTEND (not a new file — Pre-Write "extend"): add
                           #   interpretChatEdit() (streamed) + applyChatEdit() (direct),
                           #   reusing the existing loadOwnedItinerary/persistDocument
                           #   helpers already defined in this file

packages/api/src/routers/
└── itinerary.ts             # + chatEdit (subscription) + applyChatEdit (mutation)

apps/web/app/(workspace)/workspace/
├── planner.tsx              # wire a new ChatPanel into the DraftResult section
└── chat-panel.tsx           # NEW: chat UI (message list, input, hotel suggestion cards)

apps/web/lib/
├── trpc/client.ts           # typed ChatEditEvent/ChatEditResult exports
└── chat-form.ts             # NEW: pure display/mapping helpers (mirrors planner-form.ts)

packages/domain/src/__tests__/
└── edit.test.ts             # NEW: L1 — add/remove/replace, rebalancing, conservation

packages/llm/src/__tests__/
└── chat-edit.test.ts        # NEW: L1/L2 — FakeLLM deterministic interpretation

packages/api/src/__tests__/
└── l3-chat-edit.test.ts     # NEW: L3 — tenant scoping, persistence, not_found paths
```

**Structure Decision**: Extend the existing single-project turborepo layout —
no new package. The change is confined to one new domain module
(`packages/domain/src/edit.ts`), an extension of the existing `packages/llm`
port/fake/anthropic trio, an extension of the existing
`packages/api/src/services/itineraries.ts` (already the home of the
load-mutate-persist pattern this feature reuses), two new router procedures,
and a new frontend chat panel wired into the existing planner page — matching
how spec 015 (content-library attach/detach) and spec 019 (multi-option
planner) were structured.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
