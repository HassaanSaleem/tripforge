# Feature Specification: Client-View UI — Shared Itinerary with Agency White-Label Branding

**Feature Branch**: `kitchen/fix-seed-0009c-client-view-ui`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Client-view UI: render a shared itinerary with agency white-label branding (seed-0009c). Build the (client-view)/view page into a real read-only itinerary view (INV-020: agency brand only, no platform branding), rendering a booked/quoted itinerary for a shared link. An agent shares an itinerary from the workspace (generating an unguessable share link); a traveler opens the link anonymously and sees the trip day-by-day with the agency's branding, item sell prices only (never net rates, markup, or internal budget allocation — agent-confidential), and booked-status per item. Live Test: open a shared itinerary view in a real browser. Uses the seed-0009s product design system / UI kit — polished components, not bare HTML."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Traveler opens a shared itinerary link (Priority: P1)

A traveler receives a link from their travel agent (by email, chat, or any channel the
agent chooses). Opening the link in any browser — with no account, no sign-in, and no
prior relationship with the platform — shows their trip as a polished, read-only
day-by-day itinerary presented under the **agent's agency brand**. They see each day's
items (stays, activities, transfers) with titles, dates and the **price they would pay**
(sell price) per item, plus a trip total. Nothing on the page — heading, body, browser
tab title, or page metadata — names the platform. Nothing on the page reveals what the
agency paid (net rates), the agency's margin (markup), or the agency's internal budget
planning.

