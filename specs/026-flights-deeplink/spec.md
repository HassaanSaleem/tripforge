# Feature Specification: Flights Card — Indicative Options + Deep-Link Handoff

**Feature Branch**: `026-flights-deeplink`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Flight suggestions + deep-link handoff (display only — NOT merchant-of-record). Ticket: demo-10-flights-deeplink (B13). OPERATOR lists 'Flights' among must-haves. PRD is explicit (Non-goals + §9.3 bookable map + Risks): DO NOT be merchant-of-record for flights early; MVP = DEEP-LINK. Build DISPLAY + DEEP-LINK only, never in-platform flight booking/payment. Build a flights card in the builder/booking context: given the trip's destination and dates, show 2-3 indicative flight options (seeded/sandbox: airline, times, indicative price as budget anchor) with a 'Search flights' / 'Book on partner' deep-link button that hands off to an external/partner URL. Make clear it is a deep-link, not an in-platform booking. Do NOT add flight items to the canonical bookable cart or create a flights merchant/payment path. Flights remain the budget anchor (domain/budget.ts) only. Acceptance: a flights card shows indicative options + a deep-link handoff; no flight is booked in-platform; no merchant-of-record path added."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See indicative flight options while reviewing a drafted trip (Priority: P1)

An agent who has just drafted a trip (destination, dates, and a priced day-by-day itinerary) sees a flights card showing 2-3 indicative flight options for that destination — airline, rough times, and an indicative price — positioned against the trip's already-allocated flights budget, so they have a realistic sense of the flight cost before advising their client.

**Why this priority**: This is the entire value of the feature — the operator named "Flights" a must-have precisely because agents currently have no flight-cost signal at all inside the builder. Without this, the flights budget line is an abstract number with nothing concrete behind it.

**Independent Test**: Draft a trip in the AI Builder, land on the drafted result, and confirm a flights card renders with 2-3 distinct options (each showing an airline name, indicative times, and an indicative price) without any additional agent action.

**Acceptance Scenarios**:

1. **Given** an agent has just drafted a trip for a destination and date range, **When** the drafted result renders, **Then** a flights card shows 2 or 3 indicative flight options, each with an airline, indicative departure/return times, and an indicative price.
2. **Given** two trips drafted for different destinations, **When** each drafted result renders, **Then** the flights card's options differ between the two destinations (not identical, generic filler).
3. **Given** the same trip is viewed twice without re-drafting, **When** the flights card renders each time, **Then** the same options appear both times (stable, not re-randomized on every render).

---

### User Story 2 - Hand off to a partner to actually search/book flights (Priority: P1)

An agent, having seen the indicative options, wants to move the flight search forward. They use the flights card's deep-link action, which opens an external partner site in a new tab pre-oriented to the trip's destination — TripForge never takes a flight booking or payment itself.

**Why this priority**: This is the PRD's explicit non-goal boundary (§9.3, Risks: "flights ops & thin margin") made concrete in the UI — equally load-bearing as User Story 1, since a flights card with no way to act on it would either be a dead end or invite agents to expect in-platform booking that does not exist.

**Independent Test**: From a rendered flights card, activate the "Search flights on partner" action and confirm it opens an external URL in a new browser tab/window, with no request sent to any TripForge booking or payment endpoint.

**Acceptance Scenarios**:

1. **Given** a rendered flights card, **When** the agent activates the deep-link action, **Then** a new tab opens to an external partner URL (not a TripForge route) — the current tab/session is left exactly as it was.
2. **Given** the flights card is visible, **When** the agent reads its copy, **Then** the card and its action are labeled in a way that makes clear this is a handoff to search/book elsewhere, not an in-platform booking.
3. **Given** the agent has activated the deep-link action, **When** they return to TripForge, **Then** nothing in the trip's data (itinerary, bookings, budget) has changed as a result — the deep-link is read-only from TripForge's perspective.

---

### User Story 3 - See the same flights card when reopening a saved trip (Priority: P2)

An agent reopens a previously drafted/saved trip from their trip list (not immediately after drafting it) and still sees the flights card with the same indicative options and deep-link handoff, so the flight-cost context isn't lost once the session that drafted it ends.

**Why this priority**: Extends User Story 1's value across sessions — a flights card that only appears in the single moment right after drafting is a materially smaller win than one that persists for the life of the trip, but the feature is still useful without it (P1 stories stand alone).

**Independent Test**: Draft and save a trip, navigate away (e.g. to the trip list), reopen that same trip, and confirm the flights card renders with the same destination-derived options as it did at draft time.

**Acceptance Scenarios**:

1. **Given** a trip was drafted and saved in an earlier session, **When** the agent reopens it from their trip list, **Then** the flights card renders using that trip's own destination and dates (not another trip's, not a generic placeholder).
2. **Given** a reopened trip's flights card, **When** compared to the same trip's flights card immediately after drafting, **Then** the same options appear (deterministic per trip, not re-rolled on reopen).

---

### Edge Cases

