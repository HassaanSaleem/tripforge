# Feature Specification: Budget Allocator + Quote-Then-Book Flow

**Feature Branch**: `005-budget-quote-book`

**Created**: 2026-07-08

**Status**: Draft

**Ticket**: seed-0005

**Input**: User description: "Budget allocator + quote-then-book flow (PRD 9.1/9.2/9.4) — the core AI differentiator per Constitution III. Budget allocator: split a total budget (hard cap or target) across categories, pull live options per category via the supply ports, assemble to fit, re-balance when a category runs over. Flights/transport is a reserve/manual estimate only at P0. Output: itinerary (canonical schema) with visible per-category and per-day budget breakdown. Quote-then-book: price holds with expiry, re-quote on expiry, transparent currency conversion, multi-supplier cart with partial-failure handling. AI wiring through LLMPort on claude-haiku-4-5; typed tool definitions wrapping the supply ports; structured outputs guarantee schema-conformant plans; deterministic fakes in tests. Allocator is a pure domain function; plan->book conversion events emitted; L3 test walks describe-trip -> allocated plan -> quote -> book against sandbox mocks with state-delta assertions."

## User Scenarios & Testing *(mandatory)*

The user of this feature is the **agent** building a client trip in the agency
workspace, reached through the platform's API surface (the same procedures the
web and mobile workspaces consume). This is the Build→Book half of the shared
engine: describe a trip and a budget, get back a live-priced, budget-fit
itinerary draft, then turn its components into real bookings with the agency's
markup applied — the flow the North Star metric (GBV) is made of.

### User Story 1 - Describe a trip, get a budget-fit, live-priced draft (Priority: P1)

An agent describes a client trip — destination, dates, party size, trip style,
and a total budget (hard cap or target) — and receives a draft itinerary in the
canonical schema: days populated with real, bookable inventory options priced
from live (sandbox at P0) supply, a per-category budget allocation, and a
per-day spend breakdown. The flights/transport share of the budget is reserved
as an anchor amount and never spent by the planner (no flight lookup exists at
P0).

**Why this priority**: This is the core AI differentiator (Constitution III):
budget-aware planning priced against real inventory. Every other story operates
on the itinerary this story produces.

**Independent Test**: Call the draft-plan operation with a fixed trip request
against sandbox supply and a deterministic planner fake; assert the returned
itinerary validates against the canonical schema, every priced item traces to a
real supply offer, category allocations sum exactly to the total budget, and
the flights/transport allocation is untouched by items.

**Acceptance Scenarios**:

1. **Given** a trip request with a total budget in one currency, **When** the
   agent requests a draft plan, **Then** the response is a canonical-schema
   itinerary whose per-category allocations sum exactly to the total budget
   (no minor unit lost or created) and whose every priced item carries a
   supply reference to a real searchable offer.
2. **Given** a drafted itinerary, **When** the agent inspects it, **Then**
   each day shows its own subtotal and the pricing block shows, per category,
   the allocated amount and the amount the draft consumes (spent).
3. **Given** a budget too small to fit the cheapest available option in a
   category, **When** the draft is assembled, **Then** the category is left
   visibly under-filled (no item forced in over its cap) rather than the
   budget being silently exceeded.
4. **Given** the platform runs with no AI provider key configured (local
   compose stack), **When** the agent requests a draft plan, **Then** the flow
   still produces a deterministic, valid, budget-fit itinerary (deterministic
   planner fake — no paid service required).

---

### User Story 2 - Quote then book with markup (Priority: P1)

An agent takes a drafted itinerary and books it: first requesting firm quotes
(price holds with explicit expiries) for its bookable items with the agency's
markup applied, then confirming the booking of those held quotes. Net rate,
sell price, and the markup between them are recorded per component, and money
is only ever recorded for components that actually confirmed.

**Why this priority**: This is the money path — the plan→book conversion that
GBV measures. Without it the draft is a brochure, not a booking.

**Independent Test**: Against sandbox supply, quote a drafted itinerary's items
(markup applied), book the quotes, and assert exact database state deltas: one
booking, one reservation row per confirmed component, one markup ledger row per
confirmed component (sell − net = markup exactly), and the plan→book metric
events written in the same transaction.

**Acceptance Scenarios**:

1. **Given** a drafted itinerary with bookable items, **When** the agent
   requests quotes with a markup, **Then** each quote shows the supplier net
   rate, the sell price in the itinerary currency, an explicit hold expiry,
   and the merchant of record.
