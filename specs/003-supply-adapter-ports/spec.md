# Feature Specification: Supply Adapter Port Family + Sandbox Mocks

**Feature Branch**: `003-supply-adapter-ports`

**Created**: 2026-07-07

**Status**: Draft

**Ticket**: seed-0003

**Input**: User description: "Supply adapter port family + sandbox mocks (Constitution V, PRD 9.3). Create the supplier-agnostic port family for the P0 bookable component map: hotels (bedbank net rates), activities/tickets, transfers, car rental — each with search, quote-with-markup, book, cancel — plus deterministic sandbox mock implementations for tests. Design the port contracts for the PRD 9.2/9.4 engineering realities: quote-then-book with price hold/expiry + re-quote, multi-currency, partial-failure handling in multi-supplier carts, and a merchant-of-record field per component. No supplier API shapes may leak outside an adapter. Caching split per INV-025/026. Real aggregator integrations come later behind the same ports."

## User Scenarios & Testing *(mandatory)*

The "user" of this feature is the platform's booking layer (and, through it, the
agent building and booking a trip). Nothing here is a screen; everything here is
the contract that makes the later booking, budget-allocator, and marketplace
features possible and supplier-proof.

### User Story 1 - Book any P0 component through one uniform contract (Priority: P1)

A booking flow needs to search available inventory, obtain a firm price, book it,
and cancel it — identically for each of the four P0 component types (hotel stays,
activities/tickets, transfers, car rental) — without knowing or caring which
supplier ultimately fulfils it.

**Why this priority**: This is the entire point of the ticket — the P0 component
map (PRD §9.3) reachable through supplier-agnostic contracts (Constitution V).
Every later booking/allocator/marketplace feature compiles against these
contracts.

**Independent Test**: An automated test can drive search → quote → book → cancel
for each component type against the sandbox implementations and assert exact
results, with no network and no supplier credentials.

**Acceptance Scenarios**:

1. **Given** a destination and dates, **When** the booking layer searches a
   component type, **Then** it receives a deterministic list of offers, each with
   an exact net price in an explicit currency.
2. **Given** an offer, **When** the booking layer requests a quote, **Then** it
   receives a firm price with an explicit hold expiry and an explicit merchant
   of record.
3. **Given** an unexpired quote, **When** the booking layer books it, **Then**
   the booking is confirmed and references that quote.
4. **Given** a confirmed booking, **When** the booking layer cancels it, **Then**
   the cancellation succeeds and the booking is recorded as cancelled.

---

### User Story 2 - An expired price can never book silently (Priority: P1)

A quote is a price promise with a deadline. When the deadline passes, the booking
layer must be told to get a fresh price — the platform must never charge a client
against a price that is no longer guaranteed (INV-006).

**Why this priority**: Money-path correctness. Booking at a silently changed
price is a trust-destroying defect; the PRD calls hold/expiry + re-quote a core
engineering reality (§9.2/§9.4).

**Independent Test**: A test can advance a controllable clock past a quote's
expiry, attempt to book, and assert the attempt fails with an identifiable
"quote expired" outcome and that no booking was created; re-quoting the same
offer then succeeds.

**Acceptance Scenarios**:

1. **Given** a quote whose hold has expired, **When** the booking layer attempts
   to book it, **Then** the attempt fails with a "quote expired" outcome and no
   booking exists.
2. **Given** an expired quote, **When** the booking layer re-quotes the same
   offer, **Then** it receives a fresh quote with a new hold expiry.

---

### User Story 3 - One component's failure never destroys the rest of the cart (Priority: P2)

A trip is a multi-supplier cart: a hotel from one supplier, an activity from
another, a transfer from a third. When one component fails to book, the others'
price holds must survive so the agent can fix the one failure without losing the
whole trip (PRD §9.4, INV-007).

**Why this priority**: The cart orchestration itself lands with the
quote-then-book flow (seed-0005), but the port contracts must guarantee the
properties the cart depends on — typed booking failures and independent holds —
or the cart cannot be built correctly later.

**Independent Test**: A test can quote two components, deterministically force
one booking to fail, and assert the failed component reports a typed reason
while the sibling quote remains valid and bookable.

**Acceptance Scenarios**:

1. **Given** two held quotes, **When** booking one fails, **Then** the failure
   carries an identifiable reason and the other quote can still be booked within
   its hold window.
