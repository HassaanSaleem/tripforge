# Implementation Plan: Workspace Itinerary List

**Branch**: `kitchen/fix-seed-0017-workspace-itinerary-list` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-workspace-itinerary-list/spec.md` (ticket seed-0017)

## Summary

Add the missing itinerary surface to `/workspace`: a premium-theme panel
listing the signed-in agency's itineraries (newest first — title, currency,
created date) with an open-in-place "continue work" view that renders the
canonical day-by-day plan and reuses the existing `BookingFlow` and
`ShareControl` components. Pure read-side UI: the panel drives the EXISTING
agent-gated `workspace.itinerary.list` and `workspace.itinerary.get`
procedures through the typed browser tRPC client. No new server procedures,
no canonical-schema change, no new money math. A newly drafted trip appears
in the list without a reload (planner → panel refresh signal); a licensed
white-label copy appears on the next workspace visit (fresh mount load,
L3-pinned).

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm + turborepo monorepo, ADR-0001)

**Primary Dependencies**: Next.js app router (apps/web, route group
`(workspace)` per INV-024), React client components, tRPC v11 typed browser
client (`apps/web/lib/trpc/client.ts`, inference-only types per QS3-1
premature-export rule), Better Auth session cookie (implicit via same-origin
`/api/trpc`)

**Storage**: none new — reads existing Postgres rows via the existing
tenant-scoped procedures (`listItineraries`, `itineraryOverview`)

**Testing**: Vitest L1 (pure lib helpers) + L3 vs real Postgres (extend
`l3-itinerary-list.test.ts` with the license→copy-in-list integration
assertion); Playwright L4 e2e against the built compose image (INV-027)

**Target Platform**: web, built compose image (Next.js standalone);
INV-028-safe by construction (client-side reads only, no in-process server
state introduced)

**Project Type**: web app in an existing monorepo

**Performance Goals**: list renders on workspace mount with one query; open
view one additional query; no pagination at P0 trip counts (spec assumption)

**Constraints**: zero client-side money arithmetic (INV-009/010 — existing
`formatMinorAmount` formatter only); tenant isolation entirely server-side
(INV-004, existing procedures); workspace/client-view surface separation
untouched (INV-020/024); premium `.tf-*` theme bar (seed-0009s); canonical
itinerary schema untouched (Constitution IV)

**Scale/Scope**: one page composition change, two new client components, one
extracted shared presentational component, one new pure-helper lib module,
one additive prop on `Planner`, CSS kit additions, ~3 test files touched

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 before
Phase 0; re-evaluated after Phase 1 design — both PASS.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Makes the license receipt's "in your workspace" promise true on the workspace itself — closes the licensed-copy visibility loop that feeds marketplace trust; no consumer-surface work. |
| II. Agent Experience Is the Wedge | PASS | Directly reduces time-to-client-ready-itinerary across sessions (find + reopen + book/share). Premium `.tf-*` bar required by FR-010. No workflow regression: planner untouched except an additive callback. |
| III. Budget-Aware AI, Priced Against Reality | PASS (N/A) | No AI/planner change. The panel renders already-priced canonical documents; introduces no unpriced planner output. |
| IV. Canonical Itinerary Schema | PASS | No schema change. Read-side projections only (list entry = id/title/currency/createdAt; open view renders the canonical document as returned). No fork, no private extension. |
| V. Integrate Supply, Don't Contract It | PASS (N/A) | No supplier code touched; UI consumes canonical items only — no supplier API shapes outside the adapter (SC grep re-run in CI). |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | No money path touched. Zero client money arithmetic (FR-009); booking/share reuse the existing L3-tested flows unchanged. New L3 assertion pins license → copy visible in the buyer's tenant-scoped list. |
| Non-Goals / MVP discipline | PASS | P0 agent-side surface; no P1+ item; pagination/search explicitly deferred. |
| PMF instrumentation | PASS (N/A) | Reads only — no trip-creation/booking/marketplace transaction added, so no new events are owed. Existing events untouched. |

**Development-workflow gates**: SDD flow followed (this plan); no schema
migration note needed (no schema change); money-path L3 rule not triggered
(no money-path change) — the license→list L3 addition is coverage
strengthening, not a gate requirement.

## Project Structure

### Documentation (this feature)

```text
specs/012-workspace-itinerary-list/
├── spec.md              # Feature spec (done)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D10
├── data-model.md        # Phase 1 — read-side projections (no new entities)
├── quickstart.md        # Phase 1 — live validation guide
├── contracts/
│   └── workspace-list-ui.md   # Panel states, reused procedure contracts
├── checklists/requirements.md # Spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/web/
├── app/(workspace)/workspace/
│   ├── page.tsx                 # MODIFIED: compose <WorkspacePanels /> (was <Planner />)
│   ├── workspace-panels.tsx     # NEW: client wrapper — Planner + ItineraryList, refresh signal (D2)
│   ├── itinerary-list.tsx       # NEW: list panel + open-in-place view (D3), reuses BookingFlow/ShareControl (D4)
│   ├── itinerary-days.tsx       # NEW: day-by-day presentational component extracted from planner.tsx DraftResult (D5)
│   ├── planner.tsx              # MODIFIED: additive optional onDrafted callback (D2); DraftResult renders <ItineraryDays /> (D5)
│   ├── booking-flow.tsx         # UNCHANGED (reused)
│   └── share-control.tsx        # UNCHANGED (reused)
├── app/globals.css              # MODIFIED: .tf-triplist* kit additions (D9)
├── lib/
│   ├── itinerary-list.ts        # NEW: pure helpers — created-date formatting, failure wording (D6, D7)
│   ├── trpc/client.ts           # MODIFIED: add GetItineraryOutput inference type (D4)
│   └── __tests__/itinerary-list.test.ts  # NEW: L1 for the pure helpers
packages/api/src/__tests__/
└── l3-itinerary-list.test.ts    # EXTENDED: license → copy appears in buyer's list (never weakened)
tests/e2e/
└── workspace-list-journey.spec.ts  # NEW: L4 — empty state, draft→list w/o reload, open→continue, license→copy in list
```

**Structure Decision**: existing web-app monorepo layout; all UI work stays
inside `apps/web` `(workspace)` route group (INV-024); pure display logic in
`apps/web/lib` with L1 tests (established pattern: `planner-form.ts`,
`marketplace-flow.ts`); no package boundaries crossed (dependency-cruiser
must stay clean).

## Complexity Tracking

No constitution violations — table intentionally empty.

## Pre-Write Discipline (recorded for the PR body)

- **reuse**: `workspace.itinerary.list` + `workspace.itinerary.get`
  procedures; `BookingFlow`; `ShareControl`; `formatMinorAmount`;
  `transportErrorMessage`; `.tf-*` theme kit.
- **extend**: `Planner` (additive optional `onDrafted` prop);
  `lib/trpc/client.ts` (one inference type export);
  `l3-itinerary-list.test.ts` (new assertion); `globals.css` (kit additions).
- **generalize**: day-by-day rendering extracted from `DraftResult` into
  `ItineraryDays` — 2 call sites now share the shape (extraction threshold
  met: planner drafted view + opened-itinerary view).
- **new**: `workspace-panels.tsx`, `itinerary-list.tsx` (panel/view),
  `lib/itinerary-list.ts` (pure helpers), e2e journey spec — no existing
  export covers these; nearest neighbor `marketplace-panel.tsx` is a
  different surface with different states (pattern followed, not duplicated).
