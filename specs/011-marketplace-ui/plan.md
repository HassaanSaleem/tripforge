# Implementation Plan: Marketplace UI — browse, list, license

**Branch**: `kitchen/fix-seed-0009d-marketplace-ui` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-marketplace-ui/spec.md`

## Summary

Wire the existing, fully-tested trade-layer tRPC surface (spec 006:
`workspace.marketplace.browseListings/createListing/licenseListing`) to a real
agent-facing marketplace page in the `(workspace)` route group. Three journeys:
browse active cross-tenant listings (with ratings display and a "your listing"
marker), list one of the agency's own itineraries with declared terms, and
license another agency's listing — confirming the white-label copy and the
recorded revenue split verbatim. One small NEW read procedure
(`workspace.itinerary.list` — id/title/currency of the agency's own
itineraries, INV-004 tenant-scoped) gives the listing form a real picker. All
view logic (input mapping, refusal→message, formatting) lives in pure DOM-free
helpers with L1 tests (spec 009 `booking-flow.ts` precedent); presentation
rides the seed-0009s `.tf-*` theme kit. No new money semantics, no schema
change, no supplier shapes.

## Technical Context

**Language/Version**: TypeScript 5.x (repo-wide strict config)

**Primary Dependencies**: Next.js App Router (apps/web), tRPC 11 (typed browser
client over `/api/trpc`, spec 008 research D1), `@tripforge/api` router types
(inference only), `@tripforge/marketplace` (existing flows, untouched),
Better Auth session (cookie rides the same-origin fetch)

**Storage**: PostgreSQL via Drizzle — READ-ONLY addition (one tenant-scoped
select for the picker); no schema change, no migration

**Testing**: Vitest L1 for pure view helpers + L3 for the new read procedure
(real Postgres, `packages/api` harness precedent); Playwright e2e journey
(list→license across two agencies) against the built compose image (INV-027)

**Target Platform**: Web (built compose image; Vercel-serverless-correct per
INV-028 — no in-process cross-request state anywhere in this feature)

**Project Type**: Web application (pnpm/turborepo monorepo; apps/web + packages/api)

**Performance Goals**: Browse renders in one query round-trip; list/license
actions complete in one mutation + one browse refresh (SC-001: full journey
< 2 min)

**Constraints**: INV-004 (tenant scoping of the new read), INV-010 (no money
math outside packages/domain — UI displays server integers verbatim; the only
numeric input conversions are fee major→minor and percent→bps, both established
input-mapping precedents from spec 008/009), INV-020/024 (workspace surface —
platform branding allowed here, client-view untouched), INV-023 (authorization
stays in agentProcedure), INV-018 (same mounted tRPC surface mobile consumes)

**Scale/Scope**: 1 new page + 1 client panel + 1 pure helper module (+tests) +
1 read procedure (+L3 test) + 1 e2e spec + theme-kit CSS additions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | **PASS** | This IS the trade-layer surface: it makes list/license/white-label usable by real agents in a browser — the P0 liquidity milestone's missing UI half. Nothing here serves a non-marketplace goal. |
| II. Agent Experience Is the Wedge | **PASS** | Sell-grade `.tf-*` presentation (operator premium-UI directive); adds a workspace capability without touching or regressing time-to-client-ready-itinerary flows (planner/booking untouched apart from a nav link). |
| III. Budget-Aware AI | **PASS (no impact)** | No AI behavior changes; no unpriced planner output introduced. |
| IV. Canonical Itinerary Schema | **PASS** | No schema change. The UI never forks or extends the document — the picker reads id/title/currency projections; white-label copying stays entirely server-side (spec 006). |
| V. Integrate Supply, Don't Contract It | **PASS** | Zero supplier API shapes; the page speaks only to the mounted tRPC surface. |
| VI. Trust, Provenance & Revenue-Share Integrity | **PASS** | Displays the transaction path's recorded split verbatim (no client recomputation); typed refusals (vetting, own-listing, already-licensed, provenance-incomplete) surfaced in plain language. The money path itself (INV-012 single-transaction license) is untouched and already L3-tested (spec 006); this feature adds a live e2e witness on top. The new read procedure is not a money path. |
| Non-Goals | **PASS** | Agent-side P0 marketplace work; no consumer surface, flights, Airbnb, or imagery concerns. |
| MVP Scope Discipline | **PASS** | P0: "basic marketplace where vetted agents list and other agents license/white-label trips; ratings + revenue-share plumbing" — this is exactly that surface. Rating SUBMISSION UI and seller deactivation UI are deferred with a follow-up ticket (display-only ratings ship now). |
| PMF Instrumentation | **PASS** | `listing_created` / `take_rate_accrued` / `trip_created(source=licensed)` events already emitted inside the existing flows; no event changes needed. |

**Post-Phase-1 re-check (2026-07-10)**: design artifacts introduce no schema
change, no money math outside domain, no supplier shapes, no P1+ scope —
verdicts unchanged. **GATE PASSED.**

## Project Structure

### Documentation (this feature)

```text
specs/011-marketplace-ui/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D10
├── data-model.md        # Phase 1 — view models + new read projection
├── quickstart.md        # Phase 1 — live validation guide
├── contracts/
│   └── marketplace-ui.md  # Page/procedure/helper contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (passed)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/web/
├── app/(workspace)/marketplace/
│   ├── page.tsx                 # NEW server component: identity gate + shell (workspace page precedent)
│   └── marketplace-panel.tsx    # NEW client component: browse + list form + license actions
├── app/(workspace)/workspace/page.tsx   # TOUCH: nav link to /marketplace in the header
├── app/globals.css              # TOUCH: .tf-market* additions to the theme kit (presentation only)
├── lib/
│   ├── marketplace-flow.ts      # NEW pure DOM-free view logic (mapping + messages + formatting)
│   ├── basis-points.ts          # NEW shared percent→bps mapper (generalized from booking-flow's toMarkupBps)
│   ├── booking-flow.ts          # TOUCH: toMarkupBps delegates to basis-points.ts (behavior identical)
│   └── __tests__/marketplace-flow.test.ts  # NEW L1 tests (booking-flow.test.ts precedent)
packages/api/src/
├── routers/itinerary.ts         # TOUCH: add `list` read procedure (agent-gated)
├── services/booking.ts          # TOUCH: add listItineraries() next to itineraryOverview()
└── __tests__/                   # NEW L3 test: tenant scoping of workspace.itinerary.list
tests/e2e/
└── marketplace-journey.spec.ts  # NEW: two-agency list→license journey vs built image
```

**Structure Decision**: Mirror of spec 008/009/010 — server-component page gate
in the `(workspace)` route group, one client panel component, pure view logic in
`apps/web/lib` with root-vitest L1 tests, procedure additions in
`packages/api/src/routers` backed by a service function, e2e journeys in
`tests/e2e`. No new packages, no new layers.

## Complexity Tracking

No Constitution Check violations — table intentionally empty.
