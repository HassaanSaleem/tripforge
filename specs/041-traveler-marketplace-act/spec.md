# Feature Specification: Traveler acts on a marketplace itinerary

**Feature Branch**: `kitchen/fix-goal-marketplace-fork-whitelabel-traveler-act`

**Created**: 2026-07-28

**Status**: Draft

**Input**: Ticket `goal-marketplace-fork-whitelabel` (GOAL.md Deliverable 2.7) — a traveler
can act on a marketplace itinerary: browse agent-listed trips, fork one into their own
working copy, then self-book it or request an agent to arrange it. Scope is bounded to the
operator-ratified "build safe-v0" bounds (GOAL.md 2026-07-27, MARKETPLACE-FORK-SEMANTICS)
that stay inside existing money math.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the marketplace as a traveler (Priority: P1)

A traveler on the consumer surface opens the marketplace and sees the trips agencies have
published. Today that page is a "coming soon" placeholder. Each card shows the trip title,
the selling agency's name, whether that agency is a verified seller, and a client-facing
"from" price — and nothing an agent would consider confidential (no agent-to-agent license
price, no net cost, no markup, no revenue-share terms).

**Why this priority**: Discovery is the entry point — without a real browse there is nothing
to act on. It is also the smallest independently valuable slice (a read-only page).

**Independent Test**: Sign in as a traveler, open `/view/marketplace`, and confirm real
active listings render with title / agency / verified badge / from-price, and that a page
source/network inspection shows no net rate, markup, license price, or revenue-share value.

**Acceptance Scenarios**:

1. **Given** two agencies have active marketplace listings, **When** a signed-in traveler
   opens the marketplace, **Then** both trips appear as cards with title, agency name, a
   verified-seller badge where applicable, and a client-facing "from" total.
2. **Given** an agency deactivates its listing, **When** the traveler reloads the
   marketplace, **Then** that trip no longer appears.
3. **Given** any marketplace card is on screen, **When** its payload is inspected, **Then**
   no net rate, markup basis points, agent license price, or revenue-share basis points are
   present anywhere in the response.

---

### User Story 2 - Fork a listing into my own trip (Priority: P1)

A traveler picks a listing and forks it. Forking produces the traveler's own working copy of
the trip and lands them on the familiar trip view. The copy is a distinct trip from the
agency's listed original, so acting on it never mutates the public listing (other travelers
can still fork and book the same listing). Ownership of the copy stays with the originating
selling agency; the traveler is attached to the copy as a linked trip (the same "My Trips"
association used elsewhere), not as a new kind of owner.

**Why this priority**: The fork is the bridge from browse to action and the safe-v0 mechanism
that keeps one traveler's booking from polluting a shared listing.

**Independent Test**: Fork a listing as a traveler and confirm (a) a new trip appears in "My
Trips", (b) it opens on the trip view, (c) the original listing is unchanged and still
forkable by another traveler.

**Acceptance Scenarios**:

1. **Given** an active listing, **When** a signed-in traveler forks it, **Then** a new trip
   copy is created, it appears in the traveler's "My Trips", and the traveler lands on that
   copy's trip view.
2. **Given** a traveler has forked a listing and booked items on the copy, **When** a second
   traveler forks the same listing, **Then** the second traveler gets a fresh, fully-bookable
   copy unaffected by the first traveler's bookings.
3. **Given** an anonymous (signed-out) visitor, **When** they attempt to fork a listing,
   **Then** they are prompted to sign in and no copy is created.
4. **Given** a listing that has been deactivated, **When** a traveler attempts to fork it,
   **Then** the fork is refused with a neutral "no longer available" outcome and no copy is
   created.

---

### User Story 3 - Self-book my forked trip at the agency's price (Priority: P1)

From the forked trip's view, the traveler books it end-to-end themselves. They pay the selling
agency's established sell price (net cost plus the agency's own markup) — the same price the
agency would charge — and the agency keeps that markup. The traveler never sees or controls
net cost or markup. A failed component is never charged; a fully-failed booking books and
charges nothing.

**Why this priority**: This is the money path and the headline outcome (GBV via self-serve
booking of marketplace supply). It reuses the proven traveler self-book flow.

**Independent Test**: Fork a listing whose source trip carries an established markup, self-book
the copy, and assert the charged client price equals net × the *source agency's* markup (not a
flat default), that the agency's markup ledger records the margin, and that a forced component
failure charges nothing for that leg while conserving state.

**Acceptance Scenarios**:

