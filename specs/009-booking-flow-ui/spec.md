# Feature Specification: Booking Flow UI — Quote → Review → Book

**Feature Branch**: `kitchen/fix-seed-0009b-booking-ui`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Booking flow UI: quote → review → book, wired to the existing booking tRPC (ticket seed-0009b — make the money path visible in the browser). From a rendered draft itinerary in the workspace planner (spec 008 surface), let the agent QUOTE the itinerary's bookable items via the existing agent-gated workspace.booking.quote mutation (with markup control in basis points), REVIEW the held quotes — per-item sell price, hold expiry, per-item typed failures (unknown_offer, no_rate, already_booked) — then BOOK the selected held quotes via workspace.booking.book and see the confirmation: booking status (confirmed / partially_confirmed / failed), per-component outcomes (confirmed with supplier booking id, or typed failure such as quote_expired, supplier_rejected, already_consumed, item_already_booked), and totals. All prices are exact server minor-unit integers formatted for display only — no client-side money arithmetic (INV-010); every user-visible failure string comes from pure mapping helpers like spec 008. Anonymous/traveler visitors keep the membership prompt (INV-023/024 unchanged); the typed browser tRPC client over the existing /api/trpc mount is the only transport (INV-018). Presentation uses the seed-0009s theme kit (.tf-* components, premium bar — no bare HTML). No changes to the booking service, canonical itinerary schema, or supply adapters — UI + client wiring only. Live Test: a real browser journey plans a trip, quotes it, books it, and sees a confirmed booking."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent quotes a drafted trip with markup control (Priority: P1)

A signed-in agent has just drafted an itinerary in the workspace (spec 008). Below the
rendered plan they set their markup (a percentage over the net rate, pre-filled with
the platform default) and request firm quotes. The page shows, for every bookable item
of the plan: the supplier net rate, the client sell price at their markup, and when the
price hold expires — or, for items that could not be held, a plain-language reason.
This is the "inline net-rate booking with markup control" wedge of the professional
surface: the agent sees exactly what they pay, what the client pays, and how long the
price is guaranteed.

**Why this priority**: Quoting is the gate to the whole money path — nothing can be
booked without a held quote, and the markup control is the agent's margin lever
(Constitution II/III). Without this story the booking backend (spec 005) remains
unreachable from a browser.

**Independent Test**: Boot the built stack, sign in, draft a trip, set a markup,
request quotes, and observe per-item net rate, sell price, and hold expiry rendered —
no API tooling required.

**Acceptance Scenarios**:

1. **Given** a rendered draft itinerary, **When** the agent requests quotes with the
   default markup, **Then** the page shows a pending indicator and, on completion,
   lists every bookable item with its net rate, its sell price at that markup, the
   markup applied, and the hold's expiry time — each money value displayed exactly as
   the platform returned it, with its currency.
2. **Given** the markup control, **When** the agent enters a different percentage and
   re-quotes, **Then** fresh holds render with sell prices reflecting the new markup
   (as computed by the platform, not the page).
3. **Given** a quote request in flight, **When** the agent tries to submit again,
   **Then** the page refuses duplicate submission until the current request resolves.

---

### User Story 2 - Agent books held quotes and sees confirmation (Priority: P1)

With held quotes on screen, the agent reviews them, keeps the ones they want (all held
items are pre-selected), and books. The page then shows the confirmation: the overall
booking status (fully confirmed, partially confirmed, or failed), the booking
reference, and — per component — the confirmed supplier booking reference with its
sell price, or a plain-language reason the component failed. The money path is now
visible end-to-end in the browser: describe → draft → quote → book → confirmed.

**Why this priority**: This completes the ticket's core demand ("plan → quote → book
end-to-end in a real browser with confirmed booking") and is the platform's North-Star
event (GBV — booked trip value). Ships with US1; testable on its own by booking the
holds US1 produced.

**Independent Test**: From a review list with held quotes, book all of them and
observe a confirmation panel with a booking reference and one confirmed line per
component.

**Acceptance Scenarios**:

1. **Given** held quotes for every bookable item, **When** the agent books them all,
   **Then** the page shows the booking as confirmed with a booking reference, and each
   component shows its supplier booking reference and sell price.
2. **Given** held quotes, **When** the agent deselects some items and books the rest,
   **Then** only the selected holds are booked and the confirmation reflects exactly
   the booked components.
3. **Given** a book request in flight, **When** the agent tries to book again,
   **Then** the page refuses duplicate submission until the call resolves.
4. **Given** a completed booking, **When** the agent requests quotes again, **Then**
   items already booked are reported as such (plain language) and are not re-held.

---

