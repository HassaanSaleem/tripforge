# Feature Specification: Workspace AI Itinerary Planner UI

**Feature Branch**: `kitchen/fix-seed-0009a-planner-ui`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Workspace UI: AI itinerary planner — prompt to a rendered draft itinerary, wired to planner tRPC (ticket seed-0009a). Build apps/web/app/(workspace)/workspace into a real planner surface for authenticated agents: a trip-request form (destination, check-in/check-out dates, party size, trip style, budget amount+mode+currency) that calls the existing agent-gated workspace.itinerary.draft tRPC mutation and RENDERS the returned canonical itinerary (title, days, items with prices, per-category budget fit) in the browser. Replace the sign-in greeting stub with the actual planner experience for authenticated agents; anonymous/traveler visitors keep the membership prompt (INV-023/024 unchanged). Typed browser tRPC client over the existing /api/trpc mount (INV-018). Draft failures (infeasible budget, planner_failed) surface as human-readable messages, not raw errors. Live Test: a real browser journey plans a trip and sees the itinerary rendered. No changes to money paths, canonical itinerary schema, or supply adapters — UI + client wiring only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent drafts a trip plan from the workspace (Priority: P1)

A signed-in agent opens the agency workspace, describes a client trip — destination,
check-in/check-out dates, party size, optional trip style, and a total budget (hard cap
or target, with currency) — submits it, and sees the AI-drafted itinerary rendered on
the same screen: the trip title, a day-by-day breakdown of items with client-facing
prices, and a per-category budget-fit summary. This is the core Build-pillar experience
(Constitution II/III): describe a trip, get a budget-fit, live-priced, bookable draft.

**Why this priority**: This is the entire value of the ticket — the planner backend
(spec 005) has existed since seed-0005 but no human can reach it through a browser. It
is the enabler for the whole demo path (booking UI, client view, marketplace UI all
start from a rendered itinerary).

**Independent Test**: Boot the built stack, sign in as an agent, fill the trip form,
submit, and observe a rendered itinerary with days, priced items, and a budget summary —
no API tooling required.

**Acceptance Scenarios**:

1. **Given** a signed-in agent on the workspace page, **When** they fill destination,
   valid dates, party of 2 adults, and a budget and submit, **Then** the page shows a
   drafting/pending indicator and, on completion, renders the itinerary title, every day
   with its items (each showing kind, name, and client-facing price), and the total.
2. **Given** a rendered draft, **When** the agent reads the budget summary, **Then**
   each budget category shows its allocated amount, its planned spend, and whether it
   fits, is under-filled, or is over target — in the trip currency.
3. **Given** a draft in progress, **When** the agent tries to submit again, **Then**
   the form refuses duplicate submission until the current draft resolves.

---

### User Story 2 - Clear feedback when a draft cannot be produced (Priority: P2)

When the planner cannot produce a plan — the budget is below the flights reserve, the
date range yields no plannable days, or the AI planner fails to return usable
proposals — the agent sees a plain-language explanation and can adjust the form and
retry. No raw error payloads, stack traces, or silent failures.

**Why this priority**: The planner has typed business-failure outcomes; surfacing them
as human guidance is what makes the tool usable by a working agent (Constitution II:
agent experience is the wedge). Ships with US1 but is independently testable.

**Independent Test**: Submit a trip whose budget is far too small for any bookable
option and observe a human-readable message with the form still editable.

**Acceptance Scenarios**:

1. **Given** the form filled with a budget far too small for any bookable option
   (e.g. 1 EUR), **When** the agent submits, **Then** a message explains that no
   bookable options fit this trip and budget and invites adjusting budget, dates,
   or destination — and the form keeps its values. (The budget-below-reserve
   variant maps to its own message but is only reachable once a UI collects an
   explicit flights reserve — out of scope here; the mapping still covers it.)
2. **Given** the planner returns no usable proposals, **When** the draft resolves,
   **Then** the agent sees a plain-language "could not assemble a plan" message with a
   retry path, never a raw error object.
3. **Given** the agent's session has expired or lost its agency context, **When** they
   submit, **Then** the page shows a human-readable sign-in/membership message rather
   than a raw authorization error.

---

### User Story 3 - Non-agents keep the membership prompt (Priority: P3)

Anonymous visitors and travelers (signed-in users without an agency membership) who
open the workspace page continue to see the existing membership prompt with sign-in /
sign-up paths. The planner form never renders for them.

**Why this priority**: Guardrail story — it must not regress, but it is existing
behavior. Data authorization stays enforced per procedure on the server (INV-023);
the page gate is UX only (INV-024).

**Independent Test**: Open the workspace page without a session and verify the
membership prompt appears and no planner form is present.

**Acceptance Scenarios**:

1. **Given** no session, **When** a visitor opens the workspace page, **Then** they see
   the membership prompt (sign-in / sign-up) and no trip form.
2. **Given** a traveler session (no agency membership), **When** they open the
   workspace page, **Then** they see the membership prompt and no trip form.

---

### Edge Cases

- Check-out date on or before check-in date: the form refuses submission with an
  inline message before any server call (the server contract independently enforces
  the same rule).
- Zero or negative budget amount: refused client-side with an inline message; the
  server contract independently rejects it.
- A drafted itinerary may legitimately contain a day with zero items (an unplanned
  day) — the rendering shows the day with an explicit "no items planned" note rather
  than collapsing or erroring.
- Network failure mid-draft: a human-readable "could not reach the server" message;
  the form stays editable and resubmittable.
- Long-running draft: the pending indicator persists until the call resolves; the
  submit control stays disabled throughout (no duplicate drafts).
