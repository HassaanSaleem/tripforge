# Feature Specification: Traveler Self-Drive Booking

**Feature Branch**: `kitchen/fix-goal-consumer-selfbook-selfdrive`

**Created**: 2026-07-22

**Status**: Draft

**Input**: Ticket `goal-consumer-selfbook` (GOAL.md Deliverable 2.4 — MONEY PATH). Replace the trip-fork "Book it myself" confirmation-only stub with a real self-drive booking through the platform, reusing the existing quote-then-book money path and supply adapters.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A traveler books the trip themselves through the platform (Priority: P1)

A signed-in traveler opens a trip an agent shared with them, sees the concrete
things the trip is made of (the specific stays, activities, and transfers with
their prices), chooses "Book it myself," reviews exactly what they're about to
book, confirms, and the platform actually books that inventory — the same real
booking path an agent uses. When it succeeds the trip's items show as **Booked**
and a real trip total is charged; the traveler never had to phone the agent.

**Why this priority**: This is the campaign's marquee money-path gap. The
consumer landing page already promises "book it yourself," but today the fork is
a confirmation-only stub that fires zero server calls and books nothing. Closing
it is the difference between a plausible demo and a working self-drive product,
and it is the P1 slice that delivers value on its own.

**Independent Test**: Sign in as a traveler, open a shared un-booked itinerary,
choose "Book it myself," confirm, and verify (a) the UI shows the legs as booked
with a trip total and (b) real `booking` / `booking_component` / `markup_ledger`
rows appear in the database attributed to the itinerary's owning agency.

**Acceptance Scenarios**:

1. **Given** a signed-in traveler holding a valid share link to an itinerary
   with bookable, not-yet-booked items, **When** they confirm "Book it myself,"
   **Then** every bookable item is booked through the platform, the traveler
   sees each leg confirmed with its price, and the trip total reflects the
   booked prices.
2. **Given** the same traveler, **When** the booking completes, **Then** the
   revenue is attributed exactly as if the agent had booked it — the owning
   agency earns its markup, and there is no new revenue-share obligation and no
   change to who owns the client relationship.
3. **Given** an itinerary whose items an agent already booked, **When** the
   traveler chooses "Book it myself," **Then** the platform reports there is
   nothing left to book (no duplicate bookings, no error).
4. **Given** an anonymous visitor (not signed in) on a shared trip, **When**
   they choose "Book it myself," **Then** they are asked to sign in first — the
   money path is never driven anonymously.

---

### User Story 2 - Nothing is charged when a booking can't fully complete (Priority: P1)

When one leg of the trip can't be booked (a supplier rejects it, a held price
expired), the traveler is never charged for that leg, and if the whole booking
fails nothing at all is charged or recorded. The traveler sees clearly which
legs went through and which didn't, and can retry the ones that didn't.

**Why this priority**: This is a money path. State conservation on the failure
branch is a release gate (constitution VI, INV-011), not a nice-to-have. A
consumer must never be charged for a leg that didn't book.

**Independent Test**: Force one leg's supplier to reject the booking; confirm
the failed leg has no booking/ledger row and is not counted in the total, while
successfully-booked legs are recorded once; force *all* legs to fail and confirm
the database is unchanged (zero new rows anywhere).

**Acceptance Scenarios**:

1. **Given** a self-book where one leg's supplier rejects it, **When** the
   booking runs, **Then** the successful legs are booked once each and the
   rejected leg produces no booking, no ledger row, and no charge; the traveler
   sees it flagged as not booked.
2. **Given** a self-book where every leg fails, **When** the booking runs,
   **Then** the database has zero new booking, component, ledger, or event rows
   for that itinerary, and the traveler is told nothing was booked.
3. **Given** two travelers (or a traveler and the agent) trying to book the same
   item at the same time, **When** both submit, **Then** the item is booked at
   most once (no double-booking, no double-charge).

---

### User Story 3 - The traveler sees concrete, sourced guidance before booking (Priority: P2)

Before confirming, the traveler sees the concrete recommendations the trip is
built from — which specific stays/activities/transfers, with their real
descriptions and prices — plus clearly-labeled, sourced trip guidance (what to
confirm with each operator, and where to check official travel advisories for
the destination). Nothing shown is fabricated: every recommendation traces to a
real supplier offer, and advisory content points to authoritative sources rather
than inventing facts.

