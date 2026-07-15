# Feature Specification: Bring-Your-Own Itinerary (Manual Entry)

**Feature Branch**: `029-agent-upload-own-itinerary`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Agent uploads/imports its OWN itinerary (bring-your-own), then price/book/list/share it like an AI-drafted trip. Today EVERY itinerary is AI-drafted (planner/chatEdit); there is NO import/upload path. Let an agent create an itinerary by bringing their OWN — a manual multi-day/item builder — mapped into the CANONICAL itinerary schema, using the SAME item kinds (stay/activity/transfer) that AI-drafted itineraries use. Once created, the itinerary flows through the exact same downstream pipeline as an AI-drafted one: quote-then-book, markup, marketplace list/white-label, and client-view share."

Ticket: agent-upload-own-itinerary

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent manually builds a multi-day itinerary (Priority: P1)

An agent who already has a finished trip plan in their head (or on paper, from a
client conversation, or from an external tool) wants to get it into TripForge
without going through the AI planner chat. They start a new itinerary, name it,
add days, and add stay/activity/transfer items to each day — filling in the
same fields an AI-drafted item would have (title, dates/times, occupancy,
locations) — without needing a live supplier rate for any of it yet.

**Why this priority**: This is the entire feature. Without manual creation
there is nothing to price, book, list, or share — every other story depends on
a manually-built itinerary existing first.

**Independent Test**: Can be fully tested by creating a new itinerary through
the manual builder (no AI/chat interaction), adding two days with one item
each, saving, and confirming it appears in the agent's itinerary list as a
normal, openable itinerary.

**Acceptance Scenarios**:

1. **Given** an agent is signed in to their workspace, **When** they start a
   new manual itinerary, name it, and add a day with a stay item (title,
   check-in/check-out dates, occupancy), **Then** the itinerary is saved and
   reopening it shows the same day/item exactly as entered.
2. **Given** an agent is building a manual itinerary, **When** they add an
   activity item and a transfer item to a day, **Then** both items save with
   their kind-specific fields (activity: start time/duration; transfer:
   from/to/mode) and no supplier rate is required to save.
3. **Given** an agent has saved a manual itinerary, **When** they view their
   itinerary list, **Then** the manually-built itinerary appears alongside
   AI-drafted itineraries, and it is visually/label-marked as self-built
   (not implying it was AI-drafted).

---

### User Story 2 - Manually-built itinerary can be priced and booked (Priority: P2)

Once the trip skeleton exists, the agent wants to attach real, bookable
supplier rates to some or all of the items — exactly the same action they'd
take to fix up a price on an AI-drafted item — and then quote and book it for
their client.

**Why this priority**: A trip that can never be priced or booked isn't
sellable — this is what makes the manually-built itinerary commercially
useful, not just a scratchpad.

**Independent Test**: Can be fully tested by taking a manually-built
itinerary, attaching a supplier rate to one item via the existing item-edit
mechanism, running quote-then-book on that item, and confirming a normal
booking record is created with the same conservation guarantees as an
AI-drafted item's booking.

**Acceptance Scenarios**:

1. **Given** a manually-built itinerary with an item that has no supplier
   rate attached, **When** the agent views it, **Then** the item shows as not
   yet priced (no total contribution) and is excluded from the bookable set
   — the same behavior an AI-drafted item with no rate would show.
2. **Given** a manually-built itinerary item now has a supplier rate attached,
   **When** the agent quotes and books it, **Then** the booking completes (or
   fails and conserves state) using the exact same quote-then-book path as an
   AI-drafted item — no special-casing, no separate code path.

---

### User Story 3 - Manually-built itinerary lists, licenses, and shares like any other (Priority: P3)

The agent wants to sell the finished manually-built trip the same way they'd
sell an AI-drafted one: list it on the marketplace for another agent to
license/white-label, or share it directly to their client via the branded
client-view link.

**Why this priority**: Confirms there is truly zero special-casing downstream
— marketplace and client-view are the commercial payoff of the itinerary
existing at all, and they must treat every itinerary the same regardless of
how it was built.

**Independent Test**: Can be fully tested by listing a manually-built,
fully-priced itinerary on the marketplace, having a second agency license and
white-label it, and opening its client-view share link — confirming the
listing, license, and client-view all render correctly with no missing data
and with the origin label visible where other origin/provenance information is
already shown.

**Acceptance Scenarios**:

1. **Given** a fully-priced manually-built itinerary, **When** the agent lists
   it on the marketplace, **Then** the listing appears and can be licensed by
   another agency exactly like an AI-drafted listing, including a correct
   revenue-share split on license.
2. **Given** a manually-built itinerary shared via a client-view link,
   **When** a traveler opens the link, **Then** they see the same
   branded, itemized view (with only client-facing prices, never markup or
   net-rate) that an AI-drafted itinerary's client-view would show.

---