- What happens when the trip's date range is very short (e.g. a single day) or very long? The card still shows 2-3 options; option times are derived from the trip's own check-in/check-out dates without requiring a minimum trip length.
- What happens when the destination string is unusual (e.g. contains punctuation, is very long, or is a region rather than a single city)? Option generation must not error or crash — it falls back to a small set of generic-but-still-destination-labeled options rather than failing the whole drafted-result or reopened-trip view.
- What happens when the trip has zero flights budget allocated (a hard-cap budget entirely consumed by other categories, if that were ever possible)? The card still shows indicative options; it simply has no budget figure to compare against, or shows the allocated amount as-is (even if $0) — it never fabricates a budget number.
- What happens when the deep-link partner URL cannot be reached by the agent's browser (offline, blocked)? That is standard external-link/browser behavior outside this feature's responsibility — the card's own rendering and TripForge's own state are unaffected either way.
- What happens on a reopened trip belonging to a different agency (cross-tenant access attempt)? Unchanged — the existing tenant-scoped trip-read guard already blocks this before any flights card would render; this feature adds no new data access path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a flights card showing 2-3 indicative flight options whenever an agent views a drafted or reopened trip's day-by-day result.
- **FR-002**: Each indicative flight option MUST show an airline name, an indicative departure/return time, and an indicative price.
- **FR-003**: Indicative flight options MUST be derived deterministically from the trip's own destination and date range, so the same trip always shows the same options and different trips show different options.
- **FR-004**: The flights card MUST provide a single clearly-labeled action that opens an external partner URL in a new browser tab, handing the agent off to search/book flights outside TripForge.
- **FR-005**: The flights card and its deep-link action MUST be labeled so an agent cannot reasonably mistake it for an in-platform flight booking (e.g. "Search flights on partner ↗", not "Book flights").
- **FR-006**: System MUST NOT create, modify, or persist any flight item on the trip's canonical itinerary (no new day item, no new bookable cart entry) as a result of this feature.
- **FR-007**: System MUST NOT create any flight booking, payment, or merchant-of-record path — the deep-link action is the full extent of "booking" flights through this feature.
- **FR-008**: When the trip has an allocated flights budget amount, the flights card MUST reference that already-allocated amount as read-only context (e.g. "your flights budget: $X") without performing any new money computation — it reads the existing allocation, never recalculates or rebalances it.
- **FR-009**: The flights card MUST render for both a freshly-drafted trip (same session as drafting) and a reopened, previously-saved trip, using that same trip's own destination/dates in both cases.
- **FR-010**: Indicative flight option generation MUST NOT call any external network service — it uses local, seeded/sandbox data only (consistent with the project's existing sandbox-supply convention).
- **FR-011**: The flights card MUST NOT require or display a flight origin/departure city — origin is not currently captured anywhere in the product, and this feature does not introduce it (see Assumptions).

### Key Entities *(include if feature involves data)*

- **Indicative Flight Option**: A single seeded/sandbox flight suggestion shown on a trip's flights card — has an airline name, an indicative departure and return time (derived from the trip's date range), and an indicative price (in the trip's currency). Not persisted; regenerated deterministically from the trip's destination + dates each time the card renders.
- **Flights Budget Reference**: The trip's existing `flightsTransport` budget allocation (already computed elsewhere in the product), shown read-only on the flights card for comparison against the indicative options — not a new entity, just a new display of an existing value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent viewing any drafted or reopened trip sees a populated flights card (2-3 options) with zero additional clicks — it renders as part of the existing trip view.
- **SC-002**: 100% of flights-card deep-link activations open an external tab and result in zero TripForge booking or payment records being created.
- **SC-003**: The same trip shows byte-identical flight options across a draft-then-immediately-view and a save-then-reopen-later flow (deterministic, not randomized).
- **SC-004**: Two trips with different destinations show non-identical option sets at least 90% of the time (options are meaningfully destination-derived, not a single fixed list).

## Assumptions

- **Flight origin is out of scope for v0.** No part of the product (trip request form, canonical itinerary schema, or any persisted record) captures a departure city today. Rather than inventing a new input just for this feature, the flights card and its deep-link operate on destination + dates only; the partner deep-link omits an origin parameter (consistent with how many flight-search entry points accept an unspecified/"nearest airport" origin). A future ticket may add explicit origin capture if the operator wants routed indicative pricing.
- **"Booking context"** in the ticket means the trip's day-by-day result view (both the freshly-drafted result and a reopened saved trip), not the payment/checkout step of booking a hotel/activity component — this feature adds no UI to the hotel/activity/transfer booking flow itself, since flights are never part of that bookable cart (Non-goal, PRD §9.3).
- **Deep-link target** is a single, fixed, generic flight-search partner URL pattern (e.g. a Google Flights-style search query built from destination + dates), not a per-airline or per-integration-partner URL — no commercial partner integration exists yet, so the destination is a generic, always-available search entry point rather than a named commercial partner.
- **Indicative pricing** is illustrative only (clearly not a real-time fare) and is generated the same way the project's other sandbox supply data is (deterministic, keyed off input criteria) — it carries no guarantee of matching real-world fares, consistent with "indicative" in the ticket's own wording.
- This feature ships independently of seed-0022a (content library binary uploads) and any other open ticket — no shared code or sequencing dependency.
