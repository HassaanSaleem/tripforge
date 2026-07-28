# Implementation Plan: Two-sided landing pages (global + travelers + agents)

**Branch**: `kitchen/fix-goal-landing-pages-two-sided` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-landing-pages/spec.md`

## Summary

Rework the public global landing (`apps/web/app/page.tsx`) into a true two-sided
overview that forks clearly to a traveler story and an agent story, and add two
new public marketing routes — `/for-travelers` and `/for-agents` — each telling
its side's story and embedding a staged real demo video (native `<video>`,
poster, `preload="metadata"`, controls, no autoplay-with-sound). A small shared
nav component links Home + For travelers + For agents + both sign-ins across all
three pages. Styling is additive to the existing `.tf-*`/`.home-*` token kit in
`globals.css`; there is **no** server, schema, money, supply-adapter, or auth
change. e2e covers nav between the three pages, and the existing home smoke
assertion (heading "TripForge" + /Agency workspace/i link) is preserved.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19 / Next.js (App Router), as used by `apps/web`.

**Primary Dependencies**: Next.js App Router (`next/link`), the existing `globals.css` design-token kit. No new runtime dependencies.

**Storage**: N/A — no persistence; pages are static marketing content.

**Testing**: Playwright e2e (`tests/e2e/`, `@playwright/test`) for the live nav journey + preserved smoke; no unit tests needed (no logic). Existing `smoke.spec.ts` stays green.

**Target Platform**: Web (server-rendered React pages served by the compose `web` image; INV-027 live verification against the built image).

**Project Type**: Web application front-end (marketing routes in the existing Next.js app).

**Performance Goals**: Fast first render; videos use `preload="metadata"` + a poster so the ~20MB agent demo (and ~3MB client demo) download only on user play — initial page weight stays image-light.

**Constraints**: No horizontal scroll at ~375px on all three pages; real staged assets only; build on shared tokens (no per-page style fork, no off-palette hardcoded colors); no dark-palette introduction.

**Scale/Scope**: 3 pages (1 reworked + 2 new), 1 shared nav component, additive CSS, 1 new e2e spec. No API/DB/auth surface.

## Constitution Check

*GATE: evaluated before and after design. Landing pages are presentation/routing only, so most principles are structurally N/A; the ones that bind are I, II, and Compliance & Content Sourcing.*

- **I. Marketplace-First Product Strategy** — PASS. The travelers page is framed as demand that funnels into the agent network (plan a trip / have an agent arrange it), never a standalone-planner pitch (FR-003). The two-sided overview foregrounds the agent surface (the wedge that feeds the marketplace). No consumer feature here competes in the non-goal "generic consumer trip-planning play."
- **II. Agent Experience Is the Wedge** — PASS. The rework lifts the public front door to a premium travel-grade bar (Deliverable 5 spirit) and gives the agent story a first-class dedicated page. No agent workflow is touched or regressed. INV-020 (white-label) is unaffected — these are public marketing pages under the root layout, not the `(client-view)` group, and expose no agent/client data.
- **III. Budget-Aware AI Priced Against Reality** — N/A. No planner/AI output; the pages describe the capability, they do not produce itineraries.
- **IV. Canonical Itinerary Schema** — N/A / PASS. No schema touched (FR-013); no versioned migration note required.
- **V. Integrate Supply, Don't Contract It** — N/A / PASS. No supplier API shapes, no adapter code (FR-013).
- **VI. Trust, Provenance & Revenue-Share Integrity** — N/A / PASS. No money path, take-rate, or revenue-share code (FR-013); no L3 money-path test required because no money path changes.
- **Compliance & Content Sourcing** — PASS. Only staged, real assets (`/demos/*.mp4`, `/shots/*`) are used; no fabricated place imagery, no AI-generated visuals presented as real, no scraped/re-hosted third-party photos (FR-012).
- **MVP Scope Discipline** — PASS. This is GOAL.md Deliverable 1, operator-authorized for the campaign (the consumer surface P2 pull-forward is the explicit operator scope decision the constitution requires). The pages are marketing surface only; they do not pull forward any P2/P3 *functionality*.

**Result: PASS — no violations, Complexity Tracking not required.** Money-path/schema ALWAYS-HALT gates (DIRECTIVE §2) are not triggered: no money, schema, revenue-share, or client-ownership semantics change.

## Project Structure

### Documentation (this feature)

```text
specs/032-landing-pages/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — decisions/rationale
├── quickstart.md        # Phase 1 — manual verification recipe
└── checklists/
    └── requirements.md  # Spec quality checklist (all pass)
```

No `data-model.md` (no entities) and no `contracts/` (no API surface) — both intentionally omitted.

### Source Code (repository root)

```text
apps/web/app/
├── page.tsx                     # REWORK — two-sided overview + fork
├── layout.tsx                   # unchanged (root layout)
├── globals.css                  # EXTEND — additive .home-split / .lp-* marketing classes
├── components/
│   └── marketing-nav.tsx        # NEW — shared public nav (server component)
├── for-travelers/
│   └── page.tsx                 # NEW — consumer story + client demo video
└── for-agents/
    └── page.tsx                 # NEW — professional story + agent demo video

apps/web/public/
├── demos/tripforge-clients.mp4  # staged (existing)
├── demos/tripforge-agents.mp4   # staged (existing)
└── shots/{clients,agent}/*.png  # staged posters/imagery (existing)

tests/e2e/
└── landing-pages-journey.spec.ts # NEW — nav between the 3 pages + video/poster/CTA assertions
```

**Structure Decision**: New marketing routes live at the app root (`apps/web/app/for-travelers`, `apps/web/app/for-agents`) so they inherit the root `layout.tsx` and the product theme — deliberately NOT inside `(client-view)` (which is white-labeled/brand-neutral, INV-020) nor `(workspace)` (agent-gated). A single shared server component `apps/web/app/components/marketing-nav.tsx` renders the nav on all three pages so link labels/targets stay consistent (guards against nav-label drift). A poster + `preload="metadata"` keeps the large video assets lazy.

## Phase 0 — Research (see research.md)

Key decisions: native `<video>` over any player lib; `preload="metadata"` + poster for weight; server components (no client JS needed — pure links/markup); marketing routes at app root; additive CSS classes only; distinct nav labels ("For travelers"/"For agents") chosen to avoid the getByRole substring-collision class (memory: e2e-nav-label-substring-collision) with existing "Travelers"/"Agency workspace" labels.

## Phase 1 — Design

- **`marketing-nav.tsx`** (server component): brand link to `/`, links to `/for-travelers`, `/for-agents`, traveler sign-in (`/view/sign-in`), agent sign-in (`/sign-in`). Accessible names deliberately distinct from existing collision-prone labels.
- **`page.tsx` rework**: keep the polished hero shell, but restructure into a two-sided overview — a clear "two products, one engine" framing with a visible split into a **For travelers** card/panel (links `/for-travelers`) and a **For agents** card/panel (links `/for-agents`). Preserve a heading named "TripForge" and a link matching /Agency workspace/i (FR-002) so the smoke stays green.
- **`for-travelers/page.tsx`**: marketing nav + consumer story sections + `<video controls preload="metadata" poster="/shots/clients/01-shared-trip.png"><source src="/demos/tripforge-clients.mp4" type="video/mp4"></video>` + CTA to `/view/sign-in`. Framing funnels to plan-or-request-an-agent (Principle I).
- **`for-agents/page.tsx`**: marketing nav + professional story sections + `<video controls preload="metadata" poster="/shots/agent/01-dashboard.png"><source src="/demos/tripforge-agents.mp4" type="video/mp4"></video>` + CTA to `/sign-up`.
- **CSS**: additive marketing classes in `globals.css` under a new comment section, reusing existing tokens (`--sea`, `--coral`, `--surface`, `--line`, radii, shadows). Responsive single-column reflow at ≤880px / ~375px. No new tokens, no dark palette.

## Phase 1 — Post-Design Constitution Re-Check

Unchanged from the pre-design check: still PASS on all axes (I/II/Compliance bind and pass; III/IV/V/VI N/A). No new violations introduced by the design; no server/schema/money surface added.

## Complexity Tracking

*No Constitution Check violations — section intentionally empty.*