2. **Given** held, unexpired quotes, **When** the agent books them, **Then**
   each component confirms against its quote, and the booking writes exactly
   one reservation row and one markup ledger row per confirmed component,
   where sell − net equals the recorded markup to the minor unit.
3. **Given** a quote whose hold has expired, **When** the agent attempts to
   book it, **Then** that component fails with an identifiable "quote expired"
   outcome, no reservation or ledger row is written for it, and re-quoting
   the same item succeeds with a fresh hold.
4. **Given** a supplier quote priced in a different currency than the
   itinerary, **When** the quote is presented, **Then** the sell price is in
   the itinerary currency and the conversion is transparent: the supplier
   currency, supplier net amount, and the rate applied are all visible on the
   quote and recorded with the booking.

---

### User Story 3 - One component's failure never destroys the cart (Priority: P2)

A trip is a multi-supplier cart. When one component fails to book (supplier
rejection, expired hold), the other components' outcomes are unaffected:
confirmed siblings stay confirmed with their money recorded, held siblings
keep their holds, and the failed component records nothing.

**Why this priority**: Partial-failure handling is a PRD §9.4 engineering
reality and the failure branch of the money path (Constitution VI) — it is
where orphan ledger rows would appear if unhandled.

**Independent Test**: Build a cart containing the sandbox's deterministic
always-fails-booking offer alongside normal offers; book the cart; assert the
failed component reports a typed reason, siblings confirm normally, and the
failed component contributed zero rows to any table (conservation on the
failure branch).

**Acceptance Scenarios**:

1. **Given** a cart of three held quotes where one will deterministically fail
   at booking, **When** the agent books the cart, **Then** the two others
   confirm with their reservation + ledger rows and the failed one reports a
   machine-readable failure reason.
2. **Given** a booking where every component fails, **When** the operation
   completes, **Then** the database state is exactly as it was before the
   attempt (zero delta — nothing was written).
3. **Given** a component that failed to book, **When** the agent re-quotes
   just that component, **Then** they receive a fresh hold and can book it
   without touching the already-confirmed siblings.

---

### User Story 4 - Re-balance when a category runs over (Priority: P2)

When the options available in a category cannot fit its allocation but the
overall budget still has room (buffer or under-consumed categories), the
allocator re-balances: it moves headroom into the over-running category so the
trip still fits the total. When mode is hard cap, the total is never exceeded;
when mode is target, the breakdown shows the overshoot honestly.

**Why this priority**: "Assemble to fit, re-balance when a category runs over"
is the PRD §9.2 behavior that makes budget-awareness real rather than
cosmetic; it can land after the basic allocate-and-fit path works.

**Independent Test**: Feed the pure allocator a category demand profile that
exceeds one category's band but fits the total; assert the returned allocation
moves exactly the needed amount from buffer/donor categories, still sums to
the total, and never turns any allocation negative.

**Acceptance Scenarios**:

1. **Given** accommodation options whose cheapest fit exceeds the
   accommodation allocation while buffer headroom exists, **When** the plan is
   assembled, **Then** the final allocation shows buffer reduced and
   accommodation increased by exactly the same amount, and the trip fits.
2. **Given** a hard-cap budget that cannot fit even after re-balancing,
   **When** the plan is assembled, **Then** the category is left under-filled
   and visibly flagged rather than the cap being exceeded.
3. **Given** any re-balance, **When** allocations are inspected, **Then** the
   flights/transport reserve was never used as a donor (it is the anchor —
   consuming it would fabricate budget the flights will still need).

---

### User Story 5 - The platform can measure plan→book conversion (Priority: P3)

Every drafted trip and every confirmed booking emits its PMF metric event in
the same transaction as the business action, so the plan→book conversion rate
and GBV read models (already live) compute real numbers for this flow.

**Why this priority**: PMF instrumentation is constitutionally mandatory from
v1, but the events ride on the operations built in stories 1–2; this story
just pins them.

**Independent Test**: Draft a plan and book it; assert a trip-created event
(self-built) exists for the itinerary and a booking-confirmed event exists per
confirmed component with the sell amount, both written atomically with their
business action; the existing plan→book metric view counts them.

**Acceptance Scenarios**:

1. **Given** a successful draft, **When** the itinerary is persisted, **Then**
   a trip-created event (source: self-built) is recorded in the same
   transaction — a failed draft records nothing.
2. **Given** a booking with two confirmed components and one failed one,
   **When** the transaction commits, **Then** booking-confirmed events exist
   for exactly the two confirmed components, carrying sell amounts in the
   itinerary currency.

