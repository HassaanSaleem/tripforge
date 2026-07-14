# Feature Specification: Group travel — agent-posted departures with seats, joins, and white-label resale

**Feature Branch**: `021-group-travel`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Group travel — agent posts a group departure (seats/capacity), travelers join, and it can be white-labeled (B2B2C + B2B2B). OPERATOR must-have (2026-07-13): 'include group travels as well ... basically agent posting for it. and it can be white-label as well.' A distinct marketplace/trade product on top of the existing single-itinerary marketplace. BUILD group-departure trips: agent posts (itinerary + capacity + per-seat price), travelers/agents join (seat decrements, capacity conserved, concurrent last-seat race yields exactly one winner), white-label resale via existing splitTakeRate/revenue_share_ledger. Ticket: demo-11-group-travel"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent posts a group departure (Priority: P1)

An agency takes a finished, client-ready itinerary it owns and posts it as a **group departure**: a departure date, total seat capacity, and a per-seat price. This creates sellable, trackable group inventory distinct from a one-off private trip.

**Why this priority**: Without posted supply, nothing else in this feature has anything to act on. This is the smallest independently valuable slice — it turns an itinerary into a trackable, sellable group product.

**Independent Test**: An agency posts a group departure from an itinerary it owns with a capacity and per-seat price; the departure exists with `seatsRemaining == capacity` and is retrievable by the posting agency. An agency attempting to post from an itinerary it does not own is refused.

**Acceptance Scenarios**:

1. **Given** an agency-owned itinerary and a chosen departure date, capacity (> 0), and per-seat price (integer minor units, >= 0), **When** the agency posts a group departure, **Then** a departure record is created with `status = active` and `seatsRemaining = capacity`.
2. **Given** an agency attempting to post a group departure from an itinerary owned by a different agency, **When** it submits the post, **Then** the attempt is refused and no departure record is created (tenant ownership enforced).
3. **Given** a capacity of zero or a negative per-seat price, **When** the agency attempts to post, **Then** the attempt is refused with a validation outcome.
4. **Given** an active group departure, **When** the posting agency cancels it, **Then** it no longer appears in browse/join and no further seats can be joined, while already-joined seats are unaffected.

---

### User Story 2 - A seat is joined, with capacity conserved under concurrency (Priority: P2)

An agent, acting on behalf of a named client (B2B2C — the agent is the intermediary; see Assumptions), joins one seat on an active group departure. The join records the seat and decrements the departure's remaining capacity. If two joins race for the last seat, exactly one succeeds and the other receives a typed "sold out" outcome — capacity is never oversold.

