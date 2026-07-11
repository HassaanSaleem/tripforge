# Feature Specification: Booked-Price Fidelity on the Client View

**Feature Branch**: `013-booked-price-fidelity`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Ticket seed-0025 (iteration-3 report BUG-1, third ideate pass): the traveler-facing
share page prices a BOOKED trip at the agency's confidential net rates. Observed live: client
page total 347.80 USD vs 424.31 USD of booked client prices for the same trip (delta = exactly
the 22% markup); per-item DB probe confirmed the stored document price equals the net rate on
every item. Folded in from the same report: FEAT-1 — distinguish estimated vs confirmed prices
on the client view.

## The Problem

Three locally-correct pieces compose broken:

1. Draft assembly initializes each item's stored client price as a placeholder equal to the
   supplier net rate ("markup applies at quote time").
2. The quote/book flow computes the real client price (net × markup) into the booking records,
   but nothing ever reflects it back to any read surface.
3. The client view (spec 010) deliberately projects the document's stored price and "does not
   re-quote live inventory" — written for the un-booked case, silent on the booked case.

Result: a traveler holding a share link to a booked trip reads the agency's exact cost basis
(margin exposure — the share panel promises "your brand, your prices"), and the contractual
booked price disagrees with the page beside a "Booked" badge. The canonical schema already
documents the violated contract: an item's sell price is "client-facing (net + agency markup)".

## Storage Decision (the core of this amendment)

**The booked client price lives in the booking records and is projected at READ time.**
Wherever an item is covered by a confirmed booking, traveler-facing read surfaces price that
item from the booking record — the per-component realized sell recorded when the booking was
made. The canonical itinerary document is NOT stamped at book time:

- No canonical itinerary schema change; documents remain valid at the current schema version.
- No new writes on the booking money path; its conservation properties are untouched.
- The booking tables remain the single source of truth for realized money (the same pattern
  the marketplace uses: the revenue-share ledger is the source of truth for splits).
- The document's stored price keeps its draft-estimate semantics: it is the pre-markup
  planning figure until a booking realizes a client price.

Rejected alternative — book-time stamping of the document — would put a document write inside
the booking money path (new conservation surface, new concurrency with document edits and
licensing copies) to denormalize a value the platform already persists per component.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Traveler sees real client prices on a booked trip (Priority: P1)

A travel agent drafts a trip, quotes it at their chosen markup, books the components, and
shares the branded link with their client. The traveler opens the link and reads, for every
booked item, the price the booking actually recorded for the client — never the agency's
net cost — and a trip total that matches the booking confirmation the agent saw.

**Why this priority**: This is the money-trust defect itself. Until it holds, sharing a booked
trip leaks the agency's margin on the golden path (draft → book → share).

**Independent Test**: Book a trip at a clearly non-default markup, open the share link
anonymously, and compare every displayed price and the total against the booking records.

**Acceptance Scenarios**:

1. **Given** a trip quoted at 22% markup and fully booked, **When** the traveler opens the
   share link, **Then** every booked item shows the booked client price (net × 1.22, exact
   integer minor units) and the trip total equals the sum of the booked client prices.
2. **Given** the same trip, **When** the traveler's payload is inspected, **Then** the
   agency's net amounts appear nowhere in it, in any form.
3. **Given** a booked trip shared BEFORE this feature ships whose link is reopened after,
   **Then** the same link now shows booked client prices (read-time projection is
   retroactive; no re-share needed).

---

### User Story 2 - Traveler can tell confirmed prices from estimates (Priority: P2)

A traveler viewing a partially booked trip can see which prices are confirmed booked prices
and which are still estimates, instead of one undifferentiated price column with a badge.

**Why this priority**: Folded-in FEAT-1. Valuable clarity, but only meaningful once the
booked prices themselves are correct (US1).

**Independent Test**: Share a trip with one booked and one un-booked priced item; verify the
two prices are visibly distinguished as confirmed vs estimated.

**Acceptance Scenarios**:

1. **Given** a trip with booked and un-booked priced items, **When** the traveler views it,
   **Then** booked items' prices are presented as confirmed and un-booked items' prices as
   estimates, and the two presentations are visually distinct.
2. **Given** a trip with no bookings, **When** the traveler views it, **Then** all prices
   read as estimates and nothing claims to be confirmed.

---

### User Story 3 - Un-booked shares are unchanged (Priority: P3)

An agent shares an un-booked draft proposal. The traveler sees exactly what they see today:
the document's stored estimate prices, no live re-quoting, same availability semantics.

**Why this priority**: Regression guard — the fix must not disturb the working un-booked path.

