# Feature Specification: Dashboard App Shell

**Feature Branch**: `kitchen/fix-demo-02-shell-dashboard`

**Created**: 2026-07-13

**Status**: Draft

**Ticket**: demo-02-shell (Friday demo drive)

**Input**: User description: "Dashboard app shell — replace the single-column 'typeform' with a real product workspace (sidebar nav + agent home). Persistent left sidebar nav (Dashboard / AI Builder / Trips / Marketplace / Media / Discover) with active state, collapsible on narrow widths; keep the existing top header (identity + role badge + sign-out). A proper multi-pane dashboard content area, not a centered questionnaire column. An Agent Home dashboard as the new post-sign-in landing: StatTiles (GBV/earnings, active trips, listings, marketplace licenses), a recent-activity list, and quick-action cards. Move the planner/trips/media into their own nav destinations rather than one scroll. Match the landing page's premium visual bar. No regressions to booking/marketplace money paths."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Land on a real dashboard, not a form (Priority: P1)

An agent signs in and, instead of a single scrolling column of forms, lands on
an Agent Home dashboard: a persistent sidebar identifies where they are and
where they can go, and the main pane shows their at-a-glance stats (GBV/
earnings, active trips, listings, marketplace licenses), a short list of
recent activity, and quick-action cards to start a new trip or browse the
marketplace.

**Why this priority**: This is the entire point of the ticket — the operator's
verbatim complaint is that the product "looks like a typeform, not a proper
app/platform." Every other user story depends on the shell existing first.

**Independent Test**: Sign in as an agent and observe the landing view — a
sidebar is present, the main pane is not a centered form, and stat tiles,
recent activity, and quick actions are all visible (tiles may correctly show
zero values for a brand-new agency).

**Acceptance Scenarios**:

1. **Given** a signed-in agent, **When** they land on the app immediately
   after sign-in, **Then** they see a sidebar (not a single-column form) and a
   dashboard home with stat tiles, a recent-activity list, and quick-action
   cards.
2. **Given** an agency with existing trips, bookings, listings, and licenses,
   **When** its agent views the dashboard, **Then** each stat tile shows a
   value that reflects that agency's own real data (never another agency's).
3. **Given** a brand-new agency with no activity yet, **When** its agent views
   the dashboard, **Then** every stat tile renders a correct zero/empty value
   and the recent-activity list shows a friendly empty state — never a crash,
   blank pane, or raw error.
4. **Given** the dashboard is showing, **When** the agent selects a quick-action
   card ("Start a new trip" or "Browse marketplace"), **Then** they land on
   the AI Builder or Marketplace destination respectively.

---

### User Story 2 - Get anywhere from one persistent sidebar (Priority: P1)

From any authenticated screen, an agent can reach every product area — Agent
Home, AI Builder (planner), Trips, Marketplace, Media, and Discover — from one
always-visible sidebar, with the current destination clearly highlighted. On a
narrow screen, the sidebar collapses without hiding the ability to navigate.

**Why this priority**: Without reliable navigation, splitting the old single
page into destinations would make the product harder to use, not easier. This
is the mechanism that makes User Story 1's dashboard reachable and useful.

**Independent Test**: From the dashboard, select each sidebar item in turn and
confirm it opens the correct destination with that item visibly marked as
active; narrow the viewport and confirm the sidebar can still be opened and
used to navigate.

**Acceptance Scenarios**:

1. **Given** an agent on any authenticated screen, **When** they open the
   sidebar, **Then** all six destinations (Dashboard, AI Builder, Trips,
   Marketplace, Media, Discover) are listed, and the one matching the current
   screen is visually marked as active.
2. **Given** the sidebar, **When** the agent selects a destination, **Then**
   the main pane changes to that destination while the sidebar and top header
   (identity, role badge, sign-out) remain in place.
3. **Given** a narrow viewport (mobile-width), **When** the agent views any
   authenticated screen, **Then** the sidebar is collapsed by default but can
   be opened on demand, and every destination remains reachable.
4. **Given** the sidebar's Discover item, **When** the agent selects it,
   **Then** they see a clearly-labeled "coming soon" placeholder — never a
   broken link or error page.

---

### User Story 3 - Every existing capability still works after the split (Priority: P1)

Everything an agent could already do — draft a trip with AI, see the agency's
trip list and reopen one, run the booking flow, share a client-view link,
manage media, and browse/list/license on the marketplace — still works
exactly as before, just reached from its own nav destination instead of one
long scroll.

**Why this priority**: This is a restructuring of existing, working, money-
touching capability (booking, marketplace licensing). Regressing any of it to
ship a nicer shell would be a net loss, and money-path regressions are never
acceptable (Constitution VI).

**Independent Test**: Starting from the dashboard, navigate to AI Builder and
draft a trip, navigate to Trips and reopen a trip, run its booking flow and
generate a client-share link, navigate to Media and attach an asset, and
navigate to Marketplace and browse/list/license — every action succeeds
exactly as it did before the shell existed.

**Acceptance Scenarios**:

1. **Given** the AI Builder destination, **When** an agent drafts a trip,
   **Then** the draft is produced and saved exactly as before.
2. **Given** the Trips destination, **When** an agent reopens a previously
   drafted or licensed trip, **Then** its full day-by-day plan, booking
   controls, and share control are available exactly as before.
3. **Given** the Media destination, **When** an agent registers or attaches a
   media asset to a trip, **Then** it behaves exactly as before.
4. **Given** the Marketplace destination, **When** an agent browses, lists, or
   licenses a trip, **Then** the transaction and its recorded revenue-share
   split behave exactly as before, with the same conservation guarantees
   (INV-004, INV-009, INV-010).

