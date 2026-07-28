# Feature Specification: Consumer Chat-First, Budget-Aware AI Trip Planner

**Feature Branch**: `kitchen/fix-goal-consumer-planner-chat`

**Created**: 2026-07-27

**Status**: Draft

**Input**: Ticket `goal-consumer-planner` (GOAL.md Deliverable 2.3). Offer the SAME
budget-aware planning engine the agents use (Constitution III), self-serve on the
CONSUMER surface: a signed-in traveler describes their trip + budget in a chat and the
AI assembles a live-priced, budget-fit itinerary. Chat-first (reuse the agent chat-first
builder path, spec 035 — do NOT fork the planner). Consumer output must stay
marketplace/agent-connected (Principle I — feed the marketplace, not a standalone
planner): the result offers a self-book-or-request-an-agent fork.

## Clarifications

### Session 2026-07-27

- **From-scratch consumer plans have no owning agency.** Persisting an agency-less
  itinerary, attributing markup on an agency-less booking, or introducing a platform
  take-rate would each require a canonical-itinerary-schema change and/or a
  client-ownership / revenue-share semantics decision — all operator ALWAYS-HALT
  (DIRECTIVE §2, GOAL.md operator ruling 2026-07-21). **Resolution for v0:** the
  live-priced plan the traveler compares is **never persisted** as a trip; the
  request-an-agent fork routes demand into the network via a **non-money lead record**
  (no payment/markup/revenue-share), mirroring how spec 022's request-agent handoff is
  explicitly "NOT a money path"; and full self-drive booking of a from-scratch plan is
  **deferred** (self-drive booking today runs on agent-prepared trips, spec 036).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A traveler plans a budget-fit trip by chatting, self-serve (Priority: P1)

A signed-in traveler on the consumer surface opens **Plan a trip** (from the persistent
nav or the home tile). Instead of a form, they start a conversation: "Plan a trip to
Lisbon." The assistant, missing a budget, asks for one. The traveler replies "around EUR
2000 for 4 nights, 2 people." The assistant now has enough — it summarises the trip it
understood and offers a clear "Build my trip" action. Choosing it runs the SAME
budget-fit, live-priced comparison the agent builder produces (1–3 options); the traveler
picks one and sees the concrete plan — the specific stays, activities, and transfers with
their prices and a per-category / per-day budget breakdown — priced against real
inventory, self-serve, without ever talking to an agent first.

**Why this priority**: This is the entire core of the operator ask (GOAL Deliverable 2.3)
and Constitution III offered self-serve: a traveler gets a live-priced, budget-fit AI plan
on the consumer surface with no agency membership. Everything else (the fork) is only
meaningful once a real, priced plan exists to act on.

**Independent Test**: Sign in as a traveler with no agency, open `/view/plan`, supply a
destination in one message and a budget in a later message, reach "Build my trip", and
verify a compare view of 1–3 live-priced options appears (each with a total and a
per-category breakdown), identical in engine to the agent path — with zero agency
membership and zero workspace/agent procedure calls.

**Acceptance Scenarios**:

1. **Given** a signed-in traveler (no agency) on the consumer planner idle view, **When**
   they send a first message naming only a destination and a later message naming a budget
   (and optionally nights/party/style), **Then** the assistant accumulates the details
   across turns and, once it has at least a destination and a budget, presents a
   confirmation summarising the resolved trip with a "Build my trip" action.
2. **Given** a resolved chat with the "Build my trip" action shown, **When** the traveler
   triggers it, **Then** 1–3 comparable, budget-fit, live-priced options appear, each with
   a trip total and a per-category / per-day breakdown, produced by the same allocator +
   supply-search + assembly engine the agent builder uses.
3. **Given** a multi-turn conversation that still lacks a destination or a budget, **When**
   the traveler sends another message, **Then** the assistant asks for exactly the piece(s)
   still missing and does NOT attempt to draft.
4. **Given** the compare view, **When** the traveler inspects any option, **Then** only
   **sell prices** are shown — never a net rate, markup, supplier id, or
   merchant-of-record detail (INV-020).

---

### User Story 2 - The plan offers a self-book-or-request-an-agent fork (Priority: P1)

Having compared options and picked one, the traveler sees a clear fork on the chosen plan:
**"Have an agent arrange & book this for me"** and **"Book it myself."** Choosing the
agent path captures their contact details and a note and hands the planned trip to the
agent network as a durable request — routing consumer demand into the marketplace
(Principle I). Choosing "Book it myself" explains honestly that self-drive booking runs
today on agent-prepared trips and points them to the agent path to enable it (it does not
pretend to book a from-scratch plan).

**Why this priority**: The fork is what keeps the consumer surface feeding the marketplace
rather than becoming a standalone planner (the PRD non-goal). Without a durable
request-an-agent outcome, the planner is a dead-end demo; this is the Principle-I funnel
and is co-P1 with US1.

**Independent Test**: From a chosen live-priced option, choose "Have an agent arrange &
book this for me", submit a name and a note, and verify a durable consumer plan request
record now exists carrying the trip criteria and the chosen option's sell-price summary;
separately, choose "Book it myself" and verify it shows an honest self-drive explanation
(no booking is attempted, no money moves).