**Why this priority**: This is the product's client-facing output — Constitution II
makes white-label presentation a first-class requirement ("the client-facing output MUST
always look like the agent's brand, never TripForge's"). Without this story there is no
client view at all; every other story only feeds it.

**Independent Test**: Seed an itinerary and a share link directly, open the link in a
fresh browser session (no cookies), and verify the rendered page: agency name present,
platform name absent everywhere (including the tab title), items with sell prices,
and no net rate / markup / budget-allocation values anywhere in the page or in the data
the browser received.

**Acceptance Scenarios**:

1. **Given** an itinerary with priced items and a valid share link, **When** an
   anonymous visitor opens the link, **Then** the page renders the itinerary title,
   the owning agency's name, every day in order, and each item's title, kind, and sell
   price — with no sign-in required.
2. **Given** the same page, **When** the visitor inspects the browser tab title, page
   body, and everything the browser received for that page, **Then** the platform name
   appears nowhere and no net rate, markup, or internal budget-allocation value is
   present in any form.
3. **Given** a share link whose token does not exist, **When** a visitor opens it,
   **Then** a friendly "this trip link isn't available" state renders — revealing
   nothing about whether any itinerary exists — and no error is surfaced.
4. **Given** an itinerary with an unpriced item (no pricing snapshot yet), **When** the
   link is opened, **Then** the item renders with its title and kind and simply shows
   no price, and the trip total reflects only priced items.

---

### User Story 2 - Agent shares an itinerary from the workspace (Priority: P2)

After drafting (and optionally booking) an itinerary in the workspace, the agent clicks
"Share with client". The workspace produces a share link — an unguessable URL — and
shows it to the agent ready to copy. Sharing the same itinerary again returns the same
link (one durable link per itinerary), so the agent can always recover the URL they
already sent to a client.

**Why this priority**: The link must come from somewhere, but the client view itself
(US1) can be tested with a seeded link. This story completes the end-to-end demo path:
plan → book → share → client sees it.

**Independent Test**: Sign in as an agent, draft an itinerary, click share, and verify
a URL is displayed; request share again for the same itinerary and verify the same URL
comes back. Verify a non-agent caller cannot create a share link.

**Acceptance Scenarios**:

1. **Given** a signed-in agent with a drafted itinerary, **When** they choose "Share
   with client", **Then** they receive a full shareable URL containing an unguessable
   token, displayed with a copy affordance.
2. **Given** the agent shares the same itinerary a second time, **Then** the same link
   is returned (no duplicate links accumulate).
3. **Given** an anonymous caller or a signed-in user with no agency membership,
   **When** they attempt to create a share link, **Then** the attempt is refused with
   the platform's standard unauthorized/forbidden behavior.
4. **Given** an agent of agency A, **When** they attempt to share an itinerary owned by
   agency B, **Then** the attempt is refused exactly as if the itinerary did not exist
   (no cross-tenant existence oracle).

---

### User Story 3 - Booked items are visibly confirmed (Priority: P3)

Where the agent has already booked items of the shared itinerary, the traveler sees
those items marked as confirmed ("Booked") so the client view reflects the real state
of the trip — a booked/quoted itinerary, not just a proposal.

**Why this priority**: Valuable trust signal ("my agent actually secured this"), but
the client view is already useful as a proposal without it.

**Independent Test**: Book one item of a shared itinerary through the existing booking
flow, reload the share link, and verify exactly that item carries a confirmed mark.

**Acceptance Scenarios**:

1. **Given** a shared itinerary where one item has a confirmed booking, **When** the
   link is opened, **Then** that item displays a "Booked" confirmation mark and other
   items do not.
2. **Given** a shared itinerary with no bookings, **When** the link is opened, **Then**
   no item shows a booked mark and the page renders normally as a proposal.

---

### Edge Cases

- **Empty or partially planned trips**: an itinerary with zero days, or days with zero
  items, renders gracefully (an "unplanned day" reads as such; nothing errors).
- **Unpriced items**: items without a pricing snapshot show no price; the trip total
  counts only priced items (US1/AS4).
- **Deleted itinerary**: a link whose itinerary no longer exists behaves exactly like
  an unknown token (friendly unavailable state).
- **Signed-in visitor**: a visitor who happens to hold an agent or traveler session
  sees the same white-label client view — no workspace affordances appear on the
  client surface, regardless of session (INV-024).
- **Link secrecy**: anyone holding the link can view the trip (link-bearer access, like
  a private calendar link). Agents are choosing to share; no additional traveler
  authentication is required at this phase.
  > **Amended by spec 030 (2026-07-15, p2-consumer-accounts-identity):** "not required" is
  > superseded by "not required, but now optionally available" — a traveler may sign in for
  > form pre-fill convenience; link-bearer access remains the sole and sufficient grant for
  > viewing.
- **Concurrent share requests**: two simultaneous "share" actions for the same
  itinerary must still result in exactly one durable link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An agent MUST be able to create a share link for an itinerary owned by
  their own agency. The action is restricted to verified agents; anonymous callers are
  refused as unauthorized and non-agent users as forbidden.
- **FR-002**: A share attempt against an itinerary the agent's agency does not own
  MUST be refused identically to a nonexistent itinerary (no cross-tenant existence
  oracle).
- **FR-003**: Share links MUST be unguessable: the token space must be large enough
  that enumeration is computationally infeasible (at least 120 bits of randomness),
  and unknown tokens MUST resolve to a neutral unavailable state that reveals nothing.
- **FR-004**: Sharing the same itinerary repeatedly MUST converge on one durable link
  per itinerary (the existing link is returned, including under concurrent requests).
- **FR-005**: Opening a valid share link MUST render the itinerary read-only to an
  anonymous visitor with no authentication of any kind.
  > **Amended by spec 030 (2026-07-15, p2-consumer-accounts-identity):** authentication on
  > this route group becomes *optional*, not *required* — a traveler MAY sign in, but every
  > word of this requirement continues to hold exactly as written for a visitor with no
  > session. No anonymous visitor is ever asked to sign in, and rendering never depends on
  > session state.
- **FR-006**: The client view MUST present the owning agency's brand (at minimum the
  agency name, in the page and in the browser tab title) and MUST NOT present platform
  branding anywhere: page body, tab title, or page metadata (INV-020).
- **FR-007**: The client view MUST NOT contain agent-confidential values in any form —
  not rendered, and not present in the data delivered to the visitor's browser. Agent-
  confidential values are: supplier net rates, markup (as amount or rate), internal
  budget-allocation breakdowns (category allocations/spend, budget mode, stated budget
  total), the trip-request context, and supplier reference identifiers. The projection
  served to the client surface is redacted server-side.
- **FR-008**: The client view MUST show, per item: title, kind, day placement, item
  schedule facts already in the itinerary (dates/times/route as applicable), and the
  item's sell price where a pricing snapshot exists. It MUST show a trip total equal to
  the sum of the shown item sell prices, computed server-side (no client-side money
  arithmetic beyond display formatting).
  > **Amended by spec 013 (2026-07-11, seed-0025):** for an item covered by a confirmed
  > booking, the shown sell price is the booked client price from the booking record
  > (read-time projection), never the document's stored draft price; the trip total
  > folds booked prices with un-booked stored estimates and remains the sum of exactly
  > the values shown. The view distinguishes confirmed (booked) prices from estimates.