**Why this priority**: The ticket asks for "concrete recommendations (which
flight/airline, which hotels) and contextual trip advisories … as clearly-sourced
guidance, not fabricated facts." Surfacing what's actually being booked is a
core part of a trustworthy self-drive UX, but it is secondary to the booking
mechanics (US1/US2). Where no sourced data exists (destination terrain/altitude/
security facts, real airline picks), the feature must decline to fabricate rather
than invent, and defer that content to a future sourced-data feed.

**Independent Test**: On the review screen, verify each recommendation matches a
real item in the itinerary (title/kind/price), that flights are presented only
as a clearly-labeled indicative deep-link (no named real carrier or fare), and
that advisory content is labeled as guidance and links to an authoritative source
rather than asserting invented destination facts.

**Acceptance Scenarios**:

1. **Given** the review screen, **When** the traveler reads the recommendations,
   **Then** each one corresponds to a real bookable item in their itinerary with
   its actual title, kind, and price.
2. **Given** the guidance panel, **When** the traveler reads it, **Then** every
   statement is either derived from their own trip's real components or is a
   clearly-labeled pointer to an authoritative external source — no fabricated
   terrain/altitude/security claims and no fabricated airline names or fares.

---

### Edge Cases

- **Unknown/deleted share token or itinerary** → the same neutral "this trip
  link isn't available" surface used elsewhere; reveals nothing (no existence
  oracle), books nothing.
- **Itinerary with no bookable items** (a pure text proposal) → "nothing to
  book" outcome, no error.
- **A held price expires between review and confirm** → that leg fails with a
  clear "price changed / expired" reason and is not charged; other legs proceed.
- **Confidential leak risk** → the traveler-facing result must never expose net
  rate, markup, merchant-of-record, or supplier references (same trust boundary
  as the shared trip view).
- **Repeated confirm / double-click** → the item-level exclusivity of the money
  path guarantees an item is booked at most once even under duplicate submits.
- **Traveler is also an agent** (has an agency membership) → they still self-book
  through the traveler surface using the share token; the booking is attributed
  to the *itinerary's* owning agency, not the traveler's agency.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A signed-in traveler holding a valid share token MUST be able to
  book the shared itinerary's bookable, not-yet-booked items through the platform
  from the consumer (client-view) surface, replacing the confirmation-only stub.
- **FR-002**: The self-book MUST reuse the existing quote-then-book money path
  (firm-price hold with expiry, then book) and the existing supply adapters — no
  parallel or forked booking implementation.
- **FR-003**: The booking MUST be scoped to the itinerary's **owning agency**,
  resolved from the share link — never from the traveler's session (a traveler
  has no agency). Money attribution (booking, component, markup ledger, PMF
  booking event) MUST be identical to the agent-initiated path, with the owning
  agency as tenant and the traveler recorded as the booking actor.
- **FR-004**: The markup applied MUST be derived **server-side** from the
  itinerary's established pricing (the most recent quote's markup for that
  itinerary, or the platform default when none exists). The traveler MUST NOT be
  able to choose or influence the markup.
- **FR-005**: The feature MUST NOT create any new revenue-share obligation, new
  client-ownership record, or any change to who owns the client relationship, and
  MUST NOT change the canonical itinerary schema. (Any such change is out of
  scope and escalates to the operator.)
- **FR-006**: On partial failure, each failed leg MUST NOT be charged and MUST
  leave no booking/ledger/event row; on total failure the itinerary's booking
  state MUST be unchanged (zero new rows anywhere). Every failed leg's price hold
  MUST be released.
- **FR-007**: An item MUST be booked at most once across concurrent self-book and
  agent-book attempts (no double-booking, no double-charge).
- **FR-008**: The traveler-facing result MUST be redacted: it may show per-leg
  title, kind, booked/failed status, a client-safe failure reason, and the sell
  price only — never net rate, markup, merchant-of-record, or supplier references.
- **FR-009**: Anonymous (not-signed-in) visitors MUST be prompted to sign in
  before the money path runs; the self-book procedure MUST reject unauthenticated
  callers. A traveler MUST never invoke an agent/workspace procedure to book
  (surface separation preserved).