2. **Given** a booking failure, **When** the booking layer inspects the outcome,
   **Then** it can distinguish "quote expired" from "supplier rejected" without
   parsing free-form text.

---

### User Story 4 - Swapping a supplier touches nothing outside the adapter (Priority: P2)

When a real aggregator (RateHawk/Viator/Mozio/CarTrawler class) replaces a
sandbox implementation later, no booking, allocator, marketplace, or UI code may
change — only the adapter package and the single composition-root wiring line.

**Why this priority**: Constitution V's rationale — aggregator dependence is a
margin and continuity risk; the boundary is what keeps it swappable.

**Independent Test**: A single reusable contract test suite runs against any
implementation of a port; the sandbox implementations pass it today, and a
future real adapter must pass the same suite unchanged.

**Acceptance Scenarios**:

1. **Given** the contract test suite, **When** it runs against each sandbox
   implementation, **Then** all four component types pass the same behavioral
   contract.
2. **Given** the whole repository, **When** audited for supplier-specific API
   shapes, **Then** none appear outside the supply adapter package.

---

### Edge Cases

- Booking the same quote twice: the second attempt must not create a second
  booking (it fails with an identifiable outcome or returns the same booking —
  it never double-books).
- Cancelling an unknown or already-cancelled booking: fails with an identifiable
  outcome; never silently "succeeds" on nothing.
- Quoting an unknown offer: fails with an identifiable outcome.
- A search with no matching inventory returns an empty list, not an error.
- Components of one trip priced in different currencies: each price carries its
  own explicit currency; nothing converts implicitly (conversion is an explicit,
  logged operation elsewhere — INV-009).
- Quote requested at exactly the expiry instant: an expired hold is exclusive of
  its boundary — booking at or after expiry fails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The booking layer MUST be able to search, quote, book, and cancel
  each of the four P0 component types — hotel stays, activities/tickets,
  transfers, car rental — through supplier-agnostic contracts that live in the
  supply adapter package (Constitution V, INV-005).
- **FR-002**: Every quote MUST carry an explicit hold expiry timestamp; a quote
  is a firm price only until that instant (INV-006).
- **FR-003**: Booking an expired quote MUST fail with a distinguishable
  "quote expired" outcome and MUST NOT create a booking at any price; the same
  offer MUST be re-quotable to obtain a fresh hold (INV-006).
- **FR-004**: Every offer and quote MUST express price as an exact integer
  amount in minor units with an explicit currency (INV-009); different
  components MAY be priced in different currencies; the contracts MUST NOT
  perform or imply currency conversion.
- **FR-005**: Every quote MUST declare its merchant of record from a closed set
  of values, so payments/refunds/liability design can be driven per component
  (PRD §9.2; Constitution V).
- **FR-006**: Booking outcomes MUST be typed: success references the quote;
  failure carries a machine-readable reason (at minimum distinguishing
  "quote expired" from "supplier rejected"). A booking failure on one component
  MUST NOT invalidate, cancel, or shorten the hold of any other quote
  (INV-007 port-level guarantee).
- **FR-007**: Deterministic sandbox implementations MUST exist for all four
  component types: same inputs and same controlled clock always produce the same
  outputs; no network, no randomness, no paid services (INV-019). The sandbox
  MUST support deterministically simulating (a) a booking failure and (b) quote
  expiry, so cart-level tests can exercise partial failure on demand.
- **FR-008**: A single reusable behavioral contract test suite MUST verify any
  implementation of a component port; the four sandbox implementations MUST pass
  it (the L2 gate for this boundary). A future real aggregator adapter passes
  the same suite without modification.
- **FR-009**: No supplier-specific API shape, field name, or identifier may
  appear outside the supply adapter package; replacing or adding an
  implementation MUST require zero changes outside that package other than the
  single composition-root wiring choice (Constitution V acceptance).
- **FR-010**: The contracts MUST separate long-lived descriptive content
  (names, descriptions, amenities, media references) from live price data, so
  that descriptive content can later be materialized into the system of record
  with semantic keys (INV-025) while live rates and quotes are NEVER persisted
  or reused beyond their hold expiry (INV-026 carve-out).
- **FR-011**: The application composition root MUST expose all four component
  ports to request handlers, wired to the sandbox implementations by default,
  so no handler ever constructs an adapter inline.
- **FR-012**: The canonical itinerary schema MUST NOT change: the existing
  supply reference (hotel/activity/transfer) stays as-is, and car-rental
  itinerary-item linkage remains deferred to an operator-gated schema version
  bump (D-006). The car-rental contract exists at the supply boundary only.

