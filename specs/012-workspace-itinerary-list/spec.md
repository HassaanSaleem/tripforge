# Feature Specification: Workspace Itinerary List

**Feature Branch**: `kitchen/fix-seed-0017-workspace-itinerary-list`

**Created**: 2026-07-11

**Status**: Draft

**Ticket**: seed-0017 (iteration-3 report FEAT-1)

**Input**: User description: "Workspace itinerary list panel (ticket seed-0017). Nothing in /workspace lists the agency's itineraries — not drafts, not booked trips, not licensed white-label copies. The license receipt's 'is now in your workspace' is only true via the marketplace sell-form picker after a reload. The API already exists (workspace.itinerary.list, tenant-scoped, L3-proven) — this is a missing UI panel, not a missing API. Add a premium-theme itinerary list panel to /workspace: the agency's itineraries newest first (title, currency, created date) with a way to continue work on one; licensed white-label copies appear after licensing; empty state for a fresh agency. Read-side/UI only — NO canonical itinerary schema change, no new money math."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my agency's trips in the workspace (Priority: P1)

An agent signs in and lands on the workspace. Alongside the planner, they see
their agency's itineraries — every trip the agency has drafted, booked, or
licensed — newest first, each showing its title, currency, and creation date.
A fresh agency with no trips yet sees a friendly empty state that points them
at the planner and the marketplace instead of a blank space.

**Why this priority**: This is the core gap: today an agent's work vanishes
the moment they leave the planner view. A trip that cannot be found again is a
trip that cannot be sold, booked, or shared — the workspace fails its basic
"my work lives here" promise (Constitution II: agent experience is the wedge).

**Independent Test**: Sign in as an agency with existing itineraries and load
the workspace — the trips are listed newest first with title, currency, and
date. Sign in as a brand-new agency — the empty state shows. Delivers value
alone: agents can finally see what their agency owns.

**Acceptance Scenarios**:

1. **Given** an agency with three itineraries created at different times,
   **When** an agent of that agency opens the workspace, **Then** all three
   appear in a list ordered newest first, each with title, currency, and a
   human-readable creation date.
2. **Given** a brand-new agency with no itineraries, **When** its agent opens
   the workspace, **Then** an empty state appears with guidance toward
   drafting a trip or licensing one from the marketplace (never a blank or
   broken panel).
3. **Given** two agencies each with their own itineraries, **When** an agent
   of agency A opens the workspace, **Then** only agency A's itineraries are
   listed — agency B's rows are never visible (tenant isolation).
4. **Given** the list cannot be loaded (e.g. transient server failure),
   **When** the agent opens the workspace, **Then** a clear failure message
   appears in the panel — never a crash, blank page, or raw error dump.

---

### User Story 2 - Continue work on a listed trip (Priority: P2)

From the list, the agent opens one of the itineraries and picks up where they
left off: they see the trip's day-by-day plan and can use the existing booking
and client-share actions on it — the same actions available on a freshly
drafted trip.

**Why this priority**: A list without a way in is a dead end — the ticket's
expected behavior names "a way to continue work". Reopening a trip closes the
loop between sessions: draft today, book and share tomorrow. It builds
entirely on the P1 list and existing trip actions.

**Independent Test**: Draft a trip, reload the workspace, open the trip from
the list — the day-by-day plan renders and the booking and share controls
work on it exactly as they did right after drafting.

**Acceptance Scenarios**:

1. **Given** a listed itinerary, **When** the agent opens it from the list,
   **Then** the trip's title, days, and items are shown, and the existing
   booking and client-share actions are available on it.
2. **Given** an opened itinerary, **When** the agent returns to the list,
   **Then** the list is still there and another trip can be opened.
3. **Given** a trip that cannot be opened (e.g. transient server failure),
   **When** the agent tries to open it, **Then** a clear failure message
   appears — never a crash or blank panel.

---

### User Story 3 - New work shows up without a page reload (Priority: P3)

When the agent drafts a new trip in the planner, the new trip appears in the
workspace list right away — no manual page reload. Likewise, after licensing
a trip on the marketplace, coming back to the workspace shows the licensed
white-label copy in the list.

**Why this priority**: Staleness is the exact defect class the marketplace
picker just fixed (seed-0016: "Nothing to list yet" contradicting a license
receipt). The workspace list must not reintroduce it. It is P3 only because
the list (P1) and open (P2) are useful even with a manual refresh.

