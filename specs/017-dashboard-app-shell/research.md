# Research: Dashboard App Shell (spec 017)

All Technical Context unknowns resolved. Decisions numbered for citation from
code comments and the PR body.

## D1 — Route split: keep `/workspace` for the Builder, add `/trips`, `/media`, `/dashboard`, `/discover`

**Decision**: `/workspace` keeps its path but drops down to hosting only
`<Planner />` (the "AI Builder" destination). `ItineraryList` and
`MediaLibraryPanel` each get a new sibling route (`/trips`, `/media`).
`/dashboard` is new (Agent Home). `/discover` is new (placeholder).
`/marketplace` is untouched. Post-sign-in/-up redirects move from `/workspace`
to `/dashboard`.

**Rationale**: Minimizes churn on the one e2e spec that is purely
planner-scoped (`planner-journey.spec.ts` keeps `page.goto("/workspace")`
verbatim) while satisfying FR-009/item-4's "own nav destinations." Renaming
`/workspace` itself would touch every existing spec for no behavioral gain —
the sidebar's "AI Builder" label already decouples the user-facing name from
the URL, same as "Dashboard" will decouple from `/dashboard`'s implementation.

**Alternatives considered**: nest everything under `/workspace/*`
(`/workspace/trips`, `/workspace/media`) — rejected, no functional benefit
over flat routes and adds a path segment to every link/test; keep the old
combined `/workspace` page and add the sidebar only as a "jump to section"
anchor list — rejected, does not satisfy item 4's "own nav destinations"
literally and keeps the long-scroll UX the ticket is fixing.

## D2 — Drop the same-page freshness signal; rely on route-mount refetch

**Decision**: Delete `workspace-panels.tsx` and the `onDrafted`/`refreshToken`
plumbing it introduced between `Planner` and `ItineraryList` (spec 012 D2).
`ItineraryList` fetches on its own mount with no external trigger; `Planner`
no longer takes an `onDrafted` prop.

**Rationale**: That signal existed only because Planner and ItineraryList were
React siblings that could not otherwise observe each other. Once they are on
separate routes, navigating from AI Builder to Trips is itself a fresh mount
of `ItineraryList` — the underlying `workspace.itinerary.list` query reruns
with current data, which is exactly what "appears without a manual page
reload" (spec 012 FR-006, preserved by this spec's FR-009) requires. Keeping
the dead cross-panel signal after the panels stop being siblings would be
inert code with no caller.

**Alternatives considered**: keep the prop/token plumbing "just in case" —
rejected (dead-code retention against the deletion-discipline rule; nothing
calls it once the pages split); a global client cache/invalidation bus —
rejected, YAGNI for a single fresh-fetch-on-navigate requirement.

## D3 — Sidebar is a shell-level addition to `WorkspacePageShell`, not a new layout wrapper

**Decision**: Extend `WorkspacePageShell` (used by every authenticated page)
to render a new `<AppSidebar activeNav={activeNav} />` alongside the existing
header, inside a new `.tf-app-shell` grid (`sidebar-column | content-column`).
The existing top header (brand, identity, role badge, sign-out) is unchanged
in markup and behavior; the old top `.tf-nav` (`Workspace`/`Marketplace` text
links) is removed since the sidebar now covers that job — keeping both would
be two navs answering the same question.

**Rationale**: `WorkspacePageShell` is already the single shared shell for
every authenticated page (extraction done at quality-sweep iter-3, QS3-7) —
extending it is the Pre-Write "extend" path, and it means every current and
future authenticated page gets the sidebar for free with zero per-page
plumbing, exactly like the header already works.

**Alternatives considered**: a new top-level `AppShell` layout component that
wraps `WorkspacePageShell` — rejected, would create two competing shell
concepts for the same six pages and complicate the guard-not-a-member path
(`WorkspacePageShell` already special-cases "no identity" with its own
`<main>`, which must NOT get a sidebar); per-page manual composition of
`<AppSidebar>` — rejected, duplicates the wiring six times for no benefit over
extending the one shared component.

## D4 — Sidebar collapse is CSS-only (no client-side state)

**Decision**: Implement the narrow-viewport collapse with a checkbox-driven
CSS toggle (hidden `<input type="checkbox">` + a `<label>` acting as the
toggle button + sibling-selector CSS that slides the `<aside>` on/off-canvas).
No `"use client"` boundary is added to `WorkspacePageShell` or `AppSidebar`
for this.

**Rationale**: `WorkspacePageShell` is consumed directly by async server
component pages (`workspace/page.tsx`, `marketplace/page.tsx`, and now four
more). Introducing client-side toggle state would force either a new client
wrapper boundary or converting the shell itself to a client component,
neither of which anything else in this feature needs. The checkbox-toggle
pattern is a well-established zero-JS technique and keeps the shell a plain
function component, consistent with how the rest of the authenticated surface
avoids unnecessary client boundaries.

**Alternatives considered**: a `"use client"` `AppSidebar` with
`useState`-driven collapse — rejected, adds a client boundary and a hydration
step for a purely presentational toggle that CSS already solves; always-
visible non-collapsing sidebar — rejected, fails FR-008 (must collapse on
narrow viewports).

## D5 — Dashboard stats: one new read-only, per-currency, tenant-scoped aggregate