### User Story 3 - Clear feedback when quoting or booking cannot complete (Priority: P2)

When an item cannot be held (offer no longer known, no exchange rate to the trip
currency, already booked) or a booked component fails (hold expired, supplier
rejected, hold no longer recognized, consumed by another booking, item already booked
elsewhere), the agent sees a distinct plain-language explanation per item — never a
raw error payload. A partially confirmed booking clearly separates what was secured
from what was not, and the agent can re-quote the failures and try again.

**Why this priority**: The booking backend returns typed per-component failures as
values precisely so the professional surface can guide the agent (Constitution II).
Surfacing them faithfully is what makes partial failure survivable in front of a
client.

**Independent Test**: Book a hold after letting it expire (or force a supplier
rejection) and observe a distinct human-readable message on that component, with the
rest of the flow intact and a re-quote path available.

**Acceptance Scenarios**:

1. **Given** holds that expired while the agent reviewed them, **When** they book,
   **Then** each expired component explains the hold lapsed and invites re-quoting —
   nothing is silently booked.
2. **Given** a booking where some components confirm and others fail, **When** the
   confirmation renders, **Then** it is labeled partially confirmed, confirmed
   components show their references, failed components show distinct reasons, and the
   agent can re-quote.
3. **Given** an expired or agency-less session, **When** the agent quotes or books,
   **Then** the page shows a human-readable sign-in/membership message rather than a
   raw authorization error.
4. **Given** a network failure mid-request, **When** the call fails, **Then** the page
   says the server could not be reached and the review state stays intact for retry.

---

### User Story 4 - Non-agents never see booking controls (Priority: P3)

Anonymous visitors and travelers keep the existing membership prompt on the workspace
page. Booking controls exist only inside a verified agent's drafted plan; no quote or
book action is ever presented to a non-agent.

**Why this priority**: Guardrail story — existing behavior that must not regress.
Data authorization stays enforced per procedure on the server (INV-023); the page
gate is UX only (INV-024).

**Independent Test**: Open the workspace page without a session and verify the
membership prompt appears with no booking controls anywhere.

**Acceptance Scenarios**:

1. **Given** no session, **When** a visitor opens the workspace page, **Then** they
   see the membership prompt and no markup, quote, or book control.
2. **Given** a traveler session (no agency membership), **When** they open the
   workspace page, **Then** they see the membership prompt and no booking controls.

---

### Edge Cases

- Quote returns a mix of held and failed items: the review renders both — held items
  with prices and expiry, failed items with their reasons; only held items are
  selectable for booking.
- Every item fails to quote: the review explains no items could be held and offers
  re-quoting; no book action is presented.
- The agent deselects every hold: the book action is unavailable until at least one
  hold is selected.
- Markup bounds: the markup control refuses values below 0% or above 100% with an
  inline message before any server call (the platform independently enforces the same
  bounds).
- A booking whose every component fails: the platform records nothing; the page shows
  the failure reasons and the agent can re-quote — no money moved, nothing partially
  displayed as booked.
- Re-quoting mints fresh holds: earlier unexpired holds for the same items may still
  exist server-side; the review always shows only the latest quote response — booking
  uses exactly the holds on screen. The platform's item-level exclusivity guarantees
  a single item can never end up booked twice regardless.
- Network failure mid-book: the page reports the transport failure; whether the
  booking completed is resolved by re-quoting (already-booked items are reported as
  such by the platform).
- Currency display: every money value is shown with its currency code, formatted from
  the exact minor-unit integer the platform returned — the page never re-computes,
  sums, or rounds money. No client-side totals are computed; the plan's total remains
  the one the platform returned with the draft.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a draft itinerary renders for a verified agent, the page MUST
  present booking controls scoped to that plan: a markup percentage input pre-filled
  with the platform default (15%), bounded 0–100% inclusive, and a quote action.
- **FR-002**: The quote action MUST invoke the platform's existing agent-gated quote
  procedure through the platform's single client API surface (INV-018), carrying the
  browser session's credentials and the markup expressed in the procedure's integer
  basis-point unit (percent converted exactly once, 15% → 1500). No new server
  procedure, and no change to any existing procedure's contract or authorization
  (INV-023), is permitted.
- **FR-003**: The review list MUST show, for each item the platform quoted: the item's
  name and kind (joined from the already-rendered plan), and — when held — the net
  rate with its currency, the sell price with its currency, the markup applied, and
  the hold expiry time; or — when failed — a distinct human-readable reason (offer no
  longer available / no exchange rate to the trip currency / item already booked).
