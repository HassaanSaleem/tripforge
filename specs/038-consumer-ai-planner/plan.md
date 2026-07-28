# Implementation Plan: Consumer Chat-First, Budget-Aware AI Trip Planner

**Branch**: `kitchen/fix-goal-consumer-planner-chat` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/038-consumer-ai-planner/spec.md`

## Summary

Offer the SAME budget-aware planning engine agents use, self-serve on the consumer surface.
A signed-in traveler opens `/view/plan`, chats destination + budget across turns, and gets
1–3 live-priced, budget-fit options; picking one shows the concrete plan (sell prices only)
and a fork: **request an agent** (a durable, non-money lead into the network — Principle I)
or **book it myself** (an honest signpost to the agent-prepared self-drive path, spec 036).

**Technical approach — reuse, do not fork.** The chat→interpret→draft→compare engine
(`interpretChatTripRequest`, `draftOptions`, shared `plannerCore` in `packages/api/services/
planner.ts`) is entry-agnostic; only its RBAC gate and persistence differ for travelers.
Two minimal, mechanical refactors make it reusable without a fork: (1) `interpretChatTripRequest`
already ignores its session arg (`_session`) → drop it; (2) `plannerCore`/`draftOptions` use
ONLY `session.agencyId` → narrow them to take `agencyId: string`. `selectDraftOption`
(persisting, agent-only) is untouched. New traveler-facing procedures live on the existing
`clientView` router (`protectedProcedure`, INV-024) and reuse those services. The transient
compare itinerary uses an **ephemeral `randomUUID()` agencyId** (never persisted), and is
redacted to the traveler through the EXISTING `toClientItineraryView` trust boundary (sell
price only — the same projection spec 010/036 already ship, where an unbooked item's single
displayed price equals net until quote-time markup). The request-agent fork writes a NEW
operational `consumer_plan_request` table (agency-less lead, no money columns) — the same
"bolt-on side record, NOT a canonical schema change, NOT a money path" pattern as spec 022's
`trip_handoff_request`. No `packages/llm` change (keyless FakeLLM path preserved). No
`booking`/`markup_ledger`/`trip_created`/itinerary write on any consumer-planner path.

## Technical Context

**Language/Version**: TypeScript (strict), Node 20, React 19 / Next.js 15 (App Router)

**Primary Dependencies**: tRPC, Drizzle ORM (Postgres), Better Auth, `@tripforge/domain`
(budget allocator + money), `@tripforge/supply-adapter` (sandbox ports), `@tripforge/llm`
(FakeLLM keyless interpreter), `@tripforge/itinerary-schema` (canonical `Itinerary`).

**Storage**: Postgres via Drizzle; one NEW table `consumer_plan_request` created by the
compose `migrate` step (`drizzle-kit push` against `schema.ts` — no hand-written SQL).

**Testing**: vitest (L1/L2 + L3 integration under `packages/api/src/__tests__`), Playwright
(`tests/e2e`), live smoke (`tests/integration/smoke.mjs`).

**Target Platform**: Web (compose stack); brand-neutral consumer `(client-view)` route group.

**Project Type**: Web application (monorepo: `apps/web` + `packages/api`/`db`/`domain`/…).

**Performance Goals**: interactive planner (chat mutation + draft subscription) — same
latency envelope as the agent builder it reuses; no new hot path.

**Constraints**: INV-020 (no net/markup to the traveler), INV-023/INV-024 (per-procedure
RBAC; traveler never invokes a workspace procedure), INV-019 (keyless/sandbox works
credit-free), no canonical-schema change, no money-math/revenue-share/ownership change
(ALWAYS-HALT), Simplicity Default.

**Scale/Scope**: ~1 new table + 3 barrel lines; 1 planner.ts refactor + 2 agent call-site
updates; 1 new consumer-planner service; 3 new `clientView` procedures; 1 new consumer route
+ 1 new consumer planner component; 2 signpost flips (nav + home tile); tests: 1 new L3 suite
+ redaction assertion + 1 RBAC negative + 1 new e2e journey.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 before Phase 0 and re-checked after design.*

| Principle | Verdict | Justification |
|-----------|---------|---------------|
| **I. Marketplace-First** | **PASS** | The consumer planner exists to FEED the marketplace: its terminal fork routes demand to agents (durable `consumer_plan_request` lead) and honestly points self-book at the agent-prepared path. It is NOT a standalone-planner play (PRD non-goal) — every path funnels to the network. |
| **II. Agent Experience Is the Wedge** | **PASS** | No agent workflow regressed; the agent planner reuses the same engine via a mechanical, behavior-preserving refactor (call-sites updated in the same change). Consumer surface is brand-neutral (INV-020/INV-024). |
| **III. Budget-Aware AI, Priced Against Reality** | **PASS** | Reuses the SAME allocator + supply search + assembly the agents use — output is live-priced, budget-fit, with per-category/per-day breakdown. No static/unpriced suggestions. |
| **IV. Canonical Itinerary Schema** | **PASS** | Zero change to `@tripforge/itinerary-schema` (SCHEMA_VERSION `0.1.0` untouched). The transient compare itinerary IS a canonical `Itinerary` (ephemeral agencyId, never persisted). `consumer_plan_request` is a bolt-on operational table (like `trip_handoff_request`), not the canonical entity. **Not a schema-version bump → not ALWAYS-HALT.** |
| **V. Integrate Supply, Don't Contract It** | **PASS** | Pricing flows through the existing supply-adapter ports; no supplier shape crosses a boundary; no new adapter. |
| **VI. Trust, Provenance & Revenue-Share Integrity** | **PASS** | **No money path touched.** No booking/quote/markup/take-rate/revenue-share/ownership write on any consumer-planner path; the compare itinerary is never persisted; the lead has no money columns. INV-020 redaction reuses `toClientItineraryView`. Full consumer self-drive booking (which WOULD touch ownership/take-rate) is explicitly DEFERRED to an operator decision (spec Deferred D-2). |

**ALWAYS-HALT check (DIRECTIVE §2):** no constitution amendment, no canonical-itinerary
schema version bump/migration, no revenue-share/client-ownership semantics change, no gate
change, no push-to-main/deploy. A new operational table via `drizzle-kit push` is a routine
feature migration (precedent: spec 022 `trip_handoff_request`, spec 030/031 traveler tables).
**No gate is tripped. Proceed.**

**Post-design re-check:** design keeps all of the above (see data-model.md — the lead table
has zero money columns; contracts — all three procedures are `protectedProcedure`; the draft
procedure never persists). **PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/038-consumer-ai-planner/
├── plan.md              # this file
├── spec.md
├── research.md          # design decisions (reuse boundaries, ephemeral agencyId, redaction)
├── data-model.md        # consumer_plan_request table + reused entities
├── quickstart.md        # runnable validation guide
├── contracts/
│   └── consumer-planner-procedures.md   # clientView.planInterpret / planDraft / requestPlan
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source Code

```text
packages/db/src/
├── schema-consumer-planner.ts   # NEW: consumer_plan_request table (bolt-on, no money cols)
├── schema.ts                    # CHANGED: export + register consumer_plan_request
└── index.ts                     # CHANGED: re-export consumerPlanRequest