---

### Edge Cases

- An agency with stat-worthy data in one category but not others (e.g. trips
  but no bookings yet): each tile computes independently and shows its own
  correct value; one empty category never blanks or breaks the others.
- The stats query fails transiently: the dashboard shows a clear failure
  message for the stats area only — sidebar navigation and other panes remain
  usable.
- An agent deep-links directly to a non-dashboard destination (e.g. shares a
  bookmark to Trips): the shell renders with that destination active and the
  sidebar present, not a bare page.
- Anonymous or non-agent visitors: unchanged — they continue to see the
  existing sign-in/membership prompt, never the dashboard shell.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After sign-in, the agent MUST land on a dashboard home view
  (not the previous single-column planner-first view).
- **FR-002**: The dashboard home MUST show stat tiles for the agency's GBV/
  earnings, active-trip count, listing count, and marketplace-license count.
- **FR-003**: Every stat tile's value MUST be computed from the signed-in
  agency's own real, current data and MUST never include another agency's
  data (tenant isolation, INV-004). Tiles MUST render a correct value (zero
  or otherwise) whether or not the agency has any activity yet — no tile may
  depend on demo/seed data being present.
- **FR-004**: The dashboard home MUST show a recent-activity list summarizing
  the agency's latest trip/booking/marketplace events, with a friendly empty
  state when there is none.
- **FR-005**: The dashboard home MUST show quick-action entry points for
  starting a new trip and browsing the marketplace, each leading to the
  corresponding nav destination.
- **FR-006**: A persistent sidebar navigation MUST be present on every
  authenticated screen, listing Dashboard, AI Builder, Trips, Marketplace,
  Media, and Discover, with the current destination visibly marked active.
- **FR-007**: The existing top header (user identity, role badge, sign-out)
  MUST remain present and unchanged in behavior on every authenticated screen.
- **FR-008**: On narrow viewports, the sidebar MUST collapse by default while
  remaining reachable/expandable, and every destination MUST stay navigable.
- **FR-009**: The AI Builder, Trips, Marketplace, and Media destinations MUST
  each provide, at their own nav destination, the full capability that
  previously lived in the single-column workspace view (drafting, listing/
  reopening trips, booking, sharing, media management, marketplace browse/
  list/license) with no loss of function.
- **FR-010**: The Discover destination MUST be reachable from the sidebar and
  MUST show a clearly-labeled placeholder in this feature (the discovery feed
  itself is out of scope — see Assumptions).
- **FR-011**: No functional requirement in this feature may introduce client-
  side money arithmetic; every amount shown (including stat tiles) MUST be a
  server-computed value passed through existing display formatters only
  (INV-009/010).
- **FR-012**: No existing booking, markup, take-rate, or revenue-share
  behavior MUST regress as a result of relocating capabilities to new nav
  destinations.
- **FR-013**: The shell MUST use the product's existing visual language
  (established card/badge/table components and color/type system) rather than
  introducing a new one, and MUST present no raw internal enum strings to the
  user.

### Key Entities

- **Agent dashboard stats**: a read-side aggregate over one agency's own
  itineraries, bookings, and marketplace listings/licenses — GBV/earnings
  total, active-trip count, listing count, license count. Derived entirely
  from existing recorded data; introduces no new stored fields and no new
  money computation, only a read-side summary of values that already exist.
- **Recent activity entry**: a read-side, human-readable summary of one past
  trip/booking/marketplace event belonging to the agency (what happened,
  when). Derived from existing records; not a new stored entity.
- **Nav destination**: one of the six sidebar targets (Dashboard, AI Builder,
  Trips, Marketplace, Media, Discover) that an agent can be on; determines
  which existing capability panel is shown and which sidebar item is active.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From first landing after sign-in, an agent can reach any of the
  six product areas in exactly one interaction (one sidebar selection).
- **SC-002**: 100% of stat-tile and recent-activity values shown belong to the
  signed-in agency — zero cross-tenant values, proven by an integration test
  against a real database with two tenants.
- **SC-003**: A brand-new agency with zero prior activity sees a fully-
  rendered dashboard (correct zero-value tiles, empty-state activity list, no
  crash or blank pane) on first sign-in, before any demo/seed data exists.
- **SC-004**: Every capability available before this change (draft, view/
  reopen trips, book, share, manage media, browse/list/license on the
  marketplace) remains reachable and produces the same outcome after the
  change, verified end-to-end for each.
- **SC-005**: Zero client-side money arithmetic introduced: every displayed
  amount, including new stat tiles, is traceable to a server-provided value
  passed through an existing formatter.

## Assumptions

- **Discover is a placeholder in this feature.** Building the actual "What's
  Hot" discovery feed is a separate, already-tracked ticket (demo-08-discover)
  gated behind the product roadmap's P2 phase; this feature only makes the
  destination reachable with a clearly-labeled coming-soon placeholder.
- **Dashboard stats reuse existing recorded data only.** No new money
  computation and no canonical itinerary schema change are introduced; the
  stats are a read-side summary over data already produced by the existing
  drafting, booking, and marketplace flows.
- **The previous single-column workspace view is superseded, not preserved in
  parallel.** Its three capabilities (plan/trips/media) move to their own nav
  destinations; there is no requirement to keep the old combined view
  reachable afterward.
- **Visual language is reused, not reinvented.** The feature's premium bar is
  "matches the existing landing page," using the product's already-established
  card/badge/table/color system rather than introducing a new one.
- **No new third-party dependency is required** to deliver sidebar navigation,
  collapsing behavior, or iconography; the feature is deliverable with the
  product's existing toolset.
