# Implementation Plan: Budget Allocator + Quote-Then-Book Flow

**Branch**: `kitchen/fix-seed-0005-budget-quote-book` (spec dir `005-budget-quote-book`) | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-budget-quote-book/spec.md`

## Summary

Build the Build→Book half of the shared engine as agent-gated API procedures:
a pure-domain budget allocator (integer minor units, conservation, trip-type
bands, flights-as-reserve), an AI planner behind `LLMPort` (Haiku-pinned,
typed `betaZodTool` definitions in `packages/llm/src/tools/` wrapping the
supply ports, bounded tool-runner loop, zod-validated draft output;
deterministic fake for tests and the keyless compose stack), a deterministic
verify-reprice-assemble step that turns drafts into canonical-schema
itineraries with per-category/per-day breakdowns, and a quote-then-book money
path (server-held quote rows with expiry, pure markup + explicit currency
conversion math, per-component partial-failure handling, reservation + markup
ledger rows and PMF events written in one transaction). New agency-scoped
tables land via `db:push`. The canonical itinerary schema is consumed at
0.1.0, unchanged.

**Review rework (PR #13, 2026-07-08 — tickets seed-0005a/b/c)**: the book
path is serverless-correct (research D11): a supplier that no longer
recognizes a live persisted hold gets it re-established at book time with
exact-price reconciliation (INV-028); hold consumption is atomic
(`consumed_at` flip only if still unconsumed, rows written for winners only,
UNIQUE backstop on `booking_component.quote_row_id`; duplicate input ids
deduped) so a hold is consumed by at most one booking under any interleaving
(FR-009/INV-011); ledger markup math is the pure domain `markupOf` (INV-010).

**Final-tribunal rework (seed-0005d, 2026-07-08)**: the book path conserves
under concurrency (research D12): holds are CLAIMED (id-ordered locking read
+ atomic `consumed_at` flip) BEFORE any supplier call, released on supplier
failure, and a recording-transaction failure after supplier bookings is
compensated with `port.cancel` + claim release — the losing side of a
concurrent duplicate book never reaches the supplier, so no supplier booking
can survive unrecorded (FR-009/FR-011/INV-011).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), Node 20 (alpine in image)

**Primary Dependencies**: existing workspace packages (`@tripforge/domain`,
`itinerary-schema`, `supply-adapter`, `db`, `llm`, `api`), `@trpc/server` 11,
`drizzle-orm` 0.36 on PostgreSQL 17, `@anthropic-ai/sdk` 0.65.0 (pinned;
`betaZodTool` + `beta.messages.toolRunner` available, `messages.parse`
structured-outputs NOT available in this version — see research D2), zod
(v3.25 in itinerary-schema; v4.4.3 already lockfile-resolved as the SDK peer —
see research D3)

**Storage**: PostgreSQL (single system of record, INV-003); five new
agency-scoped tables (`itinerary`, `booking_quote`, `booking`,
`booking_component`, `markup_ledger`) pushed by the existing compose migrate
stage (`drizzle-kit push`)

**Testing**: Vitest L1/L2 per package (pure domain exhaustive; tRPC caller
tests for RBAC/flows with sandbox ports + FakeLLM); env-gated vitest L3
(tRPC caller + real Postgres) for money-path state deltas incl. failure
branches; `tests/integration/smoke.mjs` extended with the live
draft→quote→book walk (harness.mjs state-delta assertions); Playwright e2e
untouched (no UI change)

**Target Platform**: docker-compose stack (INV-019/027) now; Vercel
serverless contract (INV-028) as the forward constraint — no cross-request
in-process state on the REAL-adapter path (see research D6)

**Project Type**: pnpm/turborepo monorepo — packages (domain/db/llm/api) +
apps/web wiring

**Performance Goals**: draft operation bounded — tool-runner
`max_iterations` cap (≤ 6 model turns) and per-request tool fan-out via
`Promise.all`; L3 smoke stays within its existing 60 s budget

**Constraints**: no new registry dependencies (loop runtime cannot run
installs; image build is `--frozen-lockfile` — only workspace links and
already-locked versions may be added to manifests, with matching lockfile
importer edits; see research D4); no canonical schema change (ALWAYS-HALT);
no supplier shapes outside the adapter; money is integer minor units
everywhere

**Scale/Scope**: single-niche P0 volumes; correctness (conservation,
tenancy, typed failures) over throughput

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 before
Phase 0; re-checked after Phase 1 design — both PASS.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Builds the wedge that feeds the marketplace: budget-aware build + inline booking is the agent-acquisition surface (PRD P0); marketplace itself untouched (seed-0006). No P1+/non-goal code paths: no flights lookup (reserve only), no consumer surface. |
| II. Agent Experience Is the Wedge | PASS | Cuts time-to-client-ready-itinerary from manual assembly to one describe-trip call; output is a client-brandable canonical itinerary. No client-view/branding surface is modified (INV-020 untouched). |
| III. Budget-Aware AI, Priced Against Reality | PASS | The feature IS this principle: allocator bands + live (sandbox) pricing via ports; static unpriced suggestions impossible by construction (FR-003 drops unverified proposals; every price re-read from supply). Plan→book conversion measured (FR-012). Agent stays author of record — output is a draft the agent books explicitly (INV-016). |
| IV. Canonical Itinerary Schema | PASS | Consumes SCHEMA_VERSION 0.1.0 unchanged (FR-015, SC-008); drafts validate through `parseItinerary`; no new itinerary-shaped type outside the schema package (planner draft vocabulary is offer-references + narrative, converted to canonical items by the assembler — research D5). |
| V. Integrate Supply, Don't Contract It | PASS | All inventory via the four ports; quote-then-book semantics (hold/expiry/re-quote), multi-currency with explicit conversion, partial-failure carts, MoR recorded per component. No supplier API shape leaves the adapter (tools carry port contract shapes only, type-only imports — research D7). |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | Money path gets L3 integration tests with state-delta + conservation assertions (FR-014); markup ledger rows written in the same tx as booking; failure branches write zero rows (FR-011). Revenue-share itself is seed-0006; the ledger row it builds on lands here. |
| MVP Scope Discipline | PASS | Everything is P0 ("budget-aware AI planner priced against live inventory; ONE bedbank + activities + transfers + car via aggregator adapters"). Deferred list untouched. |
| Development Workflow gates | PASS | Spec→plan→tasks flow followed; no schema migration note needed (no schema change); money-path L3 mandated by FR-014. |

**Post-Phase-1 re-check (2026-07-08)**: design artifacts introduce no new
violations. Two governance tensions are documented in Complexity Tracking
(streaming deferral vs INV-028; `packages/llm` type-only dependency on
`packages/supply-adapter` vs the architecture container table) — both
justified, neither weakens an invariant.

## Project Structure

### Documentation (this feature)

```text
specs/005-budget-quote-book/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1..D10
├── data-model.md        # Phase 1 — tables, domain values, draft vocabulary
├── quickstart.md        # Phase 1 — validation walk
├── contracts/
│   └── planner-and-booking.md   # procedure + planner-port + tool contracts
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/domain/src/
├── money.ts             # EXTEND: splitByWeightsMinorUnits (largest-remainder),
│                        #   applyMarkupBps, convertMoney (+ ExchangeRate type)
├── budget.ts            # NEW: allocateBudget, rebalanceAllocations, trip-type bands
├── assemble.ts          # NEW: assembleItinerary (draft + verified offers +
│                        #   allocations → canonical Itinerary + fit flags)
└── index.ts             # EXTEND: export new surface

