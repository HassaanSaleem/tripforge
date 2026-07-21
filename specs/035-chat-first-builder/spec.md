# Feature Specification: Chat-First, Multi-Turn Build-to-Book (Agent Surface)

**Feature Branch**: `kitchen/fix-goal-chat-first-builder-primary`

**Created**: 2026-07-22

**Status**: Draft

**Input**: Ticket `goal-chat-first-builder` (GOAL.md Deliverable 3). Promote the AI itinerary builder to a chat-first, multi-turn build-to-book flow on the agent/shared-engine surface. Today (spec 028) a chat-first entry exists but is single-shot — each message is interpreted independently with no memory, so the agent must cram destination+budget into one message, and the structured form is the visual primary. This feature makes the conversation the PRIMARY build path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a whole trip by chatting across turns, from empty to booking (Priority: P1)

An agent opens the AI Builder with nothing drafted. Instead of filling a form, they start a conversation: "Plan a trip to Lisbon." The assistant, missing a budget, asks for one. The agent replies "around EUR 2000 for 4 nights, 2 people." The assistant now has enough — it summarises the trip it understood and offers a clear "Build my trip" action. Choosing it runs the SAME budget-fit, live-priced comparison the form produces (1–3 options); the agent picks one and proceeds into the existing review/book flow — never having touched the structured form.

**Why this priority**: This is the core of the operator ask (GOAL Deliverable 3) and the whole value of the feature: promoting chat from a single-shot form-filler to the primary conversational build path. Without cross-turn memory the conversation can never converge (each turn forgets the last), so the agent is forced back to the form — the exact gap this closes.

**Independent Test**: From the AI Builder's idle view, supply a destination in one message and a budget in a later message; verify the assistant accumulates both across turns, offers to proceed, and reaching "Build my trip" produces the compare view (1–3 live-priced options) identical in shape to the form path — with zero form fields filled.

**Acceptance Scenarios**:

1. **Given** the AI Builder idle view with no draft, **When** the agent sends a first message naming only a destination and a later message naming a budget (and optionally nights/party/style), **Then** the assistant accumulates the details across the turns and, once it has at least a destination and a budget, presents a confirmation summarising the resolved trip with a "Build my trip" action.
2. **Given** a resolved chat with the "Build my trip" action shown, **When** the agent triggers it, **Then** the SAME compare-then-choose pipeline (spec 019) appears with 1–3 live-priced options, and choosing one persists, books, shares, and supports post-draft refinement identically to the form path (spec 019 US2, spec 009, spec 020).
3. **Given** a multi-turn conversation that still lacks a destination or a budget, **When** the agent sends another message, **Then** the assistant asks for exactly the piece(s) still missing and does NOT attempt to draft.

---

### User Story 2 - Chat is the primary entry; the form is an option behind a toggle (Priority: P2)

An agent lands on the AI Builder. The conversation is the primary, front-and-centre way to start; the structured form is not gone but is offered as an alternative behind a clearly-labelled toggle ("Prefer a guided form?"). An agent who prefers the form switches to it in one click and back again. When the agent arrives from the Discover feed's "Plan this" action (which pre-seeds a destination), the builder opens directly in form mode with that destination pre-filled, preserving that hand-off.

**Why this priority**: "Primary build path" is a presentation promotion — chat leads, the form follows. It is the visible half of Deliverable 3, but it rides on US1's engine; without US1 the chat cannot build a trip, so this is P2.

**Independent Test**: Load the idle builder with no destination param → the chat entry is the primary surface and the form is not shown until the toggle is used; use the toggle to reveal the form and hide it again. Separately, load the builder via `?destination=...` → it opens in form mode with the destination pre-filled and every other field defaulted.

**Acceptance Scenarios**:

1. **Given** the idle builder loaded with no destination parameter, **When** it first renders, **Then** the chat entry is the primary surface and the structured form is not displayed until the agent chooses the "Prefer a guided form?" toggle.
2. **Given** the idle builder in chat mode, **When** the agent uses the toggle, **Then** the structured form is revealed (and a toggle back to chat is available), with the form behaving exactly as it does today.
3. **Given** the builder is opened with a pre-seeded destination (Discover "Plan this"), **When** it renders, **Then** it opens in form mode with the destination field pre-filled and all other fields at their defaults.

