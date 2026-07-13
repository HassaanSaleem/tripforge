# Implementation Plan: Multi-Option AI Itinerary Generation

**Branch**: `kitchen/fix-demo-04-multi-option-planner` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-multi-option-planner/spec.md`

## Summary

The planner's draft flow currently produces exactly one persisted itinerary per
submission. This feature makes it produce 2-3 distinct, labeled itinerary
options for comparison BEFORE anything is persisted, lets the agent pick one,
and persists only the picked option — with identical persistence/booking/
share semantics to today's single-draft flow. No canonical itinerary schema
change. The LLMPort planner-draft vocabulary grows from "one draft" to "one or
more labeled drafts"; a new streamed selection subscription re-runs the same
deterministic pipeline filtered to the chosen variant and persists it,
mirroring today's `draft` subscription (INV-028: any handler driving the LLM
tool loop must stream).

## Technical Context

**Language/Version**: TypeScript (Node.js, pnpm workspace monorepo)

**Primary Dependencies**: tRPC (SSE subscriptions), Zod, Drizzle ORM/Postgres, existing `@tripforge/llm` (LLMPort/FakeLLM/Anthropic SDK), `@tripforge/domain` (budget allocation, itinerary assembly — pure functions), `@tripforge/itinerary-schema`, React (Next.js app router) for the compare UI

**Storage**: PostgreSQL via Drizzle (`itinerary` table) — unchanged shape; only ONE row written per agent action, exactly as today

**Testing**: Vitest (L1/L2 unit + service tests, e.g. `packages/api/src/__tests__/l3-planner-verification.test.ts` pattern), Playwright (L4 live/UAT journey)

**Target Platform**: Web (Next.js app in `apps/web`), tRPC API (`packages/api`), Docker Compose for live verification

**Project Type**: Web application (existing turborepo: apps/web + packages/api + packages/llm + packages/domain + packages/itinerary-schema)

**Performance Goals**: No added end-to-end latency beyond generating the extra 1-2 options (SC-001) — the FakeLLM/keyless path does one supply-catalog fetch shared across all variants, not one fetch per variant

**Constraints**: INV-009/010 (integer minor units only), INV-013 (LLM calls only via LLMPort, pinned model `claude-haiku-4-5`), INV-028 (any handler driving the LLM tool loop must stream via SSE subscription, not a blocking mutation), INV-001 (no forked/private itinerary schema), INV-005 (no supplier API shapes outside the supply-adapter boundary)

**Scale/Scope**: Single feature touching `packages/llm` (planner-draft vocabulary + FakeLLM), `packages/api` (planner service + itinerary router), `apps/web` (compare UI + selection wiring). No new package.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First**: N/A direct marketplace impact, but strengthens Principle II (agent tool polish) which the constitution explicitly treats as the acquisition wedge that earns the right to build the network. PASS.
- **II. Agent Experience Is the Wedge**: Directly serves this — better plan comparison raises perceived planner quality without regressing time-to-client-ready-itinerary (comparison replaces a single render with N renders computed from ONE shared supply-catalog fetch, not N sequential drafts). PASS.
- **III. Budget-Aware AI, Priced Against Reality**: Every option remains a fully live-priced, bookable candidate (verified against real sandbox supply, integer minor units) — never a static/unpriced suggestion. Re-verification happens again at selection time (FR-008), so the persisted trip's price is never stale. PASS.
- **IV. Canonical Itinerary Schema**: No schema change. `packages/itinerary-schema` is untouched; every option IS already a complete, valid `Itinerary` document (assembled via the existing pure `assembleItinerary`) — comparison just defers which one gets written to the DB. **No migration note required.** PASS.
- **V. Integrate Supply, Don't Contract It**: No new supplier surface; reuses the existing supply-adapter ports (hotel/activity/transfer/car-rental search) exactly as today, just selecting different offers per variant from the SAME verified catalog. PASS.
- **VI. Trust, Provenance & Revenue-Share Integrity**: Not a money-movement/marketplace path (booking, take-rate, revenue-share are untouched) — no new integration-test-against-sandbox obligation beyond what already exists for booking. The persisted itinerary still goes through the existing `stampProvenance` step unchanged. PASS.
- **PMF instrumentation (Governance)**: Exactly one `trip_created` PMF event per saved trip, same as today (FR-006/SC-003) — unpicked options fire none. PASS.

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-multi-option-planner/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/llm/src/
├── planner-draft.ts     # PlannerDraft unchanged; add DRAFT_VARIANTS + labels
├── port.ts              # DraftItineraryResult: "drafted" now carries drafts[] (labeled)
└── fake.ts              # FakeLLM.draftItinerary: produce 2-3 deterministic variants

packages/api/src/services/
└── planner.ts            # split into a shared core + two generators:
                           #   draftOptions() — compare, no persistence
                           #   selectDraftOption() — persist the chosen variant

packages/api/src/routers/
└── itinerary.ts           # draft (existing) now returns options; new selectDraft subscription

apps/web/app/(workspace)/workspace/
└── planner.tsx             # compare view (option cards) + select action wired to selectDraft

apps/web/lib/
├── trpc/client.ts          # typed DraftEvent/DraftOutput exports follow the new shapes
└── planner-form.ts         # pure mapping/formatting helpers extended for option comparison

packages/api/src/__tests__/
└── l3-planner-verification.test.ts   # extend for multi-option + selection persistence
```

**Structure Decision**: Extend the existing single-project turborepo layout — no
new package. The change is confined to the planner's existing vertical slice
(`packages/llm` → `packages/api` services/routers → `apps/web` planner UI),
matching how spec 016 (streamed draft) and spec 008 (planner workspace UI)
were structured.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
