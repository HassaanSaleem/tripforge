# Implementation Plan: Stream the AI Itinerary Draft Response

**Branch**: `kitchen/fix-seed-0014-stream-draft` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-stream-draft-response/spec.md`

## Summary

`workspace.itinerary.draft` currently blocks synchronously on a multi-tool-call
LLM planning loop and returns one response only after everything finishes —
violating INV-028 ("any request handler that calls the LLM tool loop MUST
stream") and leaving the agent staring at a static spinner. This feature
converts the procedure from a tRPC mutation to a native tRPC v11 SSE
subscription, changes `LLMPort.draftItinerary` from a `Promise` to an async
generator that yields step-level progress events before its terminal result
(both the live `AnthropicLLM` and the deterministic `FakeLLM` implement this
identically), and updates the workspace planner UI to render the streamed
progress instead of a fixed message. The persistence contract (INV-021:
canonical document + `trip_created` PMF event written together, only on full
success) and the final `DraftOutcome` shape are untouched — this is a
transport-and-feedback change, not a planning-logic change.

## Technical Context

**Language/Version**: TypeScript (existing pnpm/turborepo monorepo, Node 20+)

**Primary Dependencies**: `@trpc/server` 11.18.0 / `@trpc/client` 11.18.0
(already pinned — native SSE subscription support, no new dependency),
`@anthropic-ai/sdk` (existing `beta.messages.toolRunner`), Next.js App Router
(existing `@trpc/server/adapters/fetch` mount)

**Storage**: PostgreSQL via Drizzle — unchanged; no schema/migration (this
feature touches transport only)

**Testing**: Vitest (unit/L1, API-layer L2, L3 against compose Postgres),
Playwright (e2e/live) — existing harness, extended with subscription-aware
assertions

**Target Platform**: Vercel serverless/edge functions (prod, per INV-028);
docker-compose Node runtime (local dev + INV-027 live verification)

**Project Type**: Web service monorepo (existing `packages/llm`,
`packages/api`, `apps/web`) — no new package (Pre-Write: extend)

**Performance Goals**: first progress byte sent to the client before the
draft's multi-tool-call loop finishes, for every live-LLM draft attempt
(SC-002); no regression to the keyless FakeLLM path's near-instant local
resolution

**Constraints**: final `DraftOutcome` content unchanged (FR-003); persistence
only on full success, independent of client connection state (FR-004,
INV-021); FakeLLM final output unchanged for every existing scripted test
(FR-005); progress events carry no supplier-shaped payload (FR-008,
Constitution V); authorization/tenant-scope unchanged (FR-009, INV-023/024)

**Scale/Scope**: one existing request handler
(`packages/api/src/routers/itinerary.ts#draft`) and its call chain — `LLMPort`
(`packages/llm/src/port.ts`, `anthropic.ts`, `fake.ts`), the orchestration
service (`packages/api/src/services/planner.ts`), the browser tRPC client
(`apps/web/lib/trpc/client.ts`), and the planner UI
(`apps/web/app/(workspace)/workspace/planner.tsx`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. Marketplace-First | Not implicated — no marketplace/trade-layer surface touched. N/A, no conflict. |
| II. Agent Experience Is the Wedge | **Advances** — replaces a static spinner with real progress feedback during the AI planning step, directly serving "match or beat the leading itinerary tools on speed and polish." No regression to time-to-client-ready-itinerary (final result unchanged). |
| III. Budget-Aware AI, Priced Against Reality | **Preserved** — planning/allocation/verification logic is byte-for-byte unchanged; only its *delivery* is streamed. No change to what is priced or how. |
| IV. Canonical Itinerary Schema | **Preserved** — no schema change, no migration. The persisted document is identical in shape and content to today's. |
| V. Integrate Supply, Don't Contract It | **Preserved** — progress events are a closed internal step-name enum (`DraftStep`), never a supplier API shape; no supplier-specific data crosses any package boundary that didn't already cross it. |
| VI. Trust, Provenance & Revenue-Share Integrity | N/A — drafting is not a money path (no payment, take-rate, or booking margin is computed or moved here; that happens at quote/book, spec 005/009, untouched by this feature). |

**Result**: PASS, no violations. No Complexity Tracking entries required.

*Post-Phase-1 re-check*: design artifacts (research.md, data-model.md,
contracts/) confirm no schema change, no new supplier coupling, no
authorization change, and an unchanged persistence-on-success contract.
**PASS — unchanged from the pre-design gate.**

## Project Structure

### Documentation (this feature)

```text
specs/016-stream-draft-response/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   └── itinerary-draft-subscription.md
└── tasks.md               # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

Existing monorepo layout — no new package (Pre-Write Discipline: **extend**
`packages/llm` and `packages/api`, no near-duplicate created):

```text
packages/llm/src/
├── port.ts                 # LLMPort interface — draftItinerary becomes an async generator; DraftStep/DraftProgressEvent added
├── anthropic.ts             # AnthropicLLM.draftItinerary — yields progress from toolRunner messages
├── fake.ts                  # FakeLLM.draftItinerary — sequential lookups, yields progress per lookup
└── __tests__/planner.test.ts  # extended: progress-event sequence assertions, both implementations

packages/api/src/
├── services/planner.ts      # draftItinerary orchestration becomes an async generator forwarding progress + terminal DraftOutcome
├── routers/itinerary.ts     # draft: mutation -> subscription
└── __tests__/                # extended: router-level subscription test (event sequence + unchanged terminal outcome)

apps/web/
├── lib/trpc/client.ts        # splitLink: httpSubscriptionLink for subscriptions, httpBatchLink otherwise
├── app/(workspace)/workspace/planner.tsx  # .mutate() -> .subscribe(); renders per-step progress label
└── tests/e2e/                 # extended: assert an intermediate progress state renders before the final result

tests/integration/ or packages/api L3 suite  # existing draft-flow L3 test updated to the subscription contract; failure-path state-conservation assertion preserved
```

**Structure Decision**: Extend the three existing packages that already own
this flow (`packages/llm`, `packages/api`, `apps/web`) — no new package, no
new top-level directory. This mirrors every prior spec in this repo (005,
008, 009) that touched the same draft/planner call chain.