---

### Edge Cases

- Draft request for zero days or zero party size: rejected at the boundary
  with a validation error, nothing persisted.
- Total budget too small to cover even the flights/transport reserve: the
  draft fails with an identifiable "budget infeasible" outcome, nothing
  persisted.
- The AI planner proposes an offer that does not exist in supply (hallucinated
  reference): the item is dropped during deterministic verification — every
  priced item in the output traces to a re-verified offer.
- The AI planner returns malformed output twice in a row: the draft operation
  fails with an identifiable planner error; nothing persisted (no partial
  itinerary).
- Booking the same quote twice: the second attempt does not double-book or
  double-record (the supplier layer replays the first outcome; the booking
  layer refuses to re-consume a consumed quote row).
- Two live holds exist for the same itinerary item — re-quoting mints a fresh
  hold without consuming the old one, so this arises whenever an agent quotes
  twice before booking: booking both holds, in one request or across separate
  requests (including concurrently), confirms the item AT MOST once; every
  other attempt fails with a typed "item already booked" outcome and
  contributes zero rows *(amended 2026-07-09, spec-gap-0002)*.
- Quote requested for an itinerary belonging to another agency: denied by
  tenancy scoping — no cross-tenant reads or writes.
- Booking with an empty quote list: rejected at the boundary, zero state delta.
- Quote rows are never served after their hold expiry: an expired row can only
  trigger the re-quote path (money freshness is correctness, not caching).
- Currency conversion with no known rate for the supplier→itinerary pair: the
  quote for that item fails identifiably; other items are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The budget allocator MUST be a pure, deterministic function of
  (total budget, budget mode, trip type, trip length, party size): it splits
  the total across the five canonical categories (flights/transport,
  accommodation, activities, local transport, buffer) using trip-type-tunable
  band percentages, in exact integer minor units, with conservation — the
  allocations sum to the total, always (INV-009/010/015).
- **FR-002**: The flights/transport category MUST be allocated as a reserve
  (budget anchor): no live lookup, no items priced against it, and it is never
  a donor in re-balancing (INV-008/022).
- **FR-003**: Draft planning MUST pull live options per category through the
  supply ports and price every itinerary item from a real offer — the AI
  planner MAY propose and narrate, but every price in the output MUST come
  from supply, never from generated text, and proposals that do not match a
  real offer MUST be dropped during deterministic verification (INV-013/014).
- **FR-004**: The draft output MUST be a canonical-schema itinerary carrying
  the per-category allocation (allocated and spent per category) and a per-day
  subtotal, persisted with the itinerary and scoped to the owning agency
  (INV-001/004/015).
- **FR-005**: Assembly MUST fit items within category allocations; when a
  category runs over and headroom exists (buffer first, then under-consumed
  donor categories, never the flights reserve), the allocator MUST re-balance
  by exact integer amounts; under hard-cap mode the total is never exceeded —
  a category that cannot fit is left under-filled and flagged, never silently
  overrun.
- **FR-006**: AI planning MUST run only through the LLM port with the pinned
  economy-tier model, with the planner's supply lookups expressed as typed,
  code-defined tool definitions wrapping the supply ports, and the final plan
  captured as structured output validated mechanically against the canonical
  itinerary vocabulary; the test suite and the local stack MUST run against a
  deterministic planner fake with zero paid calls (INV-013/019).
- **FR-007**: Quoting an itinerary's bookable items MUST return, per item, a
  firm price hold with: supplier net rate, hold expiry, merchant of record,
  and a sell price computed by pure domain markup math (integer minor units,
  basis points) in the itinerary currency; markup arithmetic MUST live only in
  the domain layer (INV-006/009/010).
- **FR-008**: When a supplier prices in a currency other than the itinerary's,
  conversion MUST be explicit and transparent: performed by pure domain math
  with a declared rate, recorded (supplier currency, supplier amount, rate)
  on the quote and on the resulting booking component, and logged; no
  implicit conversion anywhere (INV-009).
- **FR-009**: Held quotes MUST be persisted server-side with their expiry and
  agency scope so booking can re-validate them without trusting the client;
  a quote row at or past its expiry MUST never be consumed — booking it fails
  with a "quote expired" outcome and the item MUST be re-quotable for a fresh
  hold (INV-006, INV-026 carve-out, INV-028 statelessness). A live hold MUST
  remain bookable from a fresh server process (quote and book are separate
  serverless invocations): if the supplier no longer recognizes the held
  quote, booking re-establishes the hold and consumes it only when the
  re-quoted net price, currency, and merchant of record match the persisted
  hold exactly — a changed price fails the component with the "quote expired"
  outcome, never books silently at a new price. A hold is consumed by AT MOST
  one booking under any interleaving — duplicate ids within one request and
  concurrent requests included — enforced atomically at consumption time and
  backstopped by a uniqueness constraint on the recorded consumption.