1. **Given** a forked copy of a listing whose source trip was quoted at the seller's markup,
   **When** the traveler self-books, **Then** each booked leg is charged at the seller's
   sell price (net × the seller's markup) and the selling agency's markup ledger records the
   margin.
2. **Given** a self-book where one component's supplier rejects the hold, **When** the booking
   runs, **Then** the rejected leg is not charged, the other legs still book, and no money or
   booking state is left inconsistent.
3. **Given** a self-book, **When** the redacted result is returned, **Then** it exposes only
   per-leg title / kind / booked / client price — never net rate, markup, merchant-of-record,
   or supplier identifiers.

---

### User Story 4 - Request an agent to arrange my forked trip (Priority: P2)

Instead of self-booking, from the forked trip's view the traveler asks an agent to arrange it.
The request routes to the copy's owning agency (the original seller) so a human can follow up.

**Why this priority**: Constitution I — the consumer surface must funnel demand into the agent
network. It reuses the existing request-agent handoff; the only new part is that a forked copy
routes the handoff to the seller.

**Independent Test**: Fork a listing, submit a request-agent handoff from the copy, and confirm
a handoff request lands in the seller agency's inbox naming the traveler.

**Acceptance Scenarios**:

1. **Given** a forked copy of a listing, **When** the traveler submits a request-agent handoff,
   **Then** a handoff request is recorded for the seller agency and appears in that agency's
   trip-requests inbox.

---

### Edge Cases

- **Signed-out fork/book**: an anonymous visitor may browse but cannot fork, self-book, or
  attach a trip — they are prompted to sign in and no state is written.
- **Deactivated / missing listing**: forking a listing that is no longer active (or whose
  source itinerary is gone) returns a neutral unavailable outcome, never an error page or an
  existence oracle, and creates nothing.
- **Concurrent forks of the same listing**: two travelers forking the same listing at the same
  time each get an independent copy; neither observes the other's copy or bookings.
- **Un-priced or already-booked source items**: a copy whose items can't all be priced live
  self-books the priceable ones and reports the rest as unavailable (inherited self-book
  behavior); nothing is charged for an unbookable leg.
- **Source trip never quoted**: if the selling agency never quoted the source trip, the copy
  self-books at the platform-default markup (the same default the traveler self-book path
  already applies) — never at zero (a traveler must not be able to pay net cost).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The consumer marketplace page MUST list all currently ACTIVE marketplace
  listings to a signed-in traveler, replacing the coming-soon placeholder.
- **FR-002**: Each marketplace card MUST show, and MUST be limited to, client-safe fields: the
  trip title, the selling agency's display name, a verified-seller indicator, the trip
  currency, and a client-facing "from" total. It MUST NOT expose net rate, markup, the
  agent-to-agent license price, or revenue-share basis points (INV-020).
- **FR-003**: The marketplace browse MUST be an allowlist projection over a cross-tenant read
  of active listings (the one documented cross-tenant read pattern), computing the "from"
  total the same way the traveler trip view computes an itinerary total.
- **FR-004**: A signed-in traveler MUST be able to fork an active listing, producing a new
  itinerary copy that is a faithful copy of the listed trip's content.
- **FR-005**: A forked copy MUST be owned by the originating (selling) agency — no traveler is
  recorded as the itinerary owner — and MUST NOT bump the canonical itinerary `SCHEMA_VERSION`
  or otherwise change the canonical itinerary schema (bound a).
- **FR-006**: On fork, the system MUST attach the signed-in traveler to the copy via the
  existing traveler↔trip link so the copy appears in the traveler's "My Trips", and MUST mint
  a share link so the traveler lands on the existing trip view for the copy.
- **FR-007**: The system MUST record the fork's provenance (which listing, which source
  itinerary, the seller agency, the traveler) in an additive, backfill-free record that is NOT
  part of the canonical itinerary schema (a bolt-on, mirroring existing group/departure
  bolt-ons).
- **FR-008**: An anonymous (signed-out) visitor MUST NOT be able to fork, self-book, or attach
  a trip; the attempt MUST write no state and prompt sign-in.
- **FR-009**: Forking a listing that is not active (or whose source itinerary is missing) MUST
  return a neutral unavailable outcome and create nothing — no existence oracle.
