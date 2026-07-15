# Feature Specification: Traveler Trip History — "My Trips"

**Feature Branch**: `kitchen/fix-p2-consumer-trip-history-my-trips`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "P2 consumer surface: signed-in client account area with history of
travels + bookings ('My Trips'). Ticket: p2-consumer-trip-history. Operator-authorized 2026-07-15
via P2-HISTORY-GATE ('Build now, ratify at merge'). Builds on the already-shipped
p2-consumer-accounts-identity (spec 030, PR #80): a traveler is an org-less Better Auth `user` who
can now sign in on the (client-view) route group. A signed-in traveler has no way to see the trips
that have been shared with them again later without keeping the original share link. Add a client
account area ('My Trips') listing the trips shared with them, each opening the existing
white-labeled client-view (spec 010) — reuse, do not fork — with client-facing booking
status/totals only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A returning traveler finds their trips again without the link (Priority: P1)

A traveler who signed in once on a shared trip page can come back later, sign in, and see every
trip that has been shared with them — without needing to have saved the original link. Opening any
of those trips takes them to the exact same branded trip page they saw before.

**Why this priority**: This is the entire value of the feature (the ticket's trigger: "no way to
see the trips shared with them again"). Without it, sign-in (spec 030) only helps within a single
visit; it does not give a traveler a durable place to return to.

**Independent Test**: Sign in as a traveler who has previously opened one or more shared trip
links, navigate to the "My Trips" area, and verify every previously-opened trip is listed and each
one opens the correct branded client-view.

**Acceptance Scenarios**:

1. **Given** a traveler signed in and opened two different shared trips on two different past
   visits, **When** they sign in again and open "My Trips," **Then** both trips are listed.
2. **Given** the "My Trips" list from Scenario 1, **When** the traveler selects one of the listed
   trips, **Then** they land on that trip's existing `/view/<token>` page, branded with the owning
   agency's name, showing the same itinerary content as before.
3. **Given** a trip that has one or more booked components, **When** it appears in "My Trips,"
   **Then** its listed status/total reflects the booked (realized) price, not just the drafted
   estimate — consistent with what the trip's own page already shows.

---

### User Story 2 - A trip only appears after the traveler has actually seen it (Priority: P2)

A trip a traveler has never opened does not appear in their "My Trips" list — only trips they have
actually visited while signed in show up. The very first time a signed-in traveler opens a new
shared trip link, that visit is what adds it to their list going forward.

**Why this priority**: This defines the scope/boundary of the feature (no surprise entries, no
cross-traveler leakage) and is what makes the association model correct — it is P2 because User
Story 1 already demonstrates the visible behavior; this story pins down the exact trigger.

**Independent Test**: As a signed-in traveler with an empty "My Trips" list, open a brand-new
shared trip link for the first time, then revisit "My Trips" and verify the trip is now listed;
verify a trip never opened by this traveler does not appear.

**Acceptance Scenarios**:

1. **Given** a signed-in traveler who has never opened a particular shared trip link, **When**
   they check "My Trips," **Then** that trip is absent from the list.
2. **Given** the same traveler, **When** they open that trip's share link while signed in for the
   first time, **Then** the trip now appears in "My Trips" on their next visit to the list.
3. **Given** two different signed-in travelers who have each opened a different set of shared
   trips, **When** each checks their own "My Trips," **Then** each sees only the trips they
   themselves have opened — never the other traveler's.

---

### User Story 3 - Anonymous and existing behavior are unaffected (Priority: P1)

A visitor who is signed out, or who never signs in, uses shared trip links exactly as before: no
new prompt, no "My Trips" affordance, no behavior change to viewing a trip or submitting the
request-an-agent form.

**Why this priority**: Regression guard on an already-shipped trust boundary (INV-018: possession
of the token is the grant) and on spec 030's optional-sign-in behavior. P1 because breaking either
is worse than this feature not existing.

**Independent Test**: With no session, open a valid share link and confirm it renders exactly as
before, with no "My Trips" link or prompt anywhere on the page; confirm no anonymous action writes
any trip-history association.

**Acceptance Scenarios**:

1. **Given** no session, **When** a visitor opens a valid share link, **Then** the page renders
   identically to its pre-feature behavior, with no "My Trips" affordance shown.
2. **Given** no session, **When** a visitor submits the request-an-agent form, **Then** the
   request is created exactly as before, with no traveler association of any kind.
3. **Given** a signed-out visitor who navigates directly to the "My Trips" area, **When** the page
   loads, **Then** they are sent to sign in rather than shown any trip data.

### Edge Cases

- **Deleted itinerary previously in a traveler's history**: if a trip that was once opened is
  later deleted by its owning agency, it no longer appears in "My Trips" (consistent with the
  existing "unknown token" unavailable state — nothing about the deletion is disclosed beyond its
  absence).
- **Signed-in agent opens a shared trip link**: an agent's own session may also gain a "My Trips"
  entry for a trip they viewed while signed in, exactly like a traveler (unchanged from spec 030's
  identity-is-session-tier-agnostic precedent) — this reveals nothing beyond what that signed-in
  user already knows about their own visit history.
- **Traveler opens the same trip link many times**: it appears exactly once in "My Trips," not
  once per visit.
- **Traveler signs out and back in**: "My Trips" shows the same list as before sign-out — the
  association is durable, not tied to any one session.
- **A trip with no priced/booked items yet**: it still appears in "My Trips" with no total shown,
  consistent with how the trip's own page already handles an unpriced proposal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The client-view route group MUST offer a "My Trips" area, reachable only by a
  signed-in visitor, listing every shared trip that visitor has previously opened while signed in.
- **FR-002**: A trip MUST appear in a signed-in visitor's "My Trips" list if and only if that
  specific visitor has opened that trip's share link at least once while signed in; a trip never
  opened by them, and a trip opened only while signed out, MUST NOT appear.
- **FR-003**: Each entry in "My Trips" MUST show, at minimum, the trip's title, the owning
  agency's name, and — when the trip has any priced items — its client-facing total, using the
  same realized-vs-estimated pricing rule the trip's own page already uses (spec 013).
  MUST NOT show any agent-confidential value (net rate, markup, budget allocation, or any other
  agency-internal figure) under any circumstance.
- **FR-004**: Selecting a trip in "My Trips" MUST open that trip's existing branded client-view
  page unchanged — "My Trips" MUST NOT introduce a second rendering of trip content.
- **FR-005**: A signed-in visitor's "My Trips" list MUST contain only trips that visitor
  themselves opened; it MUST NOT be possible for one signed-in visitor to see another visitor's
  list, regardless of how trips were shared or by which agency.
- **FR-006**: Visiting "My Trips" while signed out MUST route the visitor to sign in rather than
  reveal any trip data; after signing in, they land on their own "My Trips" list.
- **FR-007**: Anonymous (no-session) access to a valid `/view/<token>` link, and anonymous
  submission of the request-an-agent form, MUST continue to work exactly as specified in spec 010
  and spec 022, with no new requirement, prompt, association, or friction introduced by this
  feature.
- **FR-008**: A signed-in visitor MUST be able to reach "My Trips" from any shared trip page they
  are viewing (an on-page affordance, not a URL they must know in advance).

### Key Entities

- **Traveler trip-history entry**: a durable record that a specific signed-in visitor (traveler or
  agent) has opened a specific shared trip. Created the first time that visitor opens that trip's
  share link while signed in; unaffected by repeat visits, sign-out, or re-sign-in. Not itself
  visible to any party other than the visitor it belongs to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A traveler who has previously viewed one or more shared trips can, after signing in,
  reach every one of those trips again from a single "My Trips" area without needing to locate the
  original link.
- **SC-002**: 100% of existing anonymous and spec-030 signed-in behaviors (view rendering, "Book
  it myself," request-an-agent submission and pre-fill) continue to pass their existing acceptance
  criteria unchanged — zero regressions, verified by automated tests.
- **SC-003**: Across every visitor state, a "My Trips" list never contains a trip the viewing
  visitor did not themselves open, and never contains any agent-confidential figure — verified by
  automated negative checks (extends spec 010 SC-002/SC-003 and spec 030 SC-004).
- **SC-004**: A trip becomes visible in "My Trips" no later than the visitor's next visit to the
  area after they first open it while signed in.

## Assumptions

- **Association trigger — "attach on view"**: this feature resolves the ticket's open design
  question (candidate sources: share-link views, group-travel seat joins, trip-handoff
  submissions) by using the moment a signed-in visitor opens a shared trip's link as the sole
  trigger that adds it to their history. A trip-handoff request is always submitted from a trip
  page the visitor already opened, so this single trigger also covers "history from a handoff"
  without a second mechanism. Group-travel seat joins are explicitly OUT of scope: in v0, seats
  are joined by an agency on behalf of travelers (not by a traveler's own authenticated action),
  so there is no traveler-authenticated event to attach to yet.
- **"Bookings made for them" is shown through the existing trip page, not a separate view**: the
  ticket's "history of travels, bookings" is satisfied by each "My Trips" entry opening the trip's
  existing client-view, which already shows booked status/prices per item (spec 013). This feature
  does not add a second, separate "bookings" screen.
- **No history for un-viewed trips**: a trip that was shared with a traveler (e.g., by email
  outside the product) but never actually opened by them while signed in does not appear — there
  is no mechanism in this feature to "pre-populate" history from anything other than an actual
  visit.
- **Identity model reused unchanged**: this feature reuses the traveler/agent identity spec 030
  already shipped (org-less Better Auth `user` = traveler); it introduces no new identity or
  session concept.
- **This is the bounded, operator-authorized P2 slice** (P2-HISTORY-GATE, 2026-07-15, "Build now,
  ratify at merge") — the client account area + history, not the full self-serve consumer AI
  planner or the PRD non-goal "generic consumer planner."
- **Depends on, and reuses in place**: `specs/030-traveler-client-accounts` (traveler identity +
  sign-in) and `specs/010-client-view-share` (the branded client-view every "My Trips" entry
  opens).