- **FR-010**: Before confirming, the traveler MUST see a review of the concrete
  items to be booked — each traceable to a real supplier offer in the itinerary
  (title, kind, price) — and a confirm action distinct from opening the review.
- **FR-011**: Flights MUST remain deep-link only — presented, if at all, as a
  clearly-labeled indicative estimate with an outbound search link, never as a
  booked component and never as a named real carrier or real fare.
- **FR-012**: Trip guidance/advisories MUST be clearly-labeled and sourced:
  derived from the traveler's own real trip components or presented as pointers to
  authoritative external sources. The feature MUST NOT fabricate destination facts
  (terrain, altitude, security). Rich destination-specific advisory content that
  would require a sourced external feed is explicitly deferred (documented, not
  faked).
- **FR-013**: The change MUST be covered by an L3 integration test that exercises
  the real booking path end-to-end and asserts state conservation on the failure
  branch (no orphan ledger rows, nothing charged for a failed leg, zero rows on
  total failure), plus the money-ledger identity (markup = sell − net).
- **FR-014**: The platform MUST emit the standard booking PMF event(s) for a
  self-book so GBV/plan→book metrics count consumer-driven bookings, attributed to
  the owning agency with the traveler as actor.

### Key Entities *(include if feature involves data)*

- **Share link**: the existing durable token that maps a trip to its owning
  agency and itinerary; the grant a traveler presents to view and now to
  self-book. No new fields.
- **Booking / booking component / markup ledger / PMF event**: the existing
  money-path records. A self-book writes exactly these, with the owning agency as
  tenant and the traveler as actor. No new tables or columns.
- **Self-book result (transient)**: a redacted, per-leg outcome returned to the
  traveler's browser (title, kind, booked/failed, sell price, safe reason). Not
  persisted; leaves the platform toward the traveler and re-enters nothing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in traveler can complete a self-drive booking of a shared
  itinerary from opening the trip to a confirmed result without contacting the
  agent, in under 2 minutes.
- **SC-002**: 100% of self-book failure paths conserve state — no failed leg is
  charged, and a fully-failed booking leaves the database byte-for-byte unchanged
  for that itinerary (verified by the L3 test's state-delta assertions).
- **SC-003**: 0 confidential fields (net rate, markup, merchant-of-record,
  supplier reference) appear in any traveler-facing self-book response.
- **SC-004**: Revenue attribution for a consumer self-book equals the
  agent-initiated path: the owning agency's realized markup on a self-booked item
  equals sell − net exactly, with no revenue-share or client-ownership record
  created or altered.
- **SC-005**: Every recommendation and advisory shown traces to a real source
  (a supplier offer in the itinerary or an authoritative external link); 0
  fabricated destination facts, airline names, or fares.

## Assumptions

- **Sign-in is required for the money path.** A real booking needs an accountable
  actor and a real user record for the PMF booking event; anonymous visitors are
  routed to sign in first. (Viewing and the request-an-agent handoff remain open
  to link-bearers as today.)
- **Self-book targets the itinerary's un-booked bookable items.** Items an agent
  already booked are skipped (no duplicate booking); a fully-booked itinerary
  yields "nothing to book."
- **The markup source is the itinerary's most recent quote, else the platform
  default.** There is no per-agency stored markup policy today; the agent's
  chosen markup (when they have quoted) is honored, otherwise the same default
  the agent path uses applies. This preserves — does not change — existing
  revenue semantics.
- **Partial-failure semantics match the existing money path** (constitution V:
  multi-supplier carts, one component fails while others hold). "Nothing charged"
  is enforced per leg (a failed leg is never charged) and for the whole (a
  fully-failed booking writes nothing) — the self-book does not introduce
  cross-leg all-or-nothing atomicity, which would be a different money semantics.
- **Advisory data is limited to what is genuinely sourced today.** Destination
  terrain/altitude/security advisories require an external sourced feed that is
  not integrated; that content is deferred and pointed to authoritative sources
  rather than fabricated (constitution III / Compliance & Content Sourcing).
- **No prod deploy; campaign branch only.** Live validation (INV-027 + UAT) is
  performed against the built compose stack, not shipped to production.