**Why this priority**: This is the money + inventory invariant the feature exists to prove (ticket's MONEY-PATH GATE). It depends on User Story 1 (a departure must exist) but is independently testable and is the highest-value, highest-risk behavior in the feature.

**Independent Test**: With one active departure at capacity 1, two concurrent join attempts are issued; exactly one succeeds (seat recorded, `seatsRemaining` reaches 0), the other is refused with a typed "sold out" outcome and creates no seat record. A join against a departure with 0 remaining seats is always refused.

**Acceptance Scenarios**:

1. **Given** an active departure with `seatsRemaining > 0`, **When** an agent joins a seat for a named client, **Then** a seat record is created, `seatsRemaining` decrements by exactly 1, and a payment record for the per-seat price exists.
2. **Given** an active departure with `seatsRemaining == 0`, **When** a join is attempted, **Then** the attempt is refused with a typed "sold out" outcome and no seat or payment record is created.
3. **Given** an active departure with exactly 1 seat remaining, **When** two joins are attempted concurrently, **Then** exactly one succeeds and the other is refused "sold out" — the winning and losing outcomes are deterministic and `seatsRemaining` never goes negative (state-conservation on the failure path).
4. **Given** an inactive (cancelled) departure, **When** a join is attempted, **Then** the attempt is refused and nothing is recorded.

---

### User Story 3 - Agencies browse active group departures (Priority: P3)

Agencies see a "Group Trips" surface listing active group departures — departure date, per-seat price, seats remaining, and the posting agency's verified-seller status — so they can find departures to join clients into or to license/white-label.

**Why this priority**: Supporting visibility for User Stories 1 and 2; valuable but the underlying post/join mechanics already deliver value via direct action even without a dedicated browse page.

**Independent Test**: After posting two departures (one active, one cancelled), browsing shows only the active one with its current `seatsRemaining` and per-seat price.

**Acceptance Scenarios**:

1. **Given** one or more active group departures exist, **When** an agency browses group trips, **Then** it sees each departure's title, departure date, per-seat price, seats-remaining, and the posting agency's verified-seller badge (reusing the existing vetting projection).
2. **Given** a cancelled departure, **When** an agency browses group trips, **Then** the cancelled departure does not appear.
3. **Given** seats are joined on a departure, **When** an agency re-browses, **Then** the displayed `seatsRemaining` reflects the latest count.

---

### User Story 4 - A group departure is white-labeled by another agency (Priority: P4)

A second agency licenses a posted group departure exactly as it would license any marketplace listing today: it pays the listing's license price, the platform take and seller credit are recorded in the existing revenue-share ledger, and the reseller receives its own white-labeled copy of the itinerary — carrying its **own independent seat pool** (same capacity and per-seat price as the original at license time, fully re-sellable and re-priceable by the reseller from that point on) — under the reseller's brand.

**Why this priority**: Extends the existing B2B2B marketplace mechanism (already shipped, unchanged) to group departures. It is additive on top of User Stories 1-3 and is the lowest-independent-value slice — the feature is fully usable without it.

**Independent Test**: An active group departure is listed on the marketplace; a second vetted agency licenses it. The reseller now owns an independent group departure (own itinerary copy, own `seatsRemaining` starting at the licensed capacity) that its clients can join without affecting the original's remaining seats, and the existing revenue-share ledger records a conserved split for the license transaction.

**Acceptance Scenarios**:

1. **Given** an active group departure listed on the marketplace, **When** a distinct vetted agency licenses it, **Then** (a) the existing license/revenue-share-ledger transaction completes exactly as it does for any listing today (conserved: seller credit + platform take = license price); (b) the reseller's agency owns a new group departure row referencing its own white-labeled itinerary copy, with its own `seatsRemaining` starting at the original's capacity at license time, independent of the original departure's ongoing seat count.
2. **Given** the reseller's white-labeled departure, **When** its clients join seats, **Then** only the reseller's own `seatsRemaining` changes — the original seller's departure and seat count are unaffected.
3. **Given** the license transaction fails at any point, **When** the failure occurs, **Then** no license, ledger, itinerary copy, or group-departure-copy record survives (state conservation, mirroring the existing marketplace license guarantee).

---

### Edge Cases

- Posting a group departure from an itinerary that is also an active single-item marketplace listing: allowed — a group departure is independent bolt-on metadata, not a schema fork; the itinerary can carry both.
- Cancelling a departure with seats already joined: the departure stops accepting new joins immediately; already-joined seats and their payment records are untouched (no retroactive refund logic at v0).
- Joining the same named client twice on the same departure: allowed at v0 (each join is an independent seat; no dedup-by-traveler-identity check — matches "books a seat" as a per-seat action, not a per-person cap).
- A departure's per-seat price or capacity after posting: not editable at v0 (matches the existing marketplace listing's "deactivate and re-list" pattern rather than in-place mutation) — cancel and re-post to change terms.
- White-labeling a departure that already has joined seats: the reseller's copy starts at the ORIGINAL's full capacity at license time (not "remaining" seats) — the reseller is licensing the departure product, not buying into the seller's existing sold seats (matches the "scoped per-offer, independent pool" model chosen below).
- Licensing the same group departure twice by the same reseller: refused, exactly as the existing "already licensed" outcome for any listing (FR-012 of spec 006, unchanged).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an agency to post a group departure from an itinerary it owns, declaring a departure date, total capacity (integer > 0), and per-seat price (integer minor units, >= 0, in the itinerary's currency).
- **FR-002**: The system MUST refuse posting a group departure from an itinerary the requesting agency does not own, and MUST refuse an invalid capacity or price with a validation outcome.
- **FR-003**: A newly posted group departure MUST start with `status = active` and `seatsRemaining = capacity`.
- **FR-004**: The posting agency MUST be able to cancel its own active group departure; cancellation MUST NOT affect already-joined seats and MUST prevent further joins immediately.
- **FR-005**: The system MUST allow an agent to join one seat on an active group departure on behalf of a named client, recording the seat and decrementing `seatsRemaining` by exactly 1, together with a payment record for the per-seat price, in one atomic operation.
- **FR-006**: The system MUST refuse a join when `seatsRemaining == 0` or the departure is inactive, with a typed "sold out" (or "not active") outcome, and MUST create no seat or payment record on refusal.
- **FR-007**: Concurrent joins on a departure with limited remaining seats MUST be resolved so that `seatsRemaining` never goes negative and no more seats are ever recorded than the departure's capacity — exactly one winner on a last-seat race, mirroring the existing booking claim-gate's atomic conditional-decrement discipline (state-conservation on the failure path, INV-011).
- **FR-008**: Agencies MUST be able to browse active group departures (departure date, per-seat price, seats-remaining, posting agency's verified-seller status via the existing vetting projection); cancelled departures MUST be excluded.
- **FR-009**: A group departure MUST be listable and licensable on the marketplace using the existing, unchanged marketplace listing/license mechanism (spec 006 FR-003/FR-008); no new revenue-share computation is introduced — the existing `splitTakeRate`/`revenue_share_ledger` conservation identity (price = platform take + seller credit) applies to the license transaction exactly as it does for any listing today.
- **FR-010**: When a group departure's underlying itinerary is licensed/white-labeled, the license transaction MUST additionally create an independent group-departure record for the reseller's copy, with its own `seatsRemaining` initialized to the original departure's capacity at license time; the reseller's and the original seller's seat counts thereafter change independently (one capacity pool per offer, not shared across original and white-label copies).
- **FR-011**: All group-departure reads and writes MUST be tenant-scoped (INV-004): an agency can post, cancel, and view joins only for its own departures; browsing exposes only active departures regardless of owning agency.
- **FR-012**: Money on the join path MUST use integer minor units with explicit currency (INV-009); the join/capacity logic MUST live in the same money-safe, transactional pattern as the existing booking and license flows — no inline arithmetic outside domain/service functions.
- **FR-013**: The system MUST emit PMF instrumentation events for departure posted and seat joined, sufficient to observe group-travel activity alongside existing marketplace/booking metrics (INV-021).

### Key Entities

- **Group departure**: agency-owned bolt-on metadata attached to one itinerary — departure date, total capacity, per-seat price + currency, active/cancelled status, `seatsRemaining` (derived, conserved atomically). Not a canonical schema change; persisted alongside the itinerary the same way a marketplace listing is (separate table, FK reference).
- **Seat (join record)**: one claimed unit of a departure's capacity — the named client (traveler name/contact), the joining agency, the price paid, timestamp. At most `capacity` seat records may ever exist per departure.
- **White-labeled group departure**: produced when the underlying itinerary is licensed — a new group-departure row owned by the reseller agency, referencing the reseller's white-labeled itinerary copy, with its own independent capacity pool seeded from the original's capacity at license time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agency can post a group departure and see it appear in browse (own and others') within one action, with `seatsRemaining` exactly equal to its declared capacity.
- **SC-002**: 100% of concurrent last-seat join races resolve to exactly one winner; `seatsRemaining` never reaches a negative value and never exceeds capacity, verified under a real concurrent-request integration test.
- **SC-003**: 100% of refused joins (sold out, inactive departure, invalid state) leave zero new seat or payment records (state conservation).
- **SC-004**: 100% of group-departure white-label transactions preserve the existing marketplace conservation identity (seller credit + platform take = license price) and produce an independently-tracked reseller seat pool that does not affect the original's `seatsRemaining`.
- **SC-005**: The end-to-end journey — post → browse → join → last-seat race → white-label — completes against a real running stack with real persisted state in an integration test, including the forced-concurrency conservation branch.

## Assumptions

- **Join is agent-initiated (B2B2C via intermediary), not public self-serve at v0**: the ticket allows "a traveler (or an agent on behalf of a client)" to join. This spec scopes v0 joins to the agent-initiated path only (an agent joins a seat on behalf of a named client), reusing the existing agent-workspace tenant-scoped surface. A public, anonymous traveler self-serve browse-and-join page (no agent intermediary) would be a new consumer-facing discovery/purchase surface, which risks the constitution's non-goal boundary ("no generic consumer trip-planning play" — that surface is P2-roadmap). See "Decisions surfaced for operator review" below.
- **Capacity model: scoped per-offer, not shared** — per the ticket's explicit choice, this spec picks "clearly scoped per-offer": the original departure and each white-labeled copy each carry their own independent `seatsRemaining`, seeded from the licensed capacity at license time. This reuses the existing full-copy license/white-label mechanism unchanged (no new cross-tenant shared-counter locking invariant) and matches the constitution's simplicity default.
- **No new revenue-share semantics**: white-labeling a group departure reuses the existing two-way license split (platform take + seller credit) unchanged. A three-way split that additionally credits the original poster on every seat the reseller later sells is NOT implemented here — that would extend the still-open `RESALE-SHARE-SEMANTICS` operator question (`OPERATOR-DESK.md`) into a new code path, which is out of scope without operator ratification (DIRECTIVE ALWAYS-HALT: "changes to revenue-share ... semantics").
- **Demo seed data deferred**: `demo-01-seed` (populated demo data) is still `todo` and was deferred in a prior iteration (heavy seed-script cycle killed at 55m per loop-state.md) — no seed infrastructure exists to hook into yet. This feature ships without sample group departures pre-populated; a follow-up ticket will add 1-2 sample departures once `demo-01-seed` lands.
- **No supplier interaction**: a group departure is agent-authored, fixed-price inventory (not live-priced against a supply-port aggregator); FR-006/007's quote-then-book invariant (INV-006) does not apply here — join is a direct atomic claim-and-pay, not a hold-then-book flow.
- **Per-seat price is fixed at post time**: not editable in place at v0; changing price/capacity requires cancelling and re-posting (matches the existing marketplace listing's deactivate/re-list pattern).

### Decisions surfaced for operator review

- **D-0021.a — Public self-serve traveler join**: RECOMMENDED (specified above): v0 ships agent-initiated joins only, reusing the existing agent-workspace surface. A public, anonymous "browse and join without an agent" page is a materially different (consumer-discovery) surface and is deferred pending an explicit operator scope decision, consistent with the P2 consumer-surface roadmap phase.
- **D-0021.b — Originator revenue share on resold seat sales**: once a group departure is white-labeled, should the ORIGINAL poster earn anything when the RESELLER sells seats on their own copy? This spec's recommended default is NO (the reseller keeps 100% of their own seat sales, matching how a licensed itinerary copy's future bookings already work today — no per-booking revenue-share is paid back to the original author). This is coupled to the still-open `RESALE-SHARE-SEMANTICS` desk row and should be ratified alongside it, not decided independently here.