- Currency display: all money is shown with its currency code; amounts are whole
  minor-unit values formatted for display — the page never re-computes or rounds
  money beyond formatting the exact values the platform returned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workspace page MUST present a verified agent with a trip-request
  form collecting: destination (required text), check-in and check-out dates
  (required), adults (required, minimum 1) and children (optional, default 0),
  trip style (optional choice of balanced / budget / premium), budget amount
  (required, positive), budget mode (hard cap or target), and currency (3-letter
  code, defaulting to EUR).
- **FR-002**: Submitting the form MUST invoke the platform's existing agent-gated
  draft procedure through the platform's single client API surface (INV-018), carrying
  the browser session's credentials. No new server procedure, and no change to any
  existing procedure's contract or authorization (INV-023), is permitted.
- **FR-003**: While a draft is in flight the page MUST show a pending indicator and
  refuse duplicate submission until the call resolves.
- **FR-004**: On a successful draft the page MUST render the returned canonical
  itinerary exactly as received: title; each day (number, date when present) with its
  items — each item showing its kind, name, and client-facing sell price — a per-day
  subtotal when present, an explicit empty-day note for days without items, and the
  trip total with budget mode.
- **FR-005**: On a successful draft the page MUST render the budget-fit summary: for
  each budget category, the allocated amount, the planned spend, and its state
  (fits / under-filled / over target), all in the trip currency.
- **FR-006**: Each typed business failure MUST map to a distinct human-readable
  message: budget below the flights reserve → explain and suggest adjusting the
  budget/reserve; no plannable days → explain the date range; planner
  failure (malformed output or no usable proposals) → explain that no plan could be
  assembled and invite retry. The form and its values MUST survive every failure.
- **FR-007**: Transport and authorization errors (expired session, missing agency
  membership, network failure) MUST surface as human-readable messages — never raw
  error objects, JSON payloads, or stack traces.
- **FR-008**: Anonymous and traveler sessions MUST continue to receive the existing
  membership prompt on the workspace page, with the planner form absent (INV-024).
  Server-side authorization remains per procedure (INV-023) and is not modified.
- **FR-009**: The budget MUST be entered in major currency units (e.g. 2500 = EUR
  2,500.00) and transmitted as exact integer minor units; every displayed money value
  MUST be the platform-returned integer minor-unit value formatted for display with
  its currency — the page performs no money arithmetic beyond display formatting.
- **FR-010**: The rendered draft MUST remain on screen for the agent to review (the
  agent stays the author of record, INV-016); the page does not navigate away or
  auto-commit anything after drafting. Sign-out and the human-name greeting from the
  existing workspace surface remain available.
- **FR-011** *(added in the Live Test & Fix cycle — INV-027 defect fixed in the same
  cycle)*: A draft proposal whose offer genuinely came from the supply ports during
  the draft's own tool loop MUST survive verification: the platform derives the
  tool-lookup criteria and the verification-sweep criteria from ONE canonical
  mapping of the trip request, so lexical drift in model-phrased criteria can never
  drop tool-returned proposals (the witnessed "empty itinerary" live defect).
  Verification truth is unchanged — proposals referencing offers NOT returned by
  the canonical sweep (hallucinated ids) are still dropped (spec 005 FR-003), and
  persisted supply refs stay canonical so the quote flow's fresh-process hold
  re-establishment (INV-028) keeps working.

### Key Entities

- **Trip request**: what the agent describes — destination, date range, party, trip
  style, budget (amount, mode, currency). Matches the existing planner contract; not
  redefined by this feature.
- **Draft itinerary (canonical schema)**: the platform's core entity as returned by
  the draft procedure — title, days, items (stay / activity / transfer) with pricing,
  total. Rendered, never modified, extended, or re-computed by this feature.
- **Budget-fit summary**: per-category allocation vs planned spend with a fit state,
  returned alongside the draft; rendered as received.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in agent can go from an empty trip form to a rendered draft
  itinerary in under 2 minutes on the local stack, in a single browser session,
  without any tooling beyond the browser.
- **SC-002**: 100% of draft outcomes (success and every typed failure) produce
  visible, human-readable feedback on the page; zero raw error payloads or stack
  traces are user-visible across the journey.
- **SC-003**: Zero occurrences of the planner form for anonymous or traveler
  sessions; the existing membership prompt renders for them unchanged.
- **SC-004**: Every money value shown on the drafted plan equals the value returned
  by the platform for that field (exact minor-unit equality after parsing the
  displayed value); zero client-side money recomputation.
- **SC-005**: The full journey — sign in, describe a trip, see the rendered draft —
  passes against the built stack in a real browser with evidence archived
  (INV-027).

## Assumptions

- The existing agent-gated draft procedure (`workspace.itinerary.draft`, spec 005) is
  the complete backend contract for this feature; its input schema, outcome types,
  and authorization are reused as-is with zero server-side changes.
- The local/compose stack runs a deterministic planner fake by default (INV-019), so
  the live browser journey is reproducible with no API key; when a key is configured
  the same UI drives the real model unchanged.
- Non-streaming draft submission is acceptable at P0: the streaming requirement for
  live-LLM handlers (INV-028) is already tracked as a recorded deferral by ticket
  seed-0014 and is not expanded by this UI (which adds no new server handler).
- ~~Presentation matches the existing minimal workspace styling (system font, inline
  layout); a design system is out of scope at P0.~~ **Superseded (2026-07-09)**: the
  operator landed the product theme + premium bar (seed-0009s, `apps/web/app/globals.css`
  `.tf-*` kit) after this spec was drafted — this surface MUST render on that kit to
  the premium bar (research D11). Behavior contracts (§2.1 selectors, FR-001–FR-010)
  are unchanged.
- Persisted-draft retrieval/listing beyond the just-drafted response, editing the
  draft, quoting/booking (seed-0009b), the client view (seed-0009c), and marketplace
  UI (seed-0009d) are out of scope for this feature.