- **FR-004**: Held items MUST be individually selectable for booking (pre-selected by
  default); the book action MUST be unavailable while zero holds are selected, while
  a quote or book request is in flight, and MUST refuse duplicate submission.
- **FR-005**: The book action MUST invoke the platform's existing agent-gated book
  procedure with exactly the selected holds, and render the returned outcome as
  received: overall status (confirmed / partially confirmed / failed), the booking
  reference when one exists, and per component either its supplier booking reference
  with sell price, or a distinct human-readable reason (hold expired / supplier
  rejected / hold no longer recognized / already consumed by another booking / item
  already booked).
- **FR-006**: Every typed business failure — per-item quote failures and per-component
  book failures — MUST map to a distinct human-readable message via pure mapping
  logic; transport and authorization failures (expired session, missing membership,
  plan not found, network) MUST likewise surface as human-readable messages. Raw
  error objects, payloads, or stack traces MUST never be user-visible.
- **FR-007**: Every money value displayed by the booking flow MUST be the exact
  platform-returned integer minor-unit value formatted for display with its currency.
  The page MUST perform no money arithmetic — no client-side sums, totals, markups,
  or conversions. The only numeric conversion permitted is the markup percent →
  integer basis points on input (FR-002).
- **FR-008**: After a failed or partially confirmed booking, the review state MUST
  remain visible with the failed components' reasons, and the agent MUST be able to
  re-quote the same plan; items already booked MUST be reported as such by the
  platform's own response, never inferred by the page.
- **FR-009**: Anonymous and traveler sessions MUST continue to receive the existing
  membership prompt on the workspace page with no booking controls rendered
  (INV-024); server-side authorization remains per procedure (INV-023) and is not
  modified.
- **FR-010**: The booking flow MUST render on the product's premium design system
  (the established theme kit), visually consistent with the planner surface — no
  unstyled controls or bare-HTML panels.

### Key Entities

- **Held quote (price hold)**: a firm, expiring price for one plan item — net rate,
  sell price at the agent's markup, currency, merchant of record, expiry. Created by
  the platform on quote; consumed by at most one booking. Not redefined by this
  feature.
- **Booking**: the platform's record of a book request — overall status and
  reference; owns components. Rendered, never modified, by this feature.
- **Booking component**: one booked plan item — supplier booking reference, net/sell
  prices — or its typed failure reason. Rendered as received.
- **Markup**: the agent's margin over net, expressed to the platform in integer basis
  points; the platform computes all resulting prices.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in agent can go from a rendered draft to a confirmed booking —
  markup set, quotes held, booking confirmed on screen — in under 2 minutes on the
  local stack, in a single browser session, with no tooling beyond the browser.
- **SC-002**: 100% of quote and book outcomes (success and every typed failure)
  produce visible, human-readable feedback on the page; zero raw error payloads or
  stack traces are user-visible across the journey.
- **SC-003**: Every money value shown by the booking flow equals the value returned
  by the platform for that field (exact minor-unit equality after parsing the
  displayed value); zero client-side money recomputation anywhere in the flow.
- **SC-004**: Zero booking controls render for anonymous or traveler sessions; the
  existing membership prompt renders for them unchanged.
- **SC-005**: The full journey — sign in, draft a trip, set markup, quote, book, see
  the confirmed booking — passes against the built stack in a real browser with
  evidence archived (INV-027).

## Assumptions

- The existing agent-gated quote and book procedures (`workspace.booking.quote`,
  `workspace.booking.book`, spec 005) are the complete backend contract for this
  feature; their input schemas, typed outcome values, authorization, and money
  semantics are reused as-is with zero server-side changes. The platform's quote
  response is the sole source of holdability; the book response is the sole source of
  booking state.
- The plan being quoted is the itinerary drafted in the same session on the same
  page (spec 008); its identifier travels from the draft response into the quote and
  book calls. Retrieving or re-loading previously persisted itineraries is out of
  scope (no such listing surface exists yet).
- The local/compose stack runs the deterministic sandbox supply engine (INV-019), so
  holds, prices, and confirmations in the live browser journey are reproducible with
  no external supplier account; hold lifetimes there are long enough to complete the
  journey.
- The markup default of 15% mirrors the platform's own default (1500 basis points);
  markup applies uniformly to the whole quote request (per-item markup is not offered
  by the backend contract and is out of scope).
- The client-facing share view (seed-0009c), marketplace listing of booked trips
  (seed-0009d), cancellation UI, and any booking history/listing surface are out of
  scope for this feature.
- Non-streaming quote/book submission is acceptable: both procedures are bounded
  single round-trips against the sandbox engine (no LLM tool loop), so the INV-028
  streaming deferral tracked by seed-0014 is not implicated by this UI.