**Acceptance Scenarios**:

1. **Given** a chosen live-priced option, **When** the traveler selects "Have an agent
   arrange & book this for me" and submits a contact name (email + note optional), **Then**
   a consumer plan request is created (`status = new`) carrying the destination, dates,
   party, budget, and the chosen option's title + total sell price, and the traveler sees a
   confirmation.
2. **Given** the request form, **When** the traveler submits without a name, **Then** the
   submission is rejected with a validation message (a name is required so an agent has
   someone to contact); no record is created.
3. **Given** a chosen option, **When** the traveler selects "Book it myself", **Then** the
   surface honestly explains self-drive booking runs on agent-prepared trips today and
   offers the request-an-agent path — no booking is fired, no `booking` / `markup_ledger`
   row is written, no money moves.
4. **Given** the created consumer plan request, **When** it is stored, **Then** it holds no
   net rate, markup, or revenue-share field — it is a lead, not a money-path record.

---

### User Story 3 - The consumer surface exposes the planner as a first-class destination (Priority: P2)

A signed-in traveler finds "Plan a trip (AI)" as a live entry in the persistent consumer
navigation (spec 037) and as a live tile on the `/view` home (spec 033) — both currently
honest "coming soon" signposts. Following either lands on the planner.

**Why this priority**: Discoverability turns the built engine into a usable product
surface, but it rides on US1 (there must be a planner to link to). It is a one-line flip
of two existing signposts, so P2.

**Independent Test**: Sign in as a fresh traveler, land on `/view`, and confirm the nav
"Plan a trip" entry and the home "Plan a trip" tile are live links to the planner (not
"coming soon"), reachable without typing a URL.

**Acceptance Scenarios**:

1. **Given** a signed-in traveler on `/view`, **When** the page renders, **Then** the
   persistent nav shows "Plan a trip" as a live link (no "Soon" badge) pointing to the
   planner, and the home "Plan a trip" tile is an active link rather than a disabled
   coming-soon card.
2. **Given** an anonymous visitor, **When** they hit the planner route directly, **Then**
   they are sent to traveler sign-in and returned to the planner after authenticating
   (the planner is signed-in-only, INV-023).

---

### Edge Cases

- **Traveler tries to reach the agent draft engine directly.** A traveler session invoking
  any `workspace.*` / agent-gated procedure MUST be refused (FORBIDDEN) — the planner only
  uses traveler-facing procedures (INV-024). Test the negative.
- **Budget is infeasible for the destination/dates.** The compare step returns a typed
  "budget doesn't fit" outcome with guidance to adjust budget or trip length — never a
  crash, never an empty silent result.
- **Chat produces malformed / uninterpretable input.** The assistant asks again for the
  missing piece; it never drafts on unresolved input.
- **The keyless (no API key) path.** With no `ANTHROPIC_API_KEY`, the deterministic FakeLLM
  interpreter still resolves destination + budget and drafts options, so the flow is fully
  testable credit-free.
