# Implementation Plan: Planner UX Redesign — Human Labels, Destination Picker, Hero Draft Card

**Branch**: `018-planner-ux-redesign` (implementation ships on `kitchen/fix-demo-05-planner-ux-redesign`) | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-planner-ux-redesign/spec.md`

## Summary

Redesign the workspace planner's presentation layer only: (1) replace the raw-enum `<select>` controls for budget mode and trip style with human-labeled segmented controls that map 1:1 to the existing values, (2) replace the bare destination `<input>` with a searchable picker seeded with four hero destinations (Lisbon, Tokyo, Marrakech, Reykjavik) plus a free-text fallback, and (3) replace the plain-table drafted-itinerary result with a single premium hero card (image-forward header via CSS gradient, day timeline, budget breakdown) reusing the existing `.tf-*`/`.home-card` styling vocabulary. No change to `DraftInput`/`DraftOutput`, the canonical itinerary schema, budget math, or the tRPC `workspace.itinerary.draft` subscription contract — this is presentation-only, built entirely inside `apps/web`.

## Technical Context

**Language/Version**: TypeScript (Next.js 15 / React, app router), strict mode, ESM (`.js` extension imports per existing convention)

**Primary Dependencies**: `@tripforge/api` (tRPC router/types), `@trpc/client` (subscription), React (client components, `"use client"`) — no new dependencies

**Storage**: N/A — no new persistence; destination seed list is a static in-repo constant

**Testing**: Vitest (root `pnpm test`, Node environment for `apps/web/lib/__tests__/*`); component-level logic kept in DOM-free pure functions per the existing `planner-form.ts` pattern so it's testable under the same runner

**Target Platform**: Web (existing Next.js app, `apps/web`), same responsive breakpoints as the current planner form (`@media (max-width: 640px)` in `globals.css`)

**Project Type**: Web application (monorepo `apps/web` + shared `packages/*`) — this feature touches only `apps/web`

**Performance Goals**: No regression to draft-latency perception; the destination picker and hero card are pure client-side rendering with no new network calls

**Constraints**: Presentation-only (FR-009): must not alter `DraftInput`/`DraftOutput` shapes, must not add client-side money arithmetic beyond the existing `formatMinorAmount` path, must not depend on external image hosting (FR-011)

**Scale/Scope**: One client component (`planner.tsx`) restructured into a form section + result section, one new pure-logic addition (destination seed list + label maps) in `planner-form.ts`, CSS additions in `globals.css` following existing `.tf-*`/`.home-card` conventions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First** — N/A direct marketplace impact, but this strengthens the Build wedge (Principle II) that funnels agents toward the network; not a non-goal item. PASS.
- **II. Agent Experience Is the Wedge** — this feature *is* the agent-experience polish the principle calls for (time-to-client-ready-itinerary is unaffected functionally, but the tool now looks client-presentable, which the principle explicitly requires — "client-facing output... MUST always look like the agent's brand, never TripForge's... white-label presentation is a first-class requirement"). No white-label/brand data changes here (out of scope), no regression to draft speed. PASS.
- **III. Budget-Aware AI, Priced Against Reality** — no change to planner AI behavior, budget allocation, or live-pricing; the budget summary is still rendered from the server-computed `fit` object verbatim. PASS.
- **IV. Canonical Itinerary Schema** — explicitly NOT touched (FR-009); no schema/version change; no migration note needed. PASS.
- **V. Integrate Supply, Don't Contract It** — no supplier calls added; destination seed list is UI-only metadata (display name + CSS treatment), not a supply/inventory concept. PASS.
- **VI. Trust, Provenance & Revenue-Share Integrity** — not a money path; no payments/take-rate/commission code touched. The mandatory "money paths require integration tests" rule does not apply (no money-path behavior changes — only display formatting of already-computed values). PASS.
- **Compliance & Content Sourcing (imagery)** — the hero card and destination picker use CSS-only gradient/graphic treatments, explicitly avoiding "AI-generated imagery as real place photos" and avoiding any scraped/unlicensed photography, per the Assumptions section of the spec. PASS.

No violations; Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/018-planner-ux-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output (UI contract only — no network contract change)
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
apps/web/
├── app/globals.css                                    # + destination-picker, segmented-control,
│                                                        #   hero-card CSS (new .tf-/.home-card-family rules)
├── app/(workspace)/workspace/planner.tsx               # restructured: segmented controls, destination
│                                                        #   picker, hero result card (replaces plain table)
└── lib/
    ├── planner-form.ts                                  # + destination seed list, budget-mode/trip-style
    │                                                     #   label maps, destination-picker value mapping
    └── __tests__/planner-form.test.ts                    # + tests for new pure-logic additions
```

**Structure Decision**: Single existing web app (`apps/web`), no new package. All changes are additive within the existing `planner.tsx` client component and its companion pure-logic module `planner-form.ts`, plus CSS-only additions to the shared `globals.css` theme file — consistent with how the rest of the workspace UI (`booking-flow.tsx`, `share-control.tsx`, etc.) is organized (one component + a DOM-free logic module tested under Vitest).

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