---

### User Story 3 - The form path is unchanged and keyless mode stays deterministic (Priority: P2)

An agent using the structured form gets exactly the behaviour they get today — fill the fields, draft, compare, choose, book — including that an infeasible budget yields one human-readable message with the form retained. In a keyless demo deployment (no live AI key), a multi-turn conversation still resolves deterministically: the same sequence of messages always yields the same interpreted trip.

**Why this priority**: The form must not regress (it is the trusted fallback and the subject of existing coverage), and the keyless demo must keep working (UAT and demos run keyless). Both are guarantees layered on top of US1/US2 rather than new journeys, hence P2.

**Independent Test**: Run the existing form-driven draft/compare/choose/book journey unchanged and verify identical outcomes; drive an infeasible budget and verify the single mapped message with the form retained. In keyless mode, send the same two-turn conversation twice and verify identical resolved parameters with zero network calls.

**Acceptance Scenarios**:

1. **Given** the structured form (reached via the toggle or a pre-seeded destination), **When** the agent fills it and drafts, **Then** the compare/choose/book/refine outcomes are identical to before this feature.
2. **Given** the form with an infeasible budget, **When** the agent drafts, **Then** one human-readable failure message is shown and the form (with its entered values) survives.
3. **Given** a keyless deployment, **When** the same multi-turn conversation is interpreted twice, **Then** the resolved destination/nights/party/budget/style are identical both times, with zero network calls.

---

### Edge Cases

- **A later turn contradicts an earlier one** (e.g. destination Lisbon, then "actually make it Porto"): the accumulated interpretation reflects the whole conversation deterministically; the resolved request is a function of the full transcript, and a subsequent "Build my trip" always drafts from the latest resolved understanding (never a stale earlier one).
- **The agent supplies everything in one message**: the single-shot case still resolves immediately and offers to proceed — multi-turn is additive, not required.
- **The conversation resolves, then the agent keeps typing before building**: further messages re-interpret the full transcript and update the confirmation summary; the "Build my trip" action always reflects the current resolved request.
- **The resolved request is infeasible once it reaches the pipeline** (budget below the flights reserve): the SAME infeasible/failure messaging the form path shows is used — no chat-specific error path — and the agent can keep chatting or switch to the form.
- **A message unrelated to trip planning** ("what's the weather"): the assistant explains it can start a trip given a destination and budget, and does not draft.
- **A draft or interpretation is already in flight when the agent submits again**: the busy-state guard the form/compare/select flow already uses applies — never two conflicting outcomes or a stuck indicator.
- **An anonymous visitor**: never sees the builder (chat or form) — the page gate and per-procedure authorization (INV-023/024) are unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The AI Builder MUST interpret a chat-first trip request across MULTIPLE conversational turns, accumulating the details supplied so far (destination, trip length/dates, party size, style, budget amount + currency) rather than interpreting each message in isolation.
- **FR-002**: When the accumulated conversation identifies at least a destination and a budget amount, the system MUST resolve any unstated parameters to the same defaults the structured form starts with and present a confirmation that summarises the resolved trip and offers an explicit action to proceed into the existing compare-then-choose pipeline.
- **FR-003**: When the accumulated conversation does not yet identify a destination, or does not yet identify a budget amount, the system MUST reply asking for exactly the missing piece(s) and MUST NOT attempt to draft.
- **FR-004**: Proceeding from a resolved chat MUST feed the resolved trip request into the EXISTING draft/compare/select/book pipeline (spec 019/009) unchanged — there is no chat-specific comparison, persistence, booking, or refinement path.
- **FR-005**: The chat entry MUST be the primary entry surface of the idle builder; the structured form MUST remain available as an option the agent can switch to (and back from) via a clearly-labelled toggle.
- **FR-006**: When the builder is opened with a pre-seeded destination (the Discover "Plan this" hand-off, `?destination=`), it MUST open in form mode with the destination pre-filled and all other fields at their defaults — the existing hand-off behaviour is preserved.
- **FR-007**: The structured form entry point MUST continue to function exactly as it does today, including surviving an infeasible-budget failure with the form and its entered values retained — this feature adds a chat-primary presentation, it does not modify the form's own behaviour.
- **FR-008**: Every price and inventory item in a chat-originated draft MUST come from the same live-verified supply pipeline the form-originated draft uses — never a value invented during chat interpretation. Resolved chat parameters are a request, not itinerary content; nothing the browser sends during interpretation is trusted and saved as-is.
- **FR-009**: In a deployment with no live AI capability configured (keyless demo mode), multi-turn interpretation MUST resolve deterministically — the same sequence of messages always yields the same resolved parameters, with zero network calls.
- **FR-010**: While a chat request is being interpreted, the system MUST show the agent it is working, rather than an unresponsive input, and MUST guard against overlapping in-flight interpretations/drafts (mirroring the existing busy-state guard).
- **FR-011**: The chat-first entry MUST only ever be reachable by, and only ever act on behalf of, the currently authenticated agent's own agency — a chat request MUST NOT draft or affect any other agency's data (INV-004/023/024).
- **FR-012**: This feature MUST NOT change the canonical itinerary schema, money math (markup/net-rate/take-rate/revenue-share), or the supply-adapter boundary; it is an interpretation-and-presentation change layered above the unchanged engine.