- **FR-010**: Booking a cart MUST book each component against its held quote
  and record, in one transaction: a booking, one reservation row per confirmed
  component (with supplier booking reference, net, sell, and any conversion
  detail), and one markup ledger row per confirmed component where
  sell − net = markup exactly (INV-010/011).
- **FR-011**: Partial failure MUST be handled per component: a failed
  component (supplier rejected, quote expired, unknown quote) reports a typed
  reason and contributes zero rows to any table; sibling components'
  outcomes and holds are unaffected; a booking where every component fails
  writes nothing at all (state conservation on the failure branch —
  Constitution VI, INV-007/011).
- **FR-012**: The flow MUST emit PMF events in the same transaction as the
  action they measure: trip-created (source self-built) with itinerary
  persistence, and booking-confirmed per confirmed component with the sell
  amount in the itinerary currency (INV-021).
- **FR-013**: All operations MUST be agent-gated workspace procedures scoped
  to the caller's agency (INV-004/023): a traveler or anonymous caller is
  rejected, and no agent can read or book another agency's itineraries or
  quotes.
- **FR-014**: An end-to-end L3 test MUST walk describe-trip → allocated plan →
  quote → book against the real application and database with sandbox supply,
  asserting exact state deltas on the success path and conservation on the
  failure path (quality bar, Money-Safe).
- **FR-015**: The canonical itinerary schema MUST NOT change: the feature
  consumes SCHEMA_VERSION 0.1.0 as-is (a version bump is operator-gated,
  ALWAYS-HALT).
- **FR-016** *(amended 2026-07-09, spec-gap-0002 — item-level booking
  exclusivity)*: An itinerary item MUST have at most one live booking,
  regardless of how many live holds exist for it (FR-009 is hold-level;
  re-quoting legitimately leaves multiple live holds per item). Booking a
  hold for an item that already has a recorded booking component — or whose
  booking is in flight through a sibling hold — MUST fail with a typed
  "item already booked" outcome and contribute zero rows, with sibling
  components unaffected (FR-011 semantics). Within one request, holds
  reducing to the same item are reduced to the first occurrence, mirroring
  the FR-009 duplicate-id rule. Enforcement MUST be atomic with hold
  consumption — the item race is decided at claim time, before any supplier
  call, so a lost race never reaches the supplier — and backstopped by a
  uniqueness constraint on the recorded component's (itinerary, item) pair.

### Key Entities

- **Trip request**: what the agent describes — destination, dates, party size,
  trip style, budget mode (hard cap or target), total budget with currency.
- **Budget allocation**: the per-category split of the total (allocated, and
  once assembled, spent) — persists inside the itinerary's pricing block.
- **Draft itinerary**: the canonical-schema itinerary produced by planning —
  days, items with supply references and pricing snapshots, pricing block,
  provenance; owned by the drafting agency.
- **Held quote (quote row)**: a server-persisted firm price for one itinerary
  item — supplier quote identity, net rate (supplier currency), conversion
  detail, sell price (itinerary currency), markup basis points, hold expiry,
  merchant of record. Dead at expiry; consumed by at most one booking.
- **Booking / reservation component**: the confirmed outcome — per component:
  supplier booking reference, quote consumed, money recorded (net, sell,
  conversion detail). At most one per itinerary item (FR-016).
- **Markup ledger row**: the agency's margin record per confirmed component —
  net, sell, markup (= sell − net), currency; the row take-rate/revenue-share
  features build on later.
- **PMF events**: trip-created and booking-confirmed rows in the existing
  append-only metric event store.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of drafted itineraries validate against the canonical
  schema, and in every one the category allocations sum exactly to the total
  budget (property-tested across the allocator's input space — zero lost or
  fabricated minor units).
- **SC-002**: 100% of priced items in drafted itineraries trace to a
  re-verified supply offer; a planner proposal referencing a nonexistent offer
  never survives to the output.
- **SC-003**: The full describe-trip → plan → quote → book journey completes
  against the local stack with zero paid or external service calls, and the
  L3 walk asserts its exact state deltas (booking, reservation rows, ledger
  rows, PMF events) on success and zero delta on the all-fail branch.