- **FR-009**: Items covered by a confirmed booking MUST carry a visible confirmed
  ("Booked") mark; unbooked items carry none.
- **FR-010**: The client surface MUST NOT expose workspace affordances (sign-in,
  workspace links, agent controls) to any visitor, signed-in or not (INV-024).
- **FR-011**: The client view MUST render the canonical itinerary content without
  modifying the stored document (read-only projection; Constitution IV).
- **FR-012**: The client view MUST render polished, on-design presentation consistent
  with the product design system, while remaining white-labeled (the platform's visual
  kit may style the page, but no platform naming/branding may appear).

### Key Entities

- **Share link**: a durable, unguessable grant of read access to one itinerary's
  client view. Attributes: token (the secret), the itinerary it exposes, the owning
  agency, creation time. One durable link per itinerary.
- **Client itinerary view (redacted projection)**: what the traveler is served — trip
  title, agency display name, ordered days with items (title, kind, schedule facts,
  sell price), per-item booked marks, and a server-computed trip total. Excludes every
  agent-confidential value listed in FR-007.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A traveler holding only the link reaches a fully rendered trip page in
  one navigation, with zero sign-in steps, in under 5 seconds on the demo stack.
- **SC-002**: Platform branding occurrences on the client surface: **zero** — across
  page body, tab title, and metadata, verified by automated negative checks.
- **SC-003**: Agent-confidential values (net rates, markup amounts/rates, budget
  allocations, stated budget totals, trip-request context, supplier references)
  delivered to the visitor's browser: **zero**, verified against the full payload the
  browser receives, not just the rendered pixels.
- **SC-004**: 100% of cross-tenant share attempts and unknown-token views resolve to
  refusal/unavailable states that reveal nothing about other agencies' data.
- **SC-005**: A booked item is distinguishable from an unbooked item on the client
  view at a glance (visible confirmed mark), verified in a real browser.
- **SC-006**: Re-sharing an itinerary N times yields exactly 1 share link (including
  under concurrent attempts).

## Assumptions

- **Link-bearer access is acceptable at this phase**: possession of the link grants
  read access to that one itinerary's client view (same trust model as private
  calendar/document links). Traveler accounts, passwords, or per-viewer identity are
  out of scope.
  > **Amended by spec 030 (2026-07-15, p2-consumer-accounts-identity):** traveler accounts
  > and per-viewer identity are no longer out of scope — they exist as an *optional* layer on
  > top of this trust model, not a replacement for it. Link-bearer access remains the sole
  > read grant; an account only adds convenience (request-form pre-fill), never a new
  > authorization requirement. See `specs/030-traveler-client-accounts/spec.md`.
- **Revocation and expiry are deferred**: links do not expire and cannot yet be revoked
  from the workspace. The share-link model must not preclude adding revocation later,
  but no revocation surface ships in this feature. (Follow-up candidate ticket.)
- **Agency brand = agency name at this phase**: richer brand assets (logo upload,
  colors) are a later feature; the agency's human-readable name is the brand carrier
  today, in body and tab title.
- **Booked marks derive from confirmed booking records only**: quote/hold states are
  agent-workspace concepts (holds expire in minutes) and are not shown to travelers.
- **The existing public client-view landing (no token) keeps its current neutral
  behavior**: it remains a white-labeled placeholder and continues to satisfy the
  existing trust-boundary checks; this feature adds the tokenized view alongside it.
- **One durable link per itinerary** (rather than many revocable links) is the right
  granularity for the P0 demo path and matches "agent sends the client one URL".
- **Prices shown are the itinerary's stored sell prices**: the client view reflects
  what the agent's document says today; it does not re-quote live inventory.
  > **Amended by spec 013 (2026-07-11, seed-0025):** this bullet was written for the
  > un-booked case and is now scoped to it. Items covered by a confirmed booking are
  > priced from the BOOKING RECORD (the realized client price recorded at booking:
  > net × markup), projected at read time — never the document's draft placeholder,
  > which equals the confidential net rate until a quote realizes markup. Un-booked
  > items keep the stored estimate, and the view still never re-quotes live
  > inventory. See `specs/013-booked-price-fidelity/spec.md` (storage decision).
