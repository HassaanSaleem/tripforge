# Implementation Plan: Discover / "What's Hot" Feed

**Branch**: `023-discover-whats-hot-feed` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-discover-whats-hot-feed/spec.md`

## Summary

Replace the existing static "coming soon" Discover placeholder with a real, image-forward "what's hot" feed: pick one of the 4 existing featured destinations, browse ≥3 curated place/experience cards (photo + blurb + hotel highlight) for it, and tap "Plan this" to open the AI builder with that destination pre-filled. Content is a small, hand-curated static data module reusing already-vetted licensed Unsplash imagery (extracted from the unmerged `demo-01-seed` salvage branch); the only new cross-page interface is a `?destination=` query param the builder reads to seed its destination field. No database, schema, or tRPC changes.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js (App Router) — existing stack (ADR-0001), no change.

**Primary Dependencies**: None new. Reuses `apps/web/lib/planner-form.ts` (`HERO_DESTINATIONS`, `PlannerFormValues`), `apps/web/lib/nav.ts` (existing `discover` nav entry), `apps/web/app/(workspace)/components/workspace-page-shell.tsx` (existing access guard), and the `.tf-*` design-token vocabulary in `apps/web/app/globals.css`.

**Storage**: N/A — feed content is a static, in-repo TypeScript data module (`apps/web/lib/discover-feed.ts`), not database-backed (research.md Decision 1).

**Testing**: Vitest (L1 — data-shape rules over the static feed module, pure-function tests) + Playwright (e2e — pick destination → feed renders → "Plan this" → builder pre-seeded), matching this repo's existing `apps/web/lib/__tests__/*` and `tests/e2e/*.spec.ts` conventions.

**Target Platform**: Web — existing Next.js `apps/web` workspace route group, no new platform surface.

**Project Type**: Web application (existing monorepo; this feature touches only `apps/web`, no `packages/` changes).

**Performance Goals**: No new network round trip for feed content (static import) — page-interactive time stays within the existing workspace-page norm; no stringent new target.

**Constraints**: Curated content only for this cycle (no live external API calls); an image load failure MUST NOT block a card's blurb/hotel-highlight/"Plan this" usability (spec Edge Cases); imagery MUST be real, licensed, and attributed (INV-016, Compliance & Content Sourcing) — no fabricated or scraped imagery.

**Scale/Scope**: 4 featured destinations (reused, unchanged) × ≥3 feed items each (≥12 items total); one page rewrite, two new components, one new data module, one new prop threaded through two existing files (`WorkspacePage`, `Planner`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First Product Strategy** — PASS. Every feed item's sole action ("Plan this") routes into the same budget-aware AI builder that already feeds bookings and marketplace listings — Discover has no content-only dead end, satisfying the constitution's explicit requirement that the consumer-surface discovery feed be "bookable, agent-connected, and marketplace-fed."
- **II. Agent Experience Is the Wedge** — PASS. Agent-facing, workspace-gated; pre-seeding only fills the destination field, so it cannot regress builder time-to-itinerary for any existing entry point (query param absent → byte-identical behavior, contracts/discover-to-builder-handoff.md).
- **III. Budget-Aware AI, Priced Against Reality** — PASS. Discover's feed items are explicitly inspirational/curated content, not planner output — they carry no price claim. The only planner-facing effect is seeding the destination into the real, already-compliant budget-aware builder; no static, unpriced suggestion is presented as bookable.
- **IV. Canonical Itinerary Schema** — N/A / PASS. Feature produces no itinerary-schema instances and modifies no schema file.
- **V. Integrate Supply, Don't Contract It** — PASS. No supplier API call, no new supply-adapter dependency; hotel-highlight text is static curated copy, not a live rate lookup (live pricing still only happens inside the unchanged builder flow after "Plan this").
- **VI. Trust, Provenance & Revenue-Share Integrity** — N/A / PASS. No marketplace resale, revenue-share, or money path touched.
- **Non-Goals** — PASS. No ride-hailing, flights-MoR, Airbnb inventory, or generic consumer-planner surface introduced.
- **MVP Scope Discipline (P2 gate)** — This feature is the roadmap-gated "What's Hot" discovery feed (PRD §11, P2 — Consumer surface), and the constitution requires "an explicit operator scope decision" before a P1+ item may enter planning. That decision is `.kitchenloop/backlog.json`'s `demo-08-discover` ticket itself: created directly (not via autonomous ideate/triage) as an **"OPERATOR must-have,"** `priority: "high"`; the identical pattern already cleared for `demo-09-request-agent` (the P2 `consumer-surface` self-drive/agent fork, merged PR #64, pr-auditor APPROVE). Prior spec 017 (`specs/017-dashboard-app-shell/research.md` Decision D7) already named `demo-08-discover` by id as the ticket authorized to build the real feed behind today's placeholder. This is treated as the required scope-decision citation, not a Complexity Tracking violation.
- **Compliance & Content Sourcing** — PASS. All imagery is licensed-stock (Unsplash CDN, `MediaSourceSchema` vocabulary) with attribution; no scraped image-search results, no AI-generated imagery presented as real (FR-007).
- **Development Workflow (Simplicity default)** — PASS. Static data module over a new router/table for non-tenant, non-money, hand-curated content (research.md Decision 1); SDD flow followed (this plan).

No Complexity Tracking entries — no principle violations, only the P2-gate scope-decision citation above.

**Post-Phase 1 re-check**: unchanged — Phase 1 design (data-model.md, contracts/) introduced no database, schema, or money-path surface, so every gate above still holds as evaluated.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
apps/web/
├── lib/
│   ├── discover-feed.ts              # NEW — DiscoverFeedItem[] curated data (research.md D1/D2)
│   ├── discover-feed.test.ts (or apps/web/lib/__tests__/) # NEW — L1 data-shape rules (data-model.md)
│   └── planner-form.ts               # UNCHANGED — HERO_DESTINATIONS reused, PlannerFormValues gets no field change
├── app/(workspace)/
│   ├── discover/
│   │   ├── page.tsx                  # MODIFIED — replaces placeholder body with real feed (guard unchanged)
│   │   ├── discover-feed-view.tsx    # NEW — "use client" destination picker + feed grid
│   │   └── feed-item-card.tsx        # NEW — image-forward card (photo, blurb, hotel highlight, Plan this)
│   └── workspace/
│       ├── page.tsx                  # MODIFIED — reads searchParams.destination, passes initialDestination
│       └── planner.tsx               # MODIFIED — Planner() accepts optional initialDestination prop
├── app/globals.css                   # MODIFIED — new .tf-discover-* classes (research.md D4)
tests/e2e/
└── discover-journey.spec.ts          # NEW — pick destination -> feed -> Plan this -> builder pre-seeded
```

**Structure Decision**: Single-app change inside the existing `apps/web` Next.js workspace route group — no `packages/` changes (no schema, no router, no supply-adapter touch), matching the "web application" project type already established by this repo's ADR-0001 stack. All new files live beside the existing modules they extend (`lib/discover-feed.ts` next to `lib/planner-form.ts`; `discover/*.tsx` next to the existing placeholder `discover/page.tsx`), per this repo's clean-architecture convention of extending in place rather than introducing a new top-level structure.

## Complexity Tracking

No entries — Constitution Check above found no principle violations requiring justification.
