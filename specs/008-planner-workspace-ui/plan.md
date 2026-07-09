# Implementation Plan: Workspace AI Itinerary Planner UI

**Branch**: `kitchen/fix-seed-0009a-planner-ui` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-planner-workspace-ui/spec.md`

## Summary

Give authenticated agents a real planner surface on the existing workspace page: a
trip-request form that calls the existing agent-gated `workspace.itinerary.draft`
tRPC mutation through a new typed browser tRPC client over the already-mounted
`/api/trpc` fetch handler (INV-018), then renders the returned canonical itinerary
(title, days, priced items, totals) and the per-category budget-fit summary, mapping
every typed business failure and transport error to a human-readable message.
Zero server-side changes: no new procedures, no contract changes, no schema or
money-path changes — UI + client wiring only.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), React 19, Next.js 15 (app router)

**Primary Dependencies**: `@trpc/client@11.18.0` (NEW dependency of `apps/web`,
exact-pinned to the workspace's locked `@trpc/server@11.18.0` — tRPC requires
matching client/server versions); `@tripforge/api` (type-only `AppRouter` import
for the typed client); existing Better Auth session cookie (no auth changes)

**Storage**: none added — draft persistence already happens server-side (spec 005)

**Testing**: Vitest L1 for the new pure view-logic helpers (form→request mapping,
failure→message mapping, minor-unit display formatting) — requires adding
`apps/web/lib/**/*.test.ts` to the root Vitest `include` (a strengthening,
non-sealed test-infra line; the oracle command itself is untouched); existing L2/L3
draft-flow and RBAC tests remain the server gate; Playwright e2e (L4) extends the
suite with a sign-in → plan → rendered-draft journey against the built compose
image (INV-027)

**Target Platform**: browser (Next.js app router page in the `(workspace)` route
group); serverless-compatible — no new server handlers, no in-process state (INV-028)

**Project Type**: web app (pnpm/turborepo monorepo, `apps/web`)

**Performance Goals**: draft round-trip is server-dominated (deterministic FakeLLM
locally, bounded Haiku tool loop when a key is configured); UI adds one POST and a
render — no client-side data recomputation

**Constraints**: INV-018 (single tRPC surface — browser client consumes the
existing `/api/trpc` mount); INV-023/024 (authorization per procedure unchanged;
page gate is UX only); INV-016 (draft stays on screen for agent review);
INV-010/FR-009 (no money arithmetic client-side — display formatting of exact
integer minor units only); INV-020 untouched (workspace surface only); INV-028
(no new server handler; streaming deferral remains ticketed as seed-0014)

**Scale/Scope**: one page (workspace), one new client component, one typed tRPC
client module, one pure view-logic helper module + unit tests, one e2e spec

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Makes the Build wedge usable in the browser — the enabler for the operator's demo path that ends in marketplace UI (seed-0009b/c/d all start from a rendered itinerary). Grows the installed agent base; no consumer-surface (P2) code. |
| II. Agent Experience Is the Wedge | PASS | This feature IS the time-to-client-ready-itinerary surface; it adds the missing browser experience and regresses nothing (form + render on the existing workspace page). Client-facing output untouched (workspace route group only; INV-020/024 separation preserved — US3/FR-008). |
| III. Budget-Aware AI, Priced Against Reality | PASS | Renders the allocator's per-category budget-fit breakdown (allocated vs spent vs state) and live-priced items exactly as returned (FR-004/005); introduces no static, unpriced planner output. Draft remains reviewable — agent stays the author of record (FR-010, INV-016). |
| IV. Canonical Itinerary Schema | PASS | The canonical document is rendered as received — never forked, extended, or re-computed (FR-004, SC-004). No schema change ⇒ no migration note required. |
| V. Integrate Supply, Don't Contract It | PASS | No supplier API shapes touched; the UI consumes only the canonical document + fit summary from the draft procedure. No adapter changes. |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | No money path is created or modified; the UI performs zero money arithmetic (FR-009 — display formatting of returned integer minor units only). Existing L3 money-path tests remain authoritative and untouched. |
| Non-Goals / MVP Scope Discipline | PASS | P0 agent-side surface. No ride-hailing/Airbnb/flights-MoR/generic-consumer-planner code; no P1+ items. |
| PMF instrumentation | PASS (no change) | `trip_created` is already emitted server-side in the draft transaction (INV-021, spec 005); this UI adds no new business action requiring events. |

**Pre-research gate: PASS** (no violations, no Complexity Tracking entries).

**Post-design re-check (after Phase 1): PASS** — design artifacts introduce no new
server surface, schema change, or money math; the only infra delta is one Vitest
include line and one exact-pinned client dependency.

## Project Structure

### Documentation (this feature)

```text
specs/008-planner-workspace-ui/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions D1–D9)
├── data-model.md        # Phase 1 output (view-model projections; no new persisted entities)
├── quickstart.md        # Phase 1 output (live validation guide)
├── contracts/
│   └── planner-ui.md    # Phase 1 output (consumed API contract + UI rendering contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/
├── package.json                              # MODIFIED: + @trpc/client@11.18.0 (exact pin)
├── lib/
│   ├── trpc/
│   │   ├── server.ts                         # existing (server-side context) — untouched
│   │   └── client.ts                         # NEW: typed browser tRPC client (AppRouter proxy over /api/trpc)
│   ├── planner-form.ts                       # NEW: pure view logic — form→tripRequest mapping+validation,
│   │                                         #      failure→message mapping, minor-unit display formatting
│   └── __tests__/
│       └── planner-form.test.ts              # NEW: L1 unit tests for the helpers
└── app/(workspace)/workspace/
    ├── page.tsx                              # MODIFIED: render <Planner> for verified agents
    │                                         #           (membership prompt branch unchanged)
    └── planner.tsx                           # NEW: client component — trip form, pending state,
                                              #      itinerary + budget-fit rendering, error display

tests/e2e/
└── planner-journey.spec.ts                   # NEW: L4 sign-in → plan → rendered-draft journey

vitest.config.ts                              # MODIFIED: + "apps/web/lib/**/*.test.ts" include
pnpm-lock.yaml                                # MODIFIED: lockfile entry for @trpc/client (dockerized lockfile-only regen)
```

**Structure Decision**: All new code lives in `apps/web` (presentation layer, INV-017:
apps → packages only — the client imports `AppRouter`/typed helpers from
`@tripforge/api` and nothing deeper). The planner is a client component composed by
the existing server-component page so the current identity gate and membership
prompt stay exactly as shipped by spec 007.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

## Live Test & Fix amendments (INV-027, 2026-07-09)

Two deltas landed inside this feature's live-verification cycle (defects fixed in
the same cycle; tasks.md Phase 7, research D10/D11):

1. **Draft verification alignment (FR-011, research D10)** — one app-layer change in
   `packages/api/src/services/planner.ts`: tool-lookup criteria and the verification
   sweep now derive from a single `canonicalCriteria(request)` helper, and the tool
   executors pin trip-scoped criteria to the trip request. Constitution re-check:
   no new server surface (procedure contracts and authorization untouched — FR-002
   holds), no schema change, no supplier shapes, no money math; spec 005's FR-003
   verification rule is preserved (hallucinated offer ids still drop). The spec's
   original "zero server-side changes" line is amended by FR-011 — the change is a
   defect fix in the feature's own draft path, not new surface.
2. **Premium presentation (research D11)** — the surface renders on the seed-0009s
   theme kit; behavior contracts and test-relied selectors unchanged.