### Edge Cases

- What happens when an agent tries to book an item that never had a supplier
  rate attached? The item stays excluded from the bookable set (as today for
  any unpriced item) — booking proceeds for the priced items only, and the
  agent sees which items still need a rate.
- How does the system handle a manually-built itinerary with zero days or zero
  items? It saves as a valid (if commercially useless) draft — the same way an
  agent can already leave an AI-drafted itinerary sparse; no special minimum is
  enforced beyond the existing schema's structural requirements (a title and a
  currency).
- What happens if an agent tries to list an itinerary on the marketplace while
  it still has unpriced items? Existing marketplace listing rules apply
  unchanged (whatever the AI-drafted path already requires/allows for
  itineraries with an incomplete price picture) — this feature does not loosen
  or tighten that gate.
- How is "self-built" origin displayed once an itinerary is licensed/resold?
  The origin recorded at creation travels with the record the same way other
  non-schema provenance data already does; a licensed copy's origin reflects
  that it is a licensed copy (existing licensing provenance), not that it was
  re-classified as self-built by the new owner.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an agent create a new itinerary by manually
  entering its title, currency, and one or more days, without invoking the AI
  planner.
- **FR-002**: The system MUST let an agent add stay, activity, and transfer
  items to any day of a manually-built itinerary, capturing the same
  kind-specific fields the AI planner already captures for each kind.
- **FR-003**: The system MUST allow a manually-entered item to be saved
  without a supplier rate attached (no price required to create the
  itinerary).
- **FR-004**: The system MUST persist a manually-built itinerary as a
  standard itinerary record, indistinguishable in structure from an
  AI-drafted one, owned by the creating agent's agency (tenant-scoped).
- **FR-005**: The system MUST record that a given itinerary's initial creation
  was manual (agent self-built) rather than AI-drafted, and MUST make that
  origin visible wherever the workspace already shows itinerary-level
  information (e.g. the itinerary list).
- **FR-006**: The system MUST allow an agent to attach a real supplier rate to
  a manually-entered item using the same mechanism already used to edit an
  AI-drafted item, after which the item participates in quote-then-book
  identically to an AI-drafted item.
- **FR-007**: The system MUST exclude any item with no supplier rate attached
  from the bookable set at quote time, consistent with how an unpriced
  AI-drafted item already behaves — no new rejection or error state is
  introduced.
- **FR-008**: The system MUST allow a manually-built itinerary to be listed on
  the marketplace, licensed, white-labeled, and shared via a client-view link
  using the exact same flows AI-drafted itineraries use, with no additional
  steps or restrictions imposed solely because of its manual origin.
- **FR-009**: The system MUST NOT leak internal pricing, markup, or net-rate
  data through the client-view of a manually-built itinerary, matching the
  existing guarantee for AI-drafted itineraries.
- **FR-010**: The system MUST scope all manual-entry creation and edit
  operations to the acting agent's own agency — an agent MUST NOT be able to
  create or modify an itinerary under another agency's ownership.

### Key Entities

- **Manually-built itinerary**: An itinerary record identical in structure to
  an AI-drafted one (same days/items/pricing shape), distinguished only by an
  additional origin marker recorded at creation time indicating it was
  self-built by the agent rather than AI-drafted.
- **Manual item**: A stay, activity, or transfer item entered by the agent by
  hand; identical in shape to an AI-drafted item; may exist with or without an
  attached supplier rate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can create a manually-built, 3-day itinerary with at
  least one item per day in under 5 minutes of hands-on entry time.
- **SC-002**: 100% of manually-built itineraries pass the same downstream
  validation, pricing, booking, listing, licensing, and client-view flows as
  AI-drafted itineraries with zero code paths special-cased on origin.
- **SC-003**: An agent can distinguish, at a glance, which of their itineraries
  were self-built versus AI-drafted from the itinerary list.
- **SC-004**: Zero instances of markup or net-rate figures appearing in a
  manually-built itinerary's client-view, verified by automated negative
  assertions.

## Assumptions

- Manual entry is a structured day/item builder (agent fills in fields
  directly), not a freeform document/file upload or OCR/parsing pipeline —
  the ticket's own scope note frames "upload" as shorthand for "bring your own
  content into the tool," not literal file-parsing.
- Attaching a supplier rate to a manually-entered item reuses the existing
  item-edit mechanism already available for AI-drafted items rather than
  introducing a new attach-rate flow.
- The "self-built vs AI-drafted vs licensed-copy" origin marker is a
  read-mostly classification set once at creation time; it does not need to
  change over an itinerary's lifetime except through the existing
  licensing/copy flow (which already establishes its own provenance).
- No new item kind or schema field is required to represent a manually-entered
  item — the existing stay/activity/transfer kinds with optional
  supplier-rate/pricing fields are sufficient (confirmed against the current
  canonical schema before this spec was written).
