# Implementation Plan: Consumer "What's Hot" Discovery Feed

**Branch**: `039-consumer-whats-hot-feed` (worked on `kitchen/fix-goal-consumer-whats-hot-feed`) | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-consumer-whats-hot-feed/spec.md`

## Summary

Bring the already-shipped agent-side "What's Hot" feed (spec 023) to the **signed-in traveler consumer surface**. Today `/view/discover` renders an honest "coming soon" placeholder (`DiscoveryComing`) and the nav entry is a "soon" signpost; the real feed only exists in the agent workspace. This feature gives travelers the same experience — a destination picker + a grid of ≥3 curated cards per destination (licensed imagery, blurb, hotel highlight) — but each card's **"Plan this"** routes into the **consumer** planner (`/view/plan?destination=…`), not the agent workspace. The consumer planner (chat-first, spec 038) gains an optional seed destination that pre-fills its first chat message.

The core clean-architecture move: the existing feed card + picker/grid live under `apps/web/app/(workspace)/discover/` and hardcode `/workspace?destination=`. Importing a `(workspace)`-grouped component into the `(client-view)` surface would violate **INV-024** (workspace UI must never leak into the client experience). So the two presentational components are **extracted to a neutral, user-type-agnostic module** (`apps/web/app/components/`) and **generalized** with a `planPath` prop; the workspace Discover page keeps identical behavior (`planPath="/workspace"`), and the new consumer Discover page passes `planPath="/view/plan"`. No database, canonical-schema, tRPC, money, supply-adapter, or revenue-share change.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js (App Router) — existing stack (ADR-0001), no change.

**Primary Dependencies**: None new. Reuses `apps/web/lib/discover-feed.ts` (`WHATS_HOT_FEED`, `feedItemsForDestination`, `DiscoverFeedItem`), `apps/web/lib/planner-form.ts` (`HERO_DESTINATIONS`), `apps/web/lib/client-nav.ts` (existing `discover` nav entry, currently `status:"soon"`), `apps/web/app/(client-view)/view/components/client-surface-shell.tsx` (existing signed-in traveler shell), `apps/web/lib/auth.ts` (`getSessionContext`, the same signed-in gate `/view/plan` uses), and the `.tf-discover-*` design-token classes already in `apps/web/app/globals.css`.

**Storage**: N/A — feed content is the existing static, in-repo TypeScript data module, not database-backed.

**Testing**: Vitest (L1 — the extracted shared components render the same testids; a pure assertion that the consumer feed data is the same curated set) + Playwright (e2e — signed-in traveler: open Discover → pick destination → feed renders → "Plan this" → consumer planner opens seeded; signed-out → redirect to sign-in; INV-020 brand-neutral negative). Matches this repo's `apps/web/**/__tests__/*` and `tests/e2e/*.spec.ts` conventions.

**Target Platform**: Web — existing Next.js `apps/web`, `(client-view)` route group. No new platform surface.

**Project Type**: Web application (existing monorepo; this feature touches only `apps/web`, no `packages/` changes).

**Performance Goals**: No new network round trip for feed content (static import). Page-interactive time stays within the existing consumer-surface norm; no new target.

**Constraints**: Curated content only (no live external API); an image load failure MUST NOT block a card's blurb/hotel-highlight/"Plan this" usability (reused card already handles this — spec Edge Cases / FR-010); imagery MUST be real, licensed, attributed (Compliance & Content Sourcing / FR-009); the consumer surface MUST stay brand-neutral (INV-020 / FR-011) and free of workspace-component imports (INV-024 / FR-012); the destination seed MUST NOT auto-submit or bypass planner validation (FR-007).

**Scale/Scope**: 4 featured destinations (reused, unchanged) × ≥3 items each (≥12 items). Two components extracted+generalized (card, picker/grid) + one workspace page repointed to them, one new consumer Discover page, one nav entry flipped to live, one consumer planner prop threaded (page → `ConsumerPlanner`), plus tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First Product Strategy** — PASS. Every consumer feed card's sole action ("Plan this") routes into the consumer budget-aware AI planner, whose terminal fork is **request-an-agent** (routes demand into the agent network) or self-book of an agency-prepared trip — Discover has no content-only dead end (FR-005, SC-002). This is the exact "consumer surface exists to feed the marketplace" mandate; it is not a standalone generic-planner play (GOAL.md Thesis; PRD §9.7).
- **II. Agent Experience Is the Wedge** — PASS. This is the consumer surface; it adds no agent-facing cost and does not regress the agent workspace. The workspace Discover behavior is preserved byte-for-byte (the extracted components render identical testids/markup; `planPath` defaults to the workspace path for that surface). The consumer planner's seed is additive (absent seed → today's behavior, FR-006).
- **III. Budget-Aware AI, Priced Against Reality** — PASS. Feed items are inspirational curated content, carrying no price claim; the only planner-facing effect is seeding the destination into the real, already-compliant budget-aware consumer planner (live-priced options). No static/unpriced suggestion is presented as bookable.
- **IV. Canonical Itinerary Schema** — N/A / PASS. Feature produces no itinerary-schema instances and modifies no schema file (FR-013).
- **V. Integrate Supply, Don't Contract It** — PASS. No supplier API call, no supply-adapter dependency; hotel-highlight text is static curated copy. Live pricing still happens only inside the unchanged planner after "Plan this" (FR-013).
- **VI. Trust, Provenance & Revenue-Share Integrity** — N/A / PASS. No marketplace resale, revenue-share, client-ownership, or money path touched (FR-013).
- **Non-Goals** — PASS. No ride-hailing, flights-MoR, Airbnb inventory, scraped/fabricated imagery, or **generic** consumer-planner surface introduced — the feed is bookable and agent-connected (Constitution I), staying inside the operator-scoped consumer pull-forward, not the PRD non-goal.
- **MVP Scope Discipline (P2 gate)** — The consumer/client "What's Hot" discovery feed is roadmap **P2** (PRD §11; `kitchenloop.yaml spec.blocked` lists `whats-hot-feed`/`consumer-surface` as P2). The constitution requires "an explicit operator scope decision" before a P1+ item enters planning. That decision is **GOAL.md (set 2026-07-21, DIRECTIVE §6, owner Hassaan)**: it authorizes the consumer-surface pull-forward and names this feature in **Deliverable 2.2** ("See what's hot — a 'What's Hot' discovery feed on the consumer surface (PRD §9.7). Every feed item is actionable…"). The ticket `goal-consumer-whats-hot` (`priority: "critical"`) is operator-filed under that goal. This bounded P2 promotion is the required scope-decision citation, not a Complexity Tracking violation (same pattern as spec 023's `demo-08-discover` and spec 038's consumer-planner pull-forward).
- **Compliance & Content Sourcing** — PASS. All imagery is the already-vetted licensed-stock set from `discover-feed.ts` (Unsplash CDN, `MediaSourceSchema` `licensed-stock`, attribution present) — reused unchanged; no scraped or AI-generated imagery (FR-009).
- **Development Workflow (Simplicity default)** — PASS. Reuse-and-generalize over duplicate: the shared card/picker are extracted once to a neutral module rather than copied into the consumer surface (Pre-Write "generalize/extract"). SDD flow followed (this plan). Static data over a router for non-tenant/non-money curated content.

No Complexity Tracking entries — no principle violations, only the P2-gate scope-decision citation above.

**Post-Phase 1 re-check**: unchanged — Phase 1 design (data-model.md, contracts/) introduced no database, schema, tRPC, or money-path surface; the only cross-page interface is the existing `?destination=` seed pattern (already used by the workspace planner, spec 023) applied to the consumer planner. Every gate above still holds.

## Project Structure

### Documentation (this feature)

```text
specs/039-consumer-whats-hot-feed/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── discover-to-consumer-planner-handoff.md
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/web/
├── lib/
│   ├── discover-feed.ts                       # UNCHANGED — reused curated data
│   ├── client-nav.ts                          # MODIFIED — flip `discover` entry: href "/view/discover", status "live"
│   └── planner-form.ts                        # UNCHANGED — HERO_DESTINATIONS reused
├── app/components/
│   ├── discover-feed-card.tsx                 # NEW — extracted from (workspace)/discover/feed-item-card.tsx; adds `planPath` prop
│   └── discover-feed-view.tsx                 # NEW — extracted from (workspace)/discover/discover-feed-view.tsx; threads `planPath`
├── app/(workspace)/discover/
│   ├── page.tsx                               # MODIFIED — import shared DiscoverFeedView, pass planPath="/workspace"
│   ├── discover-feed-view.tsx                 # DELETED — moved to app/components (behavior preserved)
│   └── feed-item-card.tsx                     # DELETED — moved to app/components (behavior preserved)
├── app/(client-view)/view/discover/
│   └── page.tsx                               # MODIFIED — signed-in gate + ClientSurfaceShell + shared DiscoverFeedView (planPath="/view/plan"), replacing DiscoveryComing
├── app/(client-view)/view/plan/
│   ├── page.tsx                               # MODIFIED — read searchParams.destination, pass initialDestination
│   └── consumer-planner.tsx                   # MODIFIED — accept optional initialDestination, pre-fill first chat message
├── app/(client-view)/view/discovery-coming.tsx # UNCHANGED — still used by /view/marketplace placeholder (if any); Discover no longer imports it
└── app/globals.css                            # UNCHANGED expected — `.tf-discover-*` classes already exist; add consumer wrapper only if a spacing gap appears

tests/
├── e2e/consumer-discover-journey.spec.ts      # NEW — traveler: Discover → pick → feed → Plan this → planner seeded; signed-out redirect; brand-neutral negative
└── (unit) apps/web/app/components/__tests__/discover-feed-card.test.tsx  # NEW/or extend — planPath handoff + fallback
```

**Structure Decision**: Single-app change inside `apps/web`. The shared presentational components move to the existing neutral `apps/web/app/components/` directory (which already holds cross-surface components like `marketing-nav.tsx`, `media-thumb-image.tsx`) so neither route group imports the other's UI (INV-024). Both Discover pages (workspace + consumer) render the same extracted `DiscoverFeedView`, differing only by the `planPath` prop and their surrounding shell/guard. This is extend-in-place + extract-shared, per the repo's clean-architecture convention, not a new top-level structure.

## Complexity Tracking

No entries — Constitution Check above found no principle violations requiring justification.
