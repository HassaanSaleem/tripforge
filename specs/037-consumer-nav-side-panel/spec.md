# Feature Specification: Consumer-surface navigation side panel (signed-in traveler)

**Feature Branch**: `kitchen/fix-goal-client-side-panel-nav`

**Created**: 2026-07-22

**Status**: Draft

**Input**: Ticket `goal-client-side-panel` — "The signed-in traveler / consumer
surface has NO persistent navigation … Add a persistent consumer-surface
navigation (a side panel on desktop, collapsing to a mobile-appropriate nav)
for the SIGNED-IN traveler, linking: Home, My Trips, Plan a trip (AI), Discover
/ What's Hot, Group trips, and Account/sign-out."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistent navigation across the consumer surface (Priority: P1)

A signed-in traveler on their own account surface (`/view` home, `/view/my-trips`)
sees a persistent navigation panel and can move between the available sections
without going back to the home tiles or typing a URL. Sections that are already
built (Home, My Trips) are live links; sections not yet built (Plan a trip,
Discover / What's Hot, Group trips) are honest "coming soon" signposts, not dead
links. Account/sign-out is always reachable from the panel.

**Why this priority**: This is the whole ticket — the consumer surface is
currently a set of dead-end pages with no way to move between them. Without
persistent navigation the traveler surface cannot grow into the other consumer
features (planner, discovery, group trips) the campaign is building, because
there is nowhere to put their entry points.

**Independent Test**: Sign up as a fresh traveler, land on `/view`, and confirm a
persistent nav panel is present with a live link to My Trips, a live link back to
Home, honest coming-soon markers for the unbuilt sections, and a working
sign-out — all reachable from `/view` and from `/view/my-trips` without retyping a
URL.

**Acceptance Scenarios**:

1. **Given** a signed-in traveler on `/view`, **When** the page renders, **Then** a
   persistent navigation panel is visible listing Home, My Trips, Plan a trip,
   Discover / What's Hot, Group trips, and an Account area with sign-out.
2. **Given** a signed-in traveler on `/view`, **When** they activate the "My Trips"
   nav item, **Then** they navigate to `/view/my-trips` and the same panel remains,
   with "My Trips" marked as the current section.
3. **Given** a signed-in traveler on `/view/my-trips`, **When** they activate the
   "Home" nav item, **Then** they navigate to `/view` and the panel remains, with
   "Home" marked current.
4. **Given** a signed-in traveler, **When** they look at the not-yet-built sections
   in the panel (Plan a trip, Discover / What's Hot, Group trips), **Then** each is
   shown as a clearly-marked "coming soon" signpost and is NOT a navigable link.
5. **Given** a signed-in traveler, **When** they activate sign-out from the panel's
   Account area, **Then** they are signed out and returned to the anonymous `/view`
   welcome.

### User Story 2 - The anonymous white-label proposal view is byte-unchanged (Priority: P1)

An anonymous visitor opening a shared trip proposal link (`/view/[token]`) — and
the anonymous `/view` welcome shown to a not-signed-in visitor — must see NO
navigation panel and NO platform branding. The consumer nav is exclusively the
signed-in traveler's own-surface chrome; it must never leak onto the brand-neutral
share-token view.

**Why this priority**: INV-020 (client-facing output carries the agent's brand
only) and INV-018 (anonymous share-token view) are trust-boundary invariants and
the campaign's whole thesis (Constitution II white-label). A nav panel that leaked
onto a white-labeled proposal would break the agent's brand and the trust boundary
— this must be impossible, not merely avoided.

**Independent Test**: Open an agency's `/view/[token]` share link signed-out and an
anonymous `/view` signed-out; confirm neither renders any nav panel, neither
contains the text "TripForge" / "Trellis" in body or document title, and both are
pixel-for-pixel the pre-feature behavior.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they open `/view` with no session, **Then**
   they see the brand-neutral welcome (heading "Your trip…", sign-in / create-account
   actions) with NO nav panel and NO "TripForge"/"Trellis" anywhere.
2. **Given** an anonymous visitor, **When** they open a valid `/view/[token]` share
   link, **Then** the white-label proposal view renders exactly as before this
   feature — no nav panel, agent brand only.

### User Story 3 - Responsive, theme-aware, and workspace-free (Priority: P2)

The panel is premium and theme-aware (reuses the existing `.tf-*` theme kit),
collapses to a mobile-appropriate nav on narrow viewports with no horizontal
scroll, and never exposes any agency/workspace affordance (a traveler session can
never reach a workspace procedure — INV-023/INV-024).

**Why this priority**: Deliverable 5 of GOAL.md ("stop looking like a Google
Form") makes polish first-class, and the campaign builds two clearly-separated
surfaces (INV-024). A janky or workspace-leaking nav would undercut both.

**Independent Test**: Load the signed-in surface at a desktop and a ~390px-wide
viewport; confirm the panel is a left column on desktop and collapses to a
toggleable off-canvas nav on mobile with no horizontal scroll; confirm no
"Agency workspace" / "agency membership" affordance is present.

**Acceptance Scenarios**:

1. **Given** the signed-in surface at desktop width, **When** it renders, **Then** the
   nav is a persistent left column beside the page content.
2. **Given** the signed-in surface at ~390px width, **When** it renders, **Then** the
   nav collapses to a toggleable panel and the page has no horizontal scroll.
3. **Given** any signed-in traveler surface, **When** it renders, **Then** no
   agency/workspace navigation or branding is present.

### Edge Cases

- **Not-yet-built sections**: Plan a trip, Discover / What's Hot, and Group trips
  have no consumer route yet. They render as non-interactive "coming soon"
  signposts (no `<a>`), so there are no dead links. When those tickets land, the
  single nav source of truth flips each from "coming soon" to a live link in one
  place.
- **Sign-out from `/view/my-trips`**: sign-out from the panel works from any
  signed-in page, not just the home; it returns to `/view` (which re-renders as the
  anonymous welcome).
- **Anonymous `/view/my-trips`**: unchanged — a not-signed-in request to
  `/view/my-trips` still redirects to `/view/sign-in` and never renders the panel or
  any trip data.
- **Agent (workspace) session visiting `/view`**: out of scope to change — the
  consumer nav is gated on a client (traveler) session read exactly as the existing
  signed-in home is; it does not add any new cross-surface behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The signed-in traveler consumer surface (`/view` home and
  `/view/my-trips`) MUST render a persistent navigation panel listing, in order:
  Home, My Trips, Plan a trip, Discover / What's Hot, Group trips, and an Account
  area containing sign-out.
- **FR-002**: Built sections (Home → `/view`, My Trips → `/view/my-trips`) MUST be
  navigable links; the panel MUST mark the section matching the current page as the
  active/current item.
- **FR-003**: Not-yet-built sections (Plan a trip, Discover / What's Hot, Group
  trips) MUST render as clearly-labeled "coming soon" signposts that are NOT
  navigable links (no dead ends), and MUST be promotable to a live link by editing
  a single nav source of truth when their route lands.
- **FR-004**: The panel MUST carry NO platform branding — the strings "TripForge"
  and "Trellis" MUST NOT appear in the signed-in consumer surface body or its
  document title (INV-020 negative, already pinned by
  `traveler-home-journey.spec.ts` and `trust-boundary.spec.ts`).
- **FR-005**: The anonymous `/view` welcome and the anonymous `/view/[token]`
  white-label proposal view MUST be byte-unchanged by this feature: no nav panel,
  no platform branding, exactly the pre-feature output (INV-020 / INV-018).
- **FR-006**: The panel MUST NOT expose any agency/workspace affordance or reach any
  workspace procedure; a traveler session remains unable to invoke workspace
  procedures (INV-023 / INV-024). The consumer nav is a distinct module from the
  agent (`lib/nav.ts` / `AppSidebar` / `WorkspacePageShell`) navigation — separated
  by user type, not toggled by a flag.
- **FR-007**: Sign-out from the panel MUST work from any signed-in consumer page and
  return the traveler to `/view` (which re-renders as the anonymous welcome).
- **FR-008**: The panel MUST be responsive (a left column on desktop; a toggleable,
  off-canvas nav on narrow viewports with no horizontal scroll) and theme-aware,
  reusing the existing `.tf-*` theme kit rather than forking per-page styles.

### Key Entities *(include if feature involves data)*

- **Consumer Nav Destination**: a pure-data description of one entry in the consumer
  navigation — an `id` (stable key, exhaustive over the active-item union), a
  `label`, an optional `href` (present for built sections, absent for coming-soon),
  a `status` (`live` | `soon`), and an `icon` kind. It carries no user data and no
  server capability; it is the single source of truth consumed by both the panel
  renderer and each page's active-item marker. This is a UI data structure, NOT a
  change to the canonical itinerary schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a signed-in `/view` a traveler can reach My Trips, return Home,
  and sign out entirely via the persistent panel — 0 URL retypes for any built
  destination.
- **SC-002**: 100% of not-yet-built nav sections are non-navigable "coming soon"
  signposts (0 dead links) and become live links via a one-line change to the nav
  source of truth when their route lands.
- **SC-003**: The anonymous `/view` and `/view/[token]` views contain 0 occurrences
  of "TripForge"/"Trellis" (body + title) and render 0 nav panels — verified by the
  existing pinned INV-020 negatives staying green plus a new anonymous-view-unchanged
  e2e assertion.
- **SC-004**: At a ~390px viewport the signed-in surface has 0 horizontal scroll and
  the nav is reachable via its toggle; at desktop width the nav is a persistent
  column — both verified live in a browser during the INV-027 gate.

## Assumptions

- The consumer surface pages that receive the panel today are `/view` (signed-in
  home branch) and `/view/my-trips`; these are the only signed-in traveler routes
  that exist. As new consumer routes land (planner, discovery, group trips) they
  adopt the same shell and flip their nav entry to `live`.
- "TripForge-branded" in the ticket is realized as the platform's own premium-themed
  product surface (the `.tf-*` theme, distinct from the white-label proposal view) —
  NOT the literal wordmark "TripForge"/"Trellis", which the pinned INV-020 negatives
  forbid on the traveler surface. The nav uses a brand-neutral wordmark. This is
  documented for operator review under "Decisions surfaced for operator review"
  below; the invariant wins by default and no pinned assertion is weakened.
- Reuse of the existing `.tf-app-shell` / `.tf-sidebar` CSS (already responsive with
  a checkbox-driven collapse) is preferred over new CSS; the consumer shell is a
  server component with no `"use client"` boundary for the nav itself (only the
  existing `TravelerSignOut` client control is reused).
- No new tRPC procedure, no schema change, no money path, no supply-adapter change.

## Decisions surfaced for operator review

- **D-037.a — Brand wordmark on the traveler's own surface.** The ticket asks for a
  "TripForge-branded" consumer surface, but `trust-boundary.spec.ts` and
  `traveler-home-journey.spec.ts` pin that "TripForge"/"Trellis" appear NOWHERE on
  the signed-in `/view` (INV-020 negative). This feature holds the invariant: the
  nav ships with a **brand-neutral wordmark**, no pinned assertion weakened. If the
  operator wants the literal platform wordmark on the traveler's OWN account surface
  (as distinct from the white-label proposal view), that is a scoping change to the
  INV-020 negatives / the architecture doc — an operator gate, filed rather than
  self-decided. Recommendation: keep brand-neutral (ship now); revisit the wordmark
  as a separate operator decision.