**Acceptance Scenarios**:

1. **Given** the workspace is open, **When** the agent drafts a new trip and
   the draft succeeds, **Then** the new trip appears in the list without a
   manual page reload.
2. **Given** an agent licenses a marketplace listing, **When** they navigate
   (back) to the workspace, **Then** the licensed white-label copy appears in
   the list.

---

### Edge Cases

- Signed-out visitor or non-agent: the workspace already gates to a sign-in
  prompt; the list never renders for them (existing behavior, unchanged).
- Two itineraries with identical titles (e.g. a licensed copy titled after
  the source trip): both are listed; the creation date differentiates them.
  A visible "licensed copy" marker is a separate tracked feature (seed-0018)
  and out of scope here.
- A stored trip the platform refuses to read (corrupt/legacy document): the
  open action must fail with the same clear failure message as any other
  open failure — never a blank panel. (Turning the server's raw error into a
  typed refusal is separately tracked as seed-0021 and out of scope; this
  panel only guarantees graceful client-side handling of whatever the server
  returns.)
- Very large itinerary counts: no pagination in this version — the P0 agency
  works with small trip counts; newest-first keeps the relevant trips on top
  (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workspace MUST present the signed-in agency's itineraries,
  ordered newest first.
- **FR-002**: Each list entry MUST show the itinerary's title, currency, and
  creation date in human-readable form.
- **FR-003**: The list MUST contain only the signed-in agency's itineraries;
  another agency's itineraries MUST never be rendered (tenant isolation,
  INV-004). The existing tenant-scoped read is the only data source.
- **FR-004**: An agency with no itineraries MUST see an empty state with
  guidance toward drafting a trip or licensing one from the marketplace.
- **FR-005**: The agent MUST be able to open a listed itinerary and see its
  day-by-day plan with the existing booking and client-share actions
  available on it. Opening a trip MUST NOT change any trip data by itself.
- **FR-006**: An itinerary drafted in the current workspace session MUST
  appear in the list without a manual page reload once the draft succeeds.
- **FR-007**: A licensed white-label copy MUST appear in the list when the
  workspace is (re)visited after licensing.
- **FR-008**: Any failure to load the list or open a trip MUST surface as a
  clear, user-facing message inside the panel — never a crash, blank panel,
  or raw technical error.
- **FR-009**: The panel MUST NOT perform any money arithmetic on the client;
  any amounts shown are server-provided values passed through the existing
  display formatters only (INV-009/010).
- **FR-010**: The panel's presentation MUST meet the workspace's established
  premium visual standard (seed-0009s bar) — not a bare table.

### Key Entities

- **Itinerary list entry**: the read-side projection of one agency trip —
  identifier, title, currency, creation date. Already served tenant-scoped by
  the platform; this feature adds no fields and changes no schema.
- **Opened itinerary**: the full canonical trip document (days, items,
  pricing) plus its booking summaries, as already served by the existing
  trip-overview read. Unchanged by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the workspace landing view, an agent can find and open any
  previously created trip in at most 2 interactions.
- **SC-002**: 100% of listed entries belong to the signed-in agency — zero
  cross-tenant rows, proven by an integration test against a real database
  with two tenants.
- **SC-003**: In the end-to-end journey, a newly drafted trip is visible in
  the list without a page reload, and a licensed white-label copy is visible
  in the list on the next workspace visit — both 100% of runs.
- **SC-004**: Zero client-side money arithmetic introduced: every displayed
  amount is traceable to a server-provided value passed through an existing
  formatter.

## Assumptions

- No pagination or search in this version: P0 agencies hold small trip
  counts; newest-first ordering keeps active work on top. Pagination becomes
  a follow-up when real usage demands it.
- Distinguishing licensed copies from originals (badges, lineage) is
  explicitly out of scope — tracked as seed-0018.
- Typed server-side refusal for unreadable stored documents is explicitly out
  of scope — tracked as seed-0021; this feature only guarantees the panel
  handles server failures gracefully.
- The existing tenant-scoped list read and trip-overview read are reused as
  the only data sources; no new server capabilities, no canonical itinerary
  schema change, no new money math.
- The existing booking and client-share flows are reused as-is for "continue
  work"; this feature adds no new booking or sharing semantics.