- **FR-010**: A traveler MUST be able to self-book a forked copy through the existing traveler
  self-book money path; the charged client price MUST be net cost × the **source listing's**
  established markup (the seller's existing sell price), and the selling agency MUST keep the
  markup via the existing markup ledger. NO new platform take-rate is applied to a direct
  traveler booking (bound b).
- **FR-011**: If the source listing's trip was never quoted, the forked copy MUST self-book at
  the platform-default markup — never zero — so a traveler can never pay net cost.
- **FR-012**: Self-booking a forked copy MUST conserve state on failure exactly as the existing
  self-book path does: a failed leg is never charged, a fully-failed booking writes no booking
  or money rows, and holds are released (INV-011).
- **FR-013**: The self-book result and all traveler-facing figures MUST be redacted to
  client-safe values only (INV-020): per-leg title/kind/booked/client-price and a safe failure
  reason; never net rate, markup, merchant-of-record, or supplier refs.
- **FR-014**: A traveler MUST be able to request an agent to arrange a forked copy; the request
  MUST route to the copy's owning (seller) agency and appear in that agency's trip-requests
  inbox (reusing the existing request-agent handoff).
- **FR-015**: The money-path tenant for any booking or handoff on a forked copy MUST be the
  seller agency resolved from the copy's share link — never the traveler's session
  (INV-004/INV-024); every money row written carries the seller agency exactly as an
  agent-initiated booking would.

### Out of Scope (explicitly deferred — follow-up tickets)

- **Traveler-side EDITING of a forked copy** (changing the trip before booking). The fork is a
  faithful copy the traveler can book or hand off as-is in v0; itinerary editing on the
  consumer surface is deferred.
- **Agent-side "add my client into another agent's joinable departure" hardening**: an opt-in
  `joinable` flag on agent departures + a Constitution-VI vetting gate on posting/joining
  departures. The agent-adds-a-client-to-another-agency's-departure flow already exists (spec
  021); only the opt-in flag and the vetting gate remain.
- **Three-way original-seller resale payout** (paying the original seller's declared revenue
  share in money on a resale). Stays with the open `RESALE-SHARE-SEMANTICS` operator row; the
  v0 marketplace split remains two-way (bound c).
- **Agent-side white-label of an entire trip** — already shipped (spec 006/024); not
  re-implemented here.

### Key Entities *(include if feature involves data)*

- **Marketplace listing (existing)**: an agency's published trip — the source of a browse card
  and a fork. Its client-safe fields feed the traveler browse; its license/revenue-share fields
  never reach a traveler.
- **Forked trip copy (existing itinerary entity)**: a new itinerary owned by the selling
  agency, a faithful copy of the listed trip's content, distinct from the listed original.
- **Traveler↔trip link (existing)**: the association that surfaces the forked copy in the
  traveler's "My Trips".
- **Fork provenance record (new, bolt-on)**: which listing/source itinerary a copy came from,
  its seller agency, and the traveler who forked it — additive, backfill-free, outside the
  canonical schema; also the source of the "book at the seller's markup" price basis.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in traveler can go from opening the marketplace to landing on a forked
  trip's view in at most two interactions (open → fork).
- **SC-002**: 100% of marketplace-card and self-book payloads contain zero agent-confidential
  values (net rate, markup, license price, revenue-share bps) — verified by an automated
  allowlist assertion.
- **SC-003**: A traveler self-booking a forked copy is charged the selling agency's sell price
  (net × the source agency's markup) with the agency's markup recorded, verified by an L3
  money-path test with a state-conservation assertion on the forced-failure path.
- **SC-004**: Forking a listing never mutates the listed original — two travelers forking the
  same listing each book independent copies, verified by test.
- **SC-005**: Every money row written by a traveler self-booking a forked copy carries the
  selling agency id (byte-identical attribution to an agent-initiated booking), verified by
  test.

## Assumptions

- The existing traveler account (org-less user, spec 030), traveler self-book money path (spec
  036), request-agent handoff (spec 022), share-link + "My Trips" attach (specs 010/031), and
  agent marketplace list/browse/white-label (spec 006/024) are all in place and reused.
- "Book as-is" and "fork" collapse to one safe-v0 mechanism: acting on a listing always works
  on a fresh copy so a shared listing is never mutated by one traveler's booking. The traveler
  reaches self-book / request-agent from the copy's standard trip view.
- The forked copy's booking price basis is the **source listing's** established markup, read
  live at book time from the source trip's most recent quote (falling back to the platform
  default), so it reflects the seller's current sell price without snapshotting a stale figure.
- Adding the fork-provenance bolt-on table is an additive, backfill-free migration with no
  canonical `SCHEMA_VERSION` bump and no revenue-share/ownership-semantics change — operator
  ratification at merge per the SCHEMA-GATE-78 / GROUP-TRIPS-AMEND precedent (a desk row is
  filed).