### Key Entities

- **Chat Conversation (transcript)**: The ordered sequence of the agent's own chat messages in the current, unstarted build. Interpreted as a whole into a resolved trip request or a clarifying reply. Session-scoped only — not persisted, not part of the canonical itinerary.
- **Resolved Trip Request** *(existing, reused)*: The same structured parameter set the form already produces and feeds into the compare-then-choose pipeline — unchanged in shape or meaning. Multi-turn accumulation produces this same entity; it does not introduce a new one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from the AI Builder idle view to comparing 1–3 live-priced options using ONLY a multi-turn chat (details supplied across ≥2 messages), with zero structured-form fields filled.
- **SC-002**: 100% of conversations still missing a destination or a budget receive a clarifying reply and leave the builder on its idle view — no draft is ever attempted from incomplete information.
- **SC-003**: The structured form's existing behaviour shows zero regressions after this feature ships (same inputs produce the same compare/select/draft/failure outcomes as before), and the Discover "Plan this" hand-off still lands on a pre-filled form.
- **SC-004**: The keyless/deterministic demo mode produces identical resolved parameters across repeated runs of the same multi-turn conversation, with zero network calls.

## Assumptions

- **Supersedes spec 028's single-shot assumption**: spec 028 deliberately made the chat-first entry single-shot (a follow-up after a clarifying reply was interpreted fresh). This feature supersedes that specific assumption for the chat-first entry — the conversation now accumulates. Spec 028's other guarantees (destination+budget are the two required pieces; keyless determinism; the form is untouched; resolved params feed the existing pipeline) are preserved.
- **Accumulation happens above the LLM boundary**: the natural-language→parameters mapping stays a single interpretation over the conversation text; "multi-turn" is realised by interpreting the accumulated transcript, keeping the keyless determinism guarantee simple (mirrors how trip dates are already resolved one layer above the LLM in spec 028).
- **Agent surface only**: the consumer/traveler surface is OUT OF SCOPE and deferred to the separate backlog ticket `goal-consumer-planner`. The traveler-facing draft/book path does not exist yet and is `agentProcedure`-gated (INV-024); building a traveler-scoped draft path is a distinct, money-path-adjacent feature that would carry its own operator decision (GOAL self-book v0 ruling).
- **"Destination" and "budget amount" remain the two essential pieces**; every other field has a workable default, mirroring which fields the form marks required.
- **Post-draft refinement is unchanged**: once a first draft exists (via chat or form), the existing post-draft chat panel (spec 020) already provides add/remove/hotel-swap; this feature covers reaching that first draft conversationally.
- Rides the existing canonical itinerary schema and the existing draft/selectDraft/booking procedures unchanged — no new persisted entity, no schema migration, no money-path change.
