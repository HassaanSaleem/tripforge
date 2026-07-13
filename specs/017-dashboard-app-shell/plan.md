# Implementation Plan: Dashboard App Shell

**Branch**: `kitchen/fix-demo-02-shell-dashboard` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-dashboard-app-shell/spec.md` (ticket demo-02-shell)

## Summary

Replace the authenticated surface's single centered `/workspace` scroll (planner
→ trips → media stacked panels, capped at 940px) with a real dashboard shell:
a persistent left sidebar (Dashboard / AI Builder / Trips / Marketplace / Media
/ Discover) wrapping a wide multi-pane content area, plus a new `/dashboard`
Agent Home landing (stat tiles, recent activity, quick actions) that becomes the
post-sign-in default. The existing top header (identity, role badge, sign-out)
is reused unchanged. Planner/Trips/Media move from one page to three routes
(`/workspace`, `/trips`, `/media`); Marketplace keeps its route. All four route
pages keep composing the SAME shared shell (`WorkspacePageShell`, extended, not
duplicated) and the SAME underlying panels/procedures — this is a shell and
routing change, not a rebuild of any existing capability. One new read-side
tRPC procedure (`workspace.dashboard.stats`) aggregates GBV, active-trip count,
listing count, and license count from data the platform already records; it
introduces no new money computation and is currency-safe (never sums amounts
across different currencies) and zero-safe (correct with no seed data).

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm + turborepo monorepo, ADR-0001)

**Primary Dependencies**: Next.js App Router (`apps/web`, route group
`(workspace)`, INV-024), React server + client components, tRPC v11 typed
browser client (`apps/web/lib/trpc/client.ts`), Better Auth session cookie
(implicit via same-origin `/api/trpc`), Drizzle ORM aggregate functions
(`sum`/`count`, same pattern as `packages/marketplace/src/earnings.ts`)

**Storage**: none new — the dashboard stats query reads existing Postgres rows
(`itineraries`, `booking`/`booking_component`, `marketplace_listing`,
`marketplace_license`/`revenue_share_ledger`) via a new read-only aggregate;
no new tables, no new columns

**Testing**: Vitest L1 (pure helpers: nav-destination-from-path, stats
formatting); Vitest L3 vs real Postgres (new dashboard-stats aggregate,
tenant-isolation + zero-state assertions, extending the `l3-*.test.ts`
convention); Playwright L4 e2e against the built compose image (INV-027),
updating existing specs' navigation to the new routes and adding a shell/
dashboard journey spec

**Target Platform**: web, built compose image (Next.js standalone);
INV-028-safe by construction (the stats read is a stateless per-request query,
no in-process cross-request state)

**Project Type**: web app in an existing monorepo

**Performance Goals**: dashboard renders with one aggregate query; sidebar/
shell add no additional network round trip (pure client-side nav + CSS)

**Constraints**: zero client-side money arithmetic (INV-009/010 — existing
`formatMinorAmount`/`formatMoney`-style formatters only); tenant isolation
enforced at the query itself, not by post-filtering (INV-004, same pattern as
`earningsAggregates`); GBV/earnings computed per-currency, never summed across
currencies; canonical itinerary schema untouched (Constitution IV); no
supplier API shape touched (Constitution V); premium `.tf-*` theme reused, no
new visual language; no new npm dependency

**Scale/Scope**: one extended shared shell component, one new sidebar
component, four page compositions (1 new `/dashboard`, 2 new `/trips` +
`/media` split out of the old `/workspace`, 1 new `/discover` placeholder, 2
modified redirects), one new tRPC router procedure + one new pure aggregate
module, CSS kit additions, ~4-5 existing e2e specs updated for new routes plus
1 new shell/dashboard e2e spec

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 before
Phase 0; re-evaluated after Phase 1 design — both PASS.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Marketplace stays a first-class, one-click-away sidebar destination; dashboard quick action surfaces "Browse marketplace" directly, increasing marketplace visibility rather than burying it. |
| II. Agent Experience Is the Wedge | PASS | Directly answers the operator's "typeform, not a platform" complaint — the single biggest agent-experience gap. No regression to time-to-client-ready-itinerary: the AI Builder (planner) keeps its own dedicated route with no added steps. |
| III. Budget-Aware AI, Priced Against Reality | PASS (N/A) | No planner/AI logic change — the planner moves routes but its behavior is untouched. |
| IV. Canonical Itinerary Schema | PASS | No schema change. The dashboard stats read is a projection over already-recorded data; no fork, no private extension. |
| V. Integrate Supply, Don't Contract It | PASS (N/A) | No supplier code touched. |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | No money path is written to. The new stats read sums existing recorded amounts (`booking_component.sell_minor`, `revenue_share_ledger.seller_credit_minor`) per-currency with zero client-side arithmetic; tenant-scoped at the query (INV-004). Existing booking/marketplace/share flows are reused unchanged behind their new routes — verified end-to-end in Live Test & Fix. |
| Non-Goals / MVP discipline | PASS | Discover stays a placeholder — the actual What's Hot feed is P2-gated (`kitchenloop.yaml` `blocked: whats-hot-feed`) and explicitly deferred to ticket demo-08-discover, not built here. |
| PMF instrumentation | PASS (N/A) | Reads only — no new trip-creation/booking/marketplace transaction is added, so no new events are owed. Existing events untouched. |

**Development-workflow gates**: SDD flow followed (this plan); no schema
migration note needed (no schema change); money-path L3 rule not triggered by
a money-path *change* — the new stats aggregate is nonetheless given an L3
test against real Postgres (tenant isolation + zero-state + per-currency
grouping) because it is a new integration point reading money-bearing tables
(quality bar: "new features touching integration points MUST include an L3
test").

## Project Structure

### Documentation (this feature)

```text
specs/017-dashboard-app-shell/
├── spec.md              # Feature spec (done)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D9
├── data-model.md        # Phase 1 — dashboard stats projection (no new entities)
├── quickstart.md        # Phase 1 — live validation guide
├── contracts/
│   └── dashboard-shell-ui.md  # Sidebar contract, route map, stats procedure contract
├── checklists/requirements.md # Spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/web/
├── app/(workspace)/
│   ├── components/
│   │   ├── workspace-page-shell.tsx   # MODIFIED: widen activeNav union; render <AppSidebar>; wrap in .tf-app-shell grid; drop old top .tf-nav links (superseded by sidebar)
│   │   └── app-sidebar.tsx            # NEW: sidebar nav (6 destinations, active state, CSS-only collapse toggle for narrow widths)
│   ├── dashboard/
│   │   ├── page.tsx                   # NEW: Agent Home — activeNav="dashboard"
│   │   └── dashboard-home.tsx         # NEW: client component — StatTiles + RecentActivity + QuickActions, calls workspace.dashboard.stats
│   ├── workspace/
│   │   ├── page.tsx                   # MODIFIED: activeNav="builder"; renders <Planner /> only (drops <WorkspacePanels/> compound)
│   │   ├── workspace-panels.tsx       # REMOVED: no longer needed — Planner/ItineraryList/MediaLibraryPanel each get their own page now
│   │   ├── planner.tsx                # MODIFIED: drop now-unused onDrafted cross-panel refresh plumbing (no sibling panel to refresh; dead code once panels split)
│   │   ├── itinerary-list.tsx         # MODIFIED: drop now-unused refreshToken prop (fresh fetch on route mount replaces the same-page refresh signal)
│   │   └── media-library-panel.tsx    # UNCHANGED (reused)
│   ├── trips/
│   │   └── page.tsx                   # NEW: activeNav="trips"; renders <ItineraryList />
│   ├── media/
│   │   └── page.tsx                   # NEW: activeNav="media"; renders <MediaLibraryPanel />
│   ├── discover/
│   │   └── page.tsx                   # NEW: activeNav="discover"; static coming-soon placeholder (no data fetch)
│   ├── marketplace/
│   │   └── page.tsx                   # UNCHANGED besides shared-shell activeNav type widening
│   ├── sign-in/page.tsx               # MODIFIED: post-sign-in redirect target `/workspace` → `/dashboard`
│   └── sign-up/page.tsx               # MODIFIED: post-sign-up redirect target `/workspace` → `/dashboard`
├── app/globals.css                    # MODIFIED: .tf-app-shell (sidebar+content grid), .tf-sidebar*, .tf-stat-tile*, .tf-activity*, .tf-quick-action* kit additions
├── lib/
│   ├── nav.ts                         # NEW: pure helper — NavDestination type + label/href/icon map (single source of truth for sidebar + activeNav)
│   └── __tests__/nav.test.ts          # NEW: L1 for the pure nav map
packages/marketplace/src/
└── (unchanged — earningsAggregates reused as a reference pattern, not modified)
packages/api/src/
├── routers/workspace.ts               # MODIFIED: add `dashboard.stats` procedure (agent-gated, tenant-scoped)
├── services/dashboard-stats.ts        # NEW: pure aggregate module (GBV-per-currency, active-trip/listing/license counts, recent-activity rows) — mirrors earnings.ts's query-scoped-tenant pattern
└── __tests__/l3-dashboard-stats.test.ts  # NEW: L3 vs real Postgres — tenant isolation, zero-state, per-currency grouping
tests/e2e/
├── planner-journey.spec.ts            # MODIFIED: navigate to /workspace (unchanged path, unchanged assertions — Builder keeps this route)
├── workspace-list-journey.spec.ts     # MODIFIED: navigate to /trips instead of /workspace
├── content-library-journey.spec.ts    # MODIFIED: navigate to /media instead of /workspace
├── sign-in.spec.ts                    # MODIFIED: post-sign-in landing assertion now targets /dashboard
└── dashboard-shell-journey.spec.ts    # NEW: L4 — sidebar reachability of all 6 destinations, zero-state dashboard, populated dashboard after a live trip/booking/listing/license
```

**Structure Decision**: existing web-app monorepo layout; all UI work stays
inside `apps/web` `(workspace)` route group (INV-024); the new aggregate lives
in `packages/api/src/services` alongside the existing service-layer pattern
(`planner.ts`), keeping the route handler thin; no package boundaries crossed
(dependency-cruiser must stay clean).

## Complexity Tracking

No constitution violations — table intentionally empty.

## Pre-Write Discipline (recorded for the PR body)

- **reuse**: `WorkspacePageShell`, `Planner`, `ItineraryList`,
  `MediaLibraryPanel`, `MarketplacePanel`, `getWorkspaceIdentity`,
  `formatMinorAmount`/existing money formatters, `.tf-*` theme kit, the
  `sum`/`count`-scoped-at-query aggregate pattern from
  `packages/marketplace/src/earnings.ts`.
- **extend**: `WorkspacePageShell` (widened `activeNav` union + sidebar slot +
  `.tf-app-shell` wrapper); `packages/api/src/routers/workspace.ts` (new
  `dashboard.stats` procedure); `globals.css` (kit additions).
- **generalize**: none — no third call site emerges that would justify a new
  shared abstraction beyond the sidebar itself.
- **new**: `app-sidebar.tsx`, `dashboard/` route + `dashboard-home.tsx`,
  `trips/` route, `media/` route, `discover/` route, `lib/nav.ts`,
  `services/dashboard-stats.ts`, `l3-dashboard-stats.test.ts`,
  `dashboard-shell-journey.spec.ts` — no existing export covers a persistent
  app-wide sidebar, an agent-home aggregate, or a coming-soon placeholder.
- **deleted**: `workspace-panels.tsx` (compound of three panels that are no
  longer siblings on one page) and the `onDrafted`/`refreshToken` cross-panel
  refresh plumbing in `planner.tsx`/`itinerary-list.tsx` (dead once Builder and
  Trips are separate routes — a route change already gives Trips a fresh fetch
  on mount, so the bespoke signal is redundant, not merely unused).