- **SC-004**: 100% of attempts to book an expired or already-consumed quote
  fail with a typed outcome and write nothing; re-quoting then booking the
  same item succeeds.
- **SC-005**: In every confirmed component, sell − net equals the recorded
  markup exactly, in integer minor units, including when the supplier priced
  in a foreign currency (conversion recorded and reproducible from the stored
  rate).
- **SC-006**: A cart with one deterministically-failing component confirms all
  siblings and records zero rows for the failure in 100% of runs.
- **SC-007**: The plan→book PMF view computes a non-zero conversion from
  events emitted by this flow alone (drafted trips and their booked
  components), with events verifiably written in the same transaction as
  their business action.
- **SC-008**: The canonical itinerary schema version and shape are
  byte-for-byte unchanged by this feature.
- **SC-009** *(amended 2026-07-09, spec-gap-0002)*: 100% of attempts to book
  an itinerary item that is already booked — via a second live hold, in the
  same request, a later request, or a concurrent one — fail with the typed
  "item already booked" outcome and write nothing; the item ends with exactly
  one booking component and one ledger row.

## Assumptions

- **Planner architecture — AI proposes, deterministic code guarantees**: the
  LLM (through the port) contributes selection and narrative (which offers,
  which days, titles) via tool-driven lookups; the deterministic allocator +
  assembler re-verify every proposal against supply, re-price from real
  offers, enforce budget fit, and construct the final canonical itinerary.
  This satisfies "structured outputs guarantee schema-conformant plans" while
  keeping every money value port-sourced (INV-014) and the agent the author
  of record (INV-016). With the deterministic fake, the same pipeline yields
  a valid plan with no key configured (INV-019) — the fake proposes from the
  same tool results, so the local stack exercises the identical code path.
- **Default budget bands** (tunable by trip type, midpoints of the ticket's
  ranges, normalized to sum to 100%): flights/transport 40%, accommodation
  35%, activities 12%, local transport 7%, buffer 6%. Trip types adjust
  within the PRD bands; the allocator normalizes any band set to conserve the
  total exactly.
- **Markup source**: the agent supplies markup basis points per quote request
  (default 1500 bps if unspecified). Markup *policy* administration
  (owner/admin-managed defaults) is explicitly deferred to the
  agency-admin surface ticket (seed-0009 notes) — this feature takes markup
  as caller input and computes with pure domain math.
- **Exchange rates at P0 are a fixed deterministic table** (e.g. EUR→USD)
  wired at the composition root — sufficient for sandbox parity and INV-019
  determinism, recorded per use for transparency. A live rate source is a
  later adapter behind the same explicit-conversion seam; rates are supplied
  to the domain math, never fetched inside it.
- **Persisting held quotes is not price caching**: rows exist so booking can
  re-validate holds server-side in a stateless topology (INV-028) and are
  refused at/after expiry (the port enforces expiry independently). This is
  the INV-026 carve-out honored, not violated.
- **Booking cancel flow is out of scope**: ports support cancel; a
  user-facing cancellation/refund flow (and its conservation semantics) is a
  follow-up feature.
- **No new UI screens**: the feature lands as agent-gated API procedures (the
  engine); the workspace builder UI arrives with the sign-in surface ticket
  (seed-0008). Live verification exercises the flow as real HTTP against the
  built stack, per the INV-027 API-change path.
- **Car rental at the supply boundary only**: per D-006, no car-rental
  itinerary item kind exists at v0, so drafted itineraries contain
  stay/activity/transfer items; the car-rental port/tool remains available to
  the planner's lookup loop for price context but produces no itinerary item.
- **Streaming deferral (INV-028)**: with the deterministic fake (local stack)
  and a bounded tool loop on the economy model, the draft operation completes
  well within serverless timeouts; response streaming for long AI drafts is
  deferred with a note in the plan (a follow-up ticket) rather than built
  speculatively now.

## Out of Scope

- Marketplace listing/licensing/white-label and revenue-share plumbing
  (seed-0006).
- Markup policy administration (owner/admin defaults) — seed-0009 territory.
- Sign-in UI / workspace builder screens (seed-0008).
- Booking cancellation / refunds flow.
- Live exchange-rate providers (fixed deterministic table at P0).
- Flights lookup or booking in any form (deep-link is P2; reserve-only here).
- Any canonical itinerary schema change (ALWAYS-HALT; none needed).
- Payments execution / merchant-of-record processing (declaration only).