### Key Entities

- **Component port**: the supplier-agnostic contract for one bookable component
  type (hotel stay, activity/ticket, transfer, car rental); four verbs —
  search, quote, book, cancel.
- **Offer**: a searchable inventory result — descriptive identity plus an exact
  net price (integer minor units + currency). Not yet a price promise.
- **Quote (price hold)**: a firm price for one offer with an explicit hold
  expiry and an explicit merchant of record. The only thing a booking may
  reference.
- **Booking outcome**: the typed result of a book attempt — confirmed (with a
  booking identity) or failed (with a machine-readable reason).
- **Sandbox supplier**: the deterministic in-repo implementation of a port used
  by tests and local development; supports controlled clocks and deterministic
  failure simulation.
- **Descriptive content**: the long-lived, non-price attributes of supply
  (names, descriptions, amenities, media references) — cacheable later under
  INV-025; kept separate from live price data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Automated tests complete the full search → quote → book → cancel
  journey for 4 of 4 component types against sandbox implementations, with zero
  network access and zero supplier credentials.
- **SC-002**: 100% of attempts to book an expired quote fail with the
  "quote expired" outcome and create no booking (verified per component type).
- **SC-003**: In a two-component partial-failure simulation, the surviving
  component's quote books successfully after the sibling's failure in 100% of
  test runs.
- **SC-004**: A repository-wide audit finds zero supplier-specific API
  identifiers (RateHawk/Hotelbeds/TBO/WebBeds/Viator/GetYourGuide/Tiqets/Klook/
  Mozio/Jayride/HolidayTaxis/CarTrawler class) outside the supply adapter
  package.
- **SC-005**: One shared behavioral contract suite passes against all four
  sandbox implementations — the same suite, no per-implementation assertions
  weakened.
- **SC-006**: The canonical itinerary schema version and shape are byte-for-byte
  unchanged by this feature.

## Assumptions

- **"Quote-with-markup" means net rates in, markup elsewhere**: supply contracts
  expose supplier NET rates only. Markup/sell-price arithmetic is pure domain
  math (INV-010) applied by the booking flow (seed-0005's markup control); the
  quote shape carries exactly what that math needs (an exact net price). A port
  that computed markup would put money math outside the domain layer.
- **Car rental is a supply-boundary contract only**: the architecture's port
  family and the planner's tool list (INV-013: quote_car_rental) include car
  rental, so the port and sandbox land now; itinerary-item linkage for car
  rental is deferred behind an operator-gated schema bump per D-006. No schema
  change is proposed or required by this feature (FR-012).
- **Merchant-of-record values**: closed set {platform, agency, supplier}. P0
  ships declarations only (payments are deferred); sandbox values are plausible
  placeholders per component (e.g. net-rate hotel → agency is merchant;
  commission-model activity → supplier is merchant) and real adapters supply
  the true value from aggregator terms. Extending the set later is an
  adapter-package change, not a schema change.
- **Descriptive-content materialization is deferred**: this feature separates
  content from live rates in the contracts (FR-010); the actual Postgres
  derived tables land with the first feature that consumes supplier content
  (content library / itinerary builder), tracked as a follow-up ticket. Building
  storage now would be speculative (YAGNI — no consumer exists).
- **Cart orchestration is seed-0005**: this feature guarantees the port-level
  properties a cart needs (typed failures, independent holds, deterministic
  failure simulation); the multi-supplier cart flow itself is out of scope.
- **Existing hotel contract is the pattern**: the hotel port landed with the
  skeleton (four verbs, net rate, hold expiry); this feature extends that
  pattern in place to the full family and upgrades it to the full quote-then-
  book semantics (typed failures, merchant of record, expiry enforcement).

## Out of Scope

- Real aggregator integrations (RateHawk/Viator/Mozio/CarTrawler class) — later,
  behind these same ports.
- Multi-supplier cart orchestration and re-balancing (seed-0005).
- Markup, take-rate, or any sell-price math (packages/domain; seed-0005).
- Postgres derived tables for supplier static content (follow-up ticket; lands
  with the first consumer).
- Payments, refunds, or merchant-of-record execution (declaration field only).
- Any canonical itinerary schema change (D-006; ALWAYS-HALT territory).
- Flights (deep-link only per INV-008 — not a supply port at P0).