**Decision**: New `packages/api/src/services/dashboard-stats.ts` exports
`dashboardStats(db, agencyId)`, returning: GBV/earnings **grouped by
currency** (never summed across currencies), active-trip count, listing
count, license count, and a small recent-activity list — all computed with
Drizzle `sum()`/`count()` aggregates scoped by `agencyId` **in the query
itself** (`WHERE`/join condition), mirroring
`packages/marketplace/src/earnings.ts`'s `earningsAggregates` exactly. Exposed
as one new agent-gated procedure `workspace.dashboard.stats` on the existing
`workspace` router.

**Rationale**: `earningsAggregates` is the established, L3-proven precedent
for "sum a money column, scoped by tenant at the query, per grouping key" —
reusing its shape (not its code, since it aggregates a different table) keeps
the new query consistent with the Money-Safe bar (Constitution VI) instead of
inventing a new aggregation idiom. Per-currency grouping (not a single summed
number) is required because `booking_component.sell_minor` and
`revenue_share_ledger.seller_credit_minor` rows can carry different
currencies across an agency's history — adding minor units across currencies
would silently produce a meaningless number, which the Money-Safe bar
forbids. Zero-safety (FR-003 of the spec) falls out naturally: `sum()`/
`count()` over zero matching rows returns `0`/empty, not an error.

**Alternatives considered**: client-side aggregation over
`workspace.itinerary.list` + per-item booking data — rejected, would require
fetching full documents just to total them (slow, and moves money summation
onto the client, which INV-009/010 forbids); a single naively-summed total
across currencies — rejected as a real correctness bug, not a simplification;
a materialized view — rejected, YAGNI at current data volume, and view
migrations are heavier than a query for a first version.

## D6 — Recent activity: read-side projection, no new stored entity

**Decision**: `dashboardStats` also returns a small, newest-first list of
human-readable activity rows (e.g. "Trip drafted", "Booking confirmed",
"Listing licensed") derived from existing `createdAt` timestamps on
`itineraries`/`booking`/`marketplace_license`, capped at a fixed count
(no pagination). No new activity-log table.

**Rationale**: Matches D8 of spec 012 ("no pagination, no search in v0" —
same P0-scale reasoning) and keeps this feature read-side only, consistent
with FR-004's "summarizing... latest... events" wording, which does not
require a durable audit log — just a synthesized recent view over data that
already exists.

**Alternatives considered**: a dedicated `activity_log` table written by
every mutation — rejected, YAGNI and a much larger surface (would touch every
existing write path) for a feature whose spec only asks for a recent-activity
*display*.

## D7 — Discover destination: static placeholder page, zero data fetch

**Decision**: `/discover/page.tsx` renders a simple, on-brand "coming soon"
card behind the same `WorkspacePageShell` guard as every other destination.
No tRPC call, no new schema, no roadmap-gated logic.

**Rationale**: `kitchenloop.yaml`'s `spec.blocked` list gates the actual
What's Hot feed at P2 (`whats-hot-feed`), and it is separately ticketed
(demo-08-discover). Building any real feed logic here would both violate MVP
Scope Discipline and duplicate that ticket's future work. A reachable,
honestly-labeled placeholder satisfies this spec's FR-010 without touching
roadmap-gated territory.

**Alternatives considered**: omit the Discover sidebar item entirely until
demo-08 ships — rejected, the ticket's item 1 explicitly names Discover as a
sidebar item; hiding a nav item the operator explicitly asked for would be
silently narrowing scope rather than documenting an assumption.

## D8 — Icons: inline SVG, no new dependency

**Decision**: Sidebar item icons are small inline SVGs authored directly in
`app-sidebar.tsx` (or a tiny local icon map), not a component library.

**Rationale**: No icon library is installed today (`apps/web/package.json`
has none), and the guardrails direct against adding a dependency unless the
ticket specifically requires it — a handful of simple line icons matching the
existing coastal/serif brand do not require one.

**Alternatives considered**: `lucide-react` — rejected for this ticket
(unnecessary new dependency for six static icons); text-only nav labels with
no icons — rejected, the ticket explicitly asks for sidebar chrome that reads
as "an app/platform," and icon-less text-only sidebars read closer to the
plain-link "typeform" feel being fixed.

## D9 — Styling: extend the `.tf-*` kit with shell/dashboard treatments

**Decision**: Add `.tf-app-shell` (sidebar+content grid), `.tf-sidebar`/
`.tf-sidebar-*` (nav list, active state, collapse toggle), `.tf-stat-tile`/
`.tf-stat-grid` (dashboard tiles), `.tf-activity*` (recent-activity list), and
`.tf-quick-action*` (quick-action cards) — all built from existing design
tokens (`--sea`, `--coral`, `--gold`, `--r-lg`, `--shadow`, `--surface`). A
new `.tf-app-shell main` rule overrides the global `main { width: ... }` cap
for authenticated pages only, the same specificity technique already used by
`[data-plain] main` for the white-label client-view opt-out — the landing
page and auth screens (which do not use `.tf-app-shell`) are unaffected.

**Rationale**: "REUSE it, do not invent a new visual language" is explicit in
the ticket. The existing `[data-plain] main` override is direct precedent for
scoping a `main`-width exception to one surface without touching the global
rule or the marketing/auth pages.

**Alternatives considered**: editing the global `main` selector directly —
rejected, would also widen/alter the landing page and auth screens, which the
ticket says are already premium and must not change.