**Independent Test**: Share an un-booked draft and verify prices and total match the stored
document exactly.

**Acceptance Scenarios**:

1. **Given** an un-booked draft with priced items, **When** the traveler opens the link,
   **Then** every price and the total equal the document's stored values (today's behavior).

---

### Edge Cases

- **Mixed trips**: totals fold booked prices for booked items with stored estimates for
  un-booked priced items — one consistent fold, no double counting.
- **Booked item whose document entry is unpriced**: the booking record still supplies the
  confirmed price (the projection does not require a stored document price to exist).
- **At most one confirmed booking per item** is guaranteed upstream (item-level exclusivity,
  spec 005 FR-016); the projection relies on it and needs no tie-breaking rule.
- **White-label copies**: bookings are per-agency and per-itinerary. A licensed copy shows
  only the copy owner's bookings; the seller's bookings on the original never bleed into the
  copy's client view (and vice versa).
- **Currency**: booked component prices are recorded in the itinerary's currency at quote
  time, so the fold never mixes currencies; a same-currency invariant violation must fail
  loudly server-side rather than render a wrong total.
- **Unavailable/not-found states**: unchanged (typed unavailable payload; no existence
  oracle) — this feature only changes which price is projected when the view IS available.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For every itinerary item covered by a confirmed booking, traveler-facing read
  surfaces (the public share payload and the share page) MUST show the booked client price
  from the booking record, never the document's stored draft price.
- **FR-002**: The trip total MUST be a server-side integer-minor-unit fold of: booked client
  prices for booked items, plus stored document prices for un-booked priced items; it MUST
  be absent (not zero) when nothing is priced.
- **FR-003**: Un-booked items and fully un-booked drafts MUST render exactly as today from
  the stored document; the client view MUST NOT re-quote live inventory.
- **FR-004**: The client view MUST visibly distinguish confirmed (booked) prices from
  estimated (un-booked) prices, for individual items and in how the total is described when
  it includes estimates.
- **FR-005**: The trust boundary MUST be unchanged: no net amounts, markup rates, supplier
  identifiers, provenance, or tenant identifiers may enter the traveler payload; the only
  new value crossing the boundary is the booked client price in minor units.
- **FR-006**: The canonical itinerary document MUST NOT be modified by this feature — no
  book-time stamping, no schema change, no version bump; the booking records remain the
  single source of truth for realized client prices.
- **FR-007**: The sibling specifications MUST be amended so code does not silently define
  the spec: spec 010's "prices shown are the itinerary's stored sell prices" assumption gains
  the booked-case projection rule, and spec 005 records that the booked sell is projected at
  read time from booking records (the draft-time placeholder equality is draft-only
  semantics).
- **FR-008**: All money handling stays server-side in integer minor units; the traveler's
  browser receives exact server values and applies formatting only.

### Key Entities

- **Booking component record**: the per-item realized outcome of a booking — carries the
  confirmed client price in the itinerary's currency; at most one per item.
- **Client itinerary view**: the redacted traveler payload (allowlist projection); gains the
  booked-price projection and the confirmed-vs-estimate distinction.
- **Canonical itinerary document**: unchanged; its stored per-item price is the draft
  estimate until a booking realizes a client price.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After booking at a non-default markup, the share page's per-item prices and
  trip total equal the booking confirmation's client prices exactly — zero minor-unit delta,
  verified against the persisted booking records.
- **SC-002**: The agency's net amounts appear nowhere in the traveler payload or page for
  booked trips (structural absence, not visual hiding).
- **SC-003**: A traveler viewing a partially booked trip can distinguish confirmed prices
  from estimates without any agent explanation.
- **SC-004**: Un-booked shared drafts render byte-identical prices to today (no regression).
- **SC-005**: The live trade scenario's price-fidelity check passes as a hard assertion:
  client-view booked sum equals the booking ledger's recorded sells exactly.

## Assumptions

- **At most one confirmed booking component per item** (item-level exclusivity, spec 005
  FR-016 + its uniqueness backstop) — the projection needs no multi-component rule.
- **Component prices are already in the itinerary currency** (recorded that way at quote
  time, explicit conversion + markup upstream), so the read-time fold never converts.
- **Estimate/confirmed labeling is presentation copy** — exact wording is the
  implementation's choice within the premium theme, as long as the distinction is visible
  (FR-004) and truthful.
- **The agent-facing workspace day subtotals** showing the same stale draft figures are OUT
  of scope — tracked as seed-0026, deliberately blocked on this feature's storage decision,
  and must read from the same source once implemented.
- **Booked marks continue to derive from confirmed booking records only** (spec 010
  assumption, unchanged); quote/hold states remain invisible to travelers.