packages/api/src/
├── services/
│   ├── planner.ts               # CHANGED: interpretChatTripRequest(container,input) [drop unused session];
│   │                            #          plannerCore/draftOptions take agencyId:string (not session)
│   └── consumer-planner.ts      # NEW: draftConsumerOptions (redacted, ephemeral agencyId, no persist);
│                                #      submitConsumerPlanRequest (durable lead); input schemas
├── routers/
│   ├── itinerary.ts             # CHANGED: agent draft/interpret call-sites updated to new signatures
│   └── client-view.ts           # CHANGED: + planInterpret / planDraft / requestPlan (protectedProcedure)
└── __tests__/
    ├── l3-consumer-planner.test.ts        # NEW L3: interpret→draft(live-priced,redacted)→lead row; no money writes
    ├── consumer-planner-rbac.test.ts      # NEW: traveler→agent draft procedure = FORBIDDEN (negative)
    └── client-view-projection.test.ts     # CHANGED: assert consumer draft options carry no netRate

apps/web/
├── app/(client-view)/view/plan/
│   ├── page.tsx                 # NEW: signed-in-only consumer planner page (ClientSurfaceShell activeNav="plan")
│   └── consumer-planner.tsx     # NEW: brand-neutral chat→compare→fork client component (reuses server engine)
├── app/(client-view)/view/page.tsx   # CHANGED: "Plan a trip" home tile → live link
└── lib/client-nav.ts            # CHANGED: "plan" destination status "soon"→"live", href "/view/plan"

tests/e2e/
└── consumer-planner-journey.spec.ts   # NEW: traveler signs in → /view/plan → chat → build → pick → request-agent
```

**Structure Decision**: Web-application monorepo. The feature is confined to the consumer
`(client-view)` route group + the `clientView` router + a new consumer-planner service and a
bolt-on table. The agent workspace UI is untouched except behavior-preserving call-site
updates from the planner.ts refactor. A distinct consumer planner COMPONENT (not the agent
`ChatEntry`/`Planner`) is required by INV-024 (workspace UI must not leak into the client
experience) — it reuses the SERVER engine, not the agent UI.

## Complexity Tracking

No Constitution violations — table not required.