- **Anonymous access to the planner or the request procedure.** Rejected as UNAUTHORIZED,
  identical to the other signed-in traveler procedures (spec 036 `selfBook`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A signed-in traveler (a Better Auth user with no agency membership) MUST be
  able to reach a consumer planner surface and, through a multi-turn chat, have their
  destination + budget (and optional nights/party/style) accumulated into a trip request —
  reusing the SAME interpretation service as the agent chat-first builder (spec 035), not a
  forked one.
- **FR-002**: Once the chat resolves at least a destination and a budget, the surface MUST
  offer a "Build my trip" action; until then it MUST ask for exactly the missing piece(s)
  and MUST NOT draft.
- **FR-003**: "Build my trip" MUST produce 1–3 comparable, budget-fit, **live-priced**
  itinerary options via the SAME allocator + supply-search + assembly engine the agent
  builder uses (`draftOptions`), each with a trip total and a per-category / per-day
  budget breakdown.
- **FR-004**: The compared options and the chosen plan MUST show **sell prices only** — no
  net rate, markup basis points, supplier ids, or merchant-of-record details ever cross to
  the traveler (INV-020).
- **FR-005**: The live-priced plan the traveler compares MUST NOT be persisted as an
  agency-owned itinerary and MUST NOT write any `booking`, `markup_ledger`, or
  `trip_created` record — it is a transient, self-serve preview (no canonical-schema
  change, no money-path write).
- **FR-006**: All planner interactions MUST run over **traveler-facing procedures** (the
  `clientView` router, `protectedProcedure`) and MUST NOT invoke any agent/workspace
  procedure; a traveler session hitting an agent-gated procedure MUST be refused
  (INV-024/INV-023).
- **FR-007**: On a chosen option, the surface MUST present a fork with two clearly labelled
  choices: "Have an agent arrange & book this for me" and "Book it myself."
- **FR-008**: Choosing "Have an agent arrange & book this for me" with a contact name MUST
  create a durable **consumer plan request** carrying the destination, dates, party,
  budget, and the chosen option's title + total sell price, plus the traveler's contact
  name (email + note optional), at `status = new`; the traveler MUST see a confirmation.
- **FR-009**: A consumer plan request submitted without a contact name MUST be rejected
  with a validation message and MUST NOT create a record.
- **FR-010**: The consumer plan request MUST be a **non-money-path** record — it MUST NOT
  store or derive any net rate, markup, take-rate, or revenue-share value, and creating one
  MUST NOT move money or touch booking inventory (mirrors spec 022's classification).
- **FR-011**: Choosing "Book it myself" for a from-scratch plan MUST honestly state that
  self-drive booking runs on agent-prepared trips today (spec 036) and route the traveler
  to the request-an-agent path — it MUST NOT fire a booking or imply a completed purchase.
- **FR-012**: The consumer navigation "Plan a trip" entry (spec 037) and the `/view` home
  "Plan a trip" tile (spec 033) MUST become live links to the planner (no "coming soon").
- **FR-013**: The planner route MUST be signed-in-only: an anonymous visitor MUST be
  redirected to traveler sign-in and returned to the planner after authenticating; the
  planner/request procedures MUST reject an anonymous caller as UNAUTHORIZED.
- **FR-014**: The whole flow MUST work with the deterministic keyless FakeLLM interpreter
  (no `ANTHROPIC_API_KEY`) so it is testable credit-free.

### Deferred (out of scope for v0 — follow-up tickets)

- **D-1 (agent-facing lead inbox)**: the agent side that lists/claims consumer plan
  requests across the network is deferred, mirroring spec 022's P1 traveler-submit / P2
  agent-inbox split. This v0 delivers only the traveler-facing submission + durable record.
  → follow-up ticket.
- **D-2 (full consumer self-drive booking of a from-scratch plan)**: deferred — it requires
  traveler-owned bookings and/or a platform take-rate, i.e. an operator canonical-schema +
  revenue-share decision (ALWAYS-HALT; GOAL.md ruling 2026-07-21). Self-drive booking today
  remains on agent-prepared trips (spec 036). → operator decision + follow-up ticket.
- **D-3 (trip advisories)**: altitude / terrain / security advisories (GOAL 2.4) are a
  nice-to-have and deferred unless trivially derivable. → follow-up ticket.

### Key Entities *(include if feature involves data)*

- **Consumer plan request**: a durable, agency-less lead created when a traveler asks an
  agent to arrange their self-planned trip. Attributes: the requesting traveler (user id),
  a snapshot of the trip criteria (destination, check-in/out or nights, party, budget), the
  chosen option's title + total **sell** price (no net/markup), an optional contact
  email + note, and a status (`new`). It is NOT the canonical itinerary and NOT a
  money-path record.
- **Trip request (planner criteria)**: the existing internal `TripRequest` shape
  (destination, dates, party, budget, style) that the chat interpreter resolves and the
  draft engine consumes — reused unchanged.
- **Draft option (transient)**: an in-memory, live-priced canonical `Itinerary` variant
  produced by the shared engine for comparison only — never persisted for a consumer plan;
  redacted to sell-price-only before display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in traveler with no agency membership can go from an empty chat to a
  compared, live-priced, budget-fit plan in at most 3 chat turns and one "Build my trip"
  action, with every displayed price being a sell price.
- **SC-002**: 100% of compared/chosen options display a per-category and per-day budget
  breakdown and a trip total, and 0% expose a net rate, markup, or supplier id.
- **SC-003**: Choosing "Have an agent arrange & book this for me" with a name creates
  exactly one durable request that an agent-side query can later read; choosing it without a
  name creates zero records and shows a validation message.
- **SC-004**: A traveler session is mechanically blocked from every agent draft/workspace
  procedure (the negative test passes), and no consumer planner action writes a `booking`,
  `markup_ledger`, `trip_created`, or itinerary row.
- **SC-005**: The entire journey passes end-to-end against the built compose image with the
  keyless FakeLLM interpreter (no API key), verified live in a browser.

## Assumptions

- Traveler accounts (spec 030), the traveler home `/view` (spec 033), the persistent
  consumer nav (spec 037), and the traveler self-book money path (spec 036) already exist on
  the campaign branch and are reused; the planner lights up the two "coming soon" signposts
  those specs left.
- The agent chat-first build engine (`interpretChatTripRequest`, `draftOptions`, the shared
  `plannerCore`) is entry-agnostic and reusable behind a traveler-facing procedure; only the
  procedure gating and the persistence/ownership steps differ for the consumer path.
- The canonical itinerary schema is unchanged; a new operational `consumer_plan_request`
  table is a normal feature migration (like spec 022's `trip_handoff_request`), not a
  canonical-itinerary-schema change and not a money path.
- Sandbox supply adapters + the deterministic FakeLLM provide live pricing credit-free in
  tests and in the compose stack (INV-019).
- The transient compare itinerary satisfies the canonical schema's required `agencyId` field
  with an ephemeral, never-persisted value; it is redacted before display and never written.