packages/llm/src/
├── port.ts              # EXTEND: LLMPort.draftItinerary + planner request/draft/
│                        #   deps types (PlannerToolDeps injected — research D7)
├── planner-draft.ts     # NEW: zod schema for the structured draft (submit tool input)
├── tools/               # NEW (INV-013): one file per tool, betaZodTool defs
│   ├── search-hotel-rates.ts
│   ├── search-activities.ts
│   ├── quote-transfer.ts
│   ├── quote-car-rental.ts
│   └── submit-itinerary-draft.ts   # structured-output tool (research D2)
├── anthropic.ts         # EXTEND: toolRunner loop on claude-haiku-4-5, metered
└── fake.ts              # EXTEND: deterministic draftItinerary (scriptable)

packages/db/src/
├── schema.ts            # EXTEND: itinerary, booking_quote, booking,
│                        #   booking_component, markup_ledger (all agency-scoped)
└── index.ts             # EXTEND: export new tables

packages/api/src/
├── context.ts           # EXTEND: Container.rates (fixed table — research D8)
├── container.ts         # EXTEND: wire STATIC_RATES default
├── rates.ts             # NEW: ExchangeRate table type + STATIC_RATES
├── services/
│   ├── planner.ts       # NEW: draft orchestration (allocate → LLM → verify →
│   │                    #   assemble → persist + trip_created event)
│   └── booking.ts       # NEW: quote + book orchestration (holds, conversion,
│                        #   markup, partial failure, ledger + PMF events)
├── routers/
│   ├── workspace.ts     # EXTEND: mount itinerary + booking sub-routers
│   ├── itinerary.ts     # NEW: workspace.itinerary.draft / .get
│   └── booking.ts       # NEW: workspace.booking.quote / .book
└── __tests__/           # EXTEND: rbac + flow caller tests; NEW l3.booking.test.ts
                         #   (env-gated on DATABASE_URL)

apps/web/lib/trpc/server.ts  # EXTEND: process-singleton container (research D6)

tests/integration/smoke.mjs  # EXTEND: draft→quote→book live walk + deltas
tests/integration/harness.mjs # EXTEND: WATCHED_TABLES += 5 new tables
```

**Structure Decision**: follows the mandated monorepo layout exactly — pure
math in `domain`, port + tools in `llm`, persistence in `db`, orchestration +
composition root in `api`, wiring only in `apps/web`. No new packages (all
capabilities have an owning package already).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| INV-028 says handlers calling the LLM tool loop MUST stream; `workspace.itinerary.draft` ships as a bounded non-streaming mutation | The compose/default path runs the deterministic fake (milliseconds); the real-key path is bounded (`max_iterations` ≤ 6, small outputs on Haiku) and fits P0 serverless timeouts; deploys are operator-gated and none is scheduled | Building tRPC streaming/subscription plumbing now is speculative (no deploy, no UI consumer); a follow-up ticket is filed by the tasks phase for streaming before any Vercel deploy of the draft surface |
| Architecture §1.2 lists `packages/llm` → `shared`; this feature adds a **type-only** import of `@tripforge/supply-adapter` port contract types into `packages/llm` | INV-013 [M] explicitly mandates the planner tools live in `packages/llm/src/tools/` "wrapping the supply ports" — the tool input/output types ARE the port contract shapes; controlling invariant wins | Redeclaring criteria/offer shapes inside `packages/llm` duplicates the port vocabulary (near-duplicate types, review-blocking) and lets the two drift; runtime coupling is avoided by injecting executors (research D7), so the dependency is types + zod mirrors only |
