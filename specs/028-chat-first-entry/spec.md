# Feature Specification: Chat-First AI Itinerary Entry

**Feature Branch**: `kitchen/fix-ai-builder-chat-first-entry`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "OPERATOR (verbatim): 'AI builder should provide chat interface. For agent to add through chat.' The conversational chat already exists on the AI Builder, but only as POST-DRAFT refinement (spec 020) — there is no CHAT-FIRST path to kick off the FIRST draft. Add a chat-first entry point alongside the existing structured form: the agent types a natural-language trip request; the system interprets it into the same trip-request parameters the form produces and feeds the EXISTING compare-then-choose pipeline (spec 019). The structured form remains untouched. Missing required info (destination or budget) gets a clarifying reply, no draft attempted. Must work keyless/deterministic (FakeLLM)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a trip by chatting instead of filling the form (Priority: P1)

An agent opens the AI Builder with no trip drafted yet. Instead of filling in the destination/dates/budget form, they type a plain-language request into a chat box, e.g. "Plan 4 days in Lisbon for 2, around EUR 2000, boutique stay." The assistant interprets the request and the SAME budget-fit, live-priced comparison view the form would have produced (1-3 options) appears — the agent then picks one exactly as they would have from the form.

**Why this priority**: This is the operator's explicit ask and the entire value of the feature — without a chat-first path to the first draft, chat is refinement-only and the "chat interface... to add through chat" gap remains open.

**Independent Test**: From the AI Builder's landing view (no draft yet), submit a chat message naming a destination, party size, trip length, and budget; verify the compare view renders 1-3 options with budget-fit indicators, identical in shape to submitting the structured form with equivalent values.

**Acceptance Scenarios**:

1. **Given** the AI Builder with no existing draft, **When** the agent submits a chat message with a destination and a budget (dates/party/style optional), **Then** the system resolves sensible values for anything unstated (mirroring the form's own defaults) and the compare view (spec 019) appears with 1-3 live-priced options.
2. **Given** a resolved chat request, **When** the agent chooses one of the compared options, **Then** the SAME persistence, booking, sharing, and post-draft ChatPanel refinement flow occurs as when the option was reached via the structured form (spec 019 US2, spec 020).
3. **Given** the AI Builder with no existing draft, **When** the agent instead fills in and submits the structured form, **Then** the form's behavior is byte-identical to before this feature — the chat entry point is a pure addition, not a replacement.

---

### User Story 2 - Clarify instead of guessing when required details are missing (Priority: P2)

An agent's chat message doesn't include enough information to start a trip (no destination, or no budget). Instead of silently drafting something wrong or crashing, the assistant replies asking for the missing piece(s), and no draft is attempted.

**Why this priority**: A chat entry that occasionally fabricates a destination or a budget the agent never said would be worse than no chat entry at all — this guardrail is what makes User Story 1 trustworthy, but it is a supporting safeguard rather than the core value.

**Independent Test**: Submit a chat message missing a destination (or missing a budget); verify the assistant's reply asks for exactly the missing piece(s) and the AI Builder remains on the landing view (no compare view, no draft attempted).

**Acceptance Scenarios**:

1. **Given** the AI Builder with no existing draft, **When** the agent submits a chat message with no identifiable destination, **Then** the assistant replies asking for a destination and does not attempt to draft.
2. **Given** the AI Builder with no existing draft, **When** the agent submits a chat message with a destination but no identifiable budget, **Then** the assistant replies asking for a budget and does not attempt to draft.
3. **Given** a clarifying reply was shown, **When** the agent submits a follow-up chat message that supplies the missing piece, **Then** that new message is interpreted on its own merits (this is a fresh single-shot interpretation, not an accumulating conversation) and can now resolve into a draft.

---

### User Story 3 - Works without a live AI key (Priority: P2)

A fresh, keyless deployment (no live LLM API key configured) still lets an agent start a trip by chatting, deterministically, so the demo experience is not degraded by this feature.

**Why this priority**: The platform explicitly supports a keyless deterministic demo mode (spec 020 US4 precedent) — a chat-first entry that only works with a live LLM key would block UAT/demo usage of the very feature the operator asked for, but this is a mode-of-operation guarantee on top of US1, not a separate user journey.

**Independent Test**: With no live LLM API key configured, submit the same chat message twice; verify both runs interpret the request identically (same resolved destination/dates/party/budget) with zero network calls.

**Acceptance Scenarios**:

1. **Given** no live LLM API key is configured, **When** an agent submits a chat trip request, **Then** the assistant still interprets it and reaches the compare view using only deterministic, already-available logic.
2. **Given** the same chat message submitted twice in keyless mode, **When** comparing the two interpretations, **Then** the resolved trip-request parameters (destination, dates, party, budget, style) are identical.

### Edge Cases

- What happens when the chat message names a destination and budget but nothing else (no dates, party size, or style)? The system fills in the same defaults the structured form starts with (2 adults, 0 children, no style preference, hard-cap budget mode) and a near-term default trip length/start, so the request still resolves rather than being rejected.
- What happens when the chat message's budget is ambiguous (e.g. a bare number with no currency symbol or code)? The system defaults to the same currency the structured form defaults to (EUR) rather than refusing.
- What happens when the chat message asks for something entirely unrelated to trip planning (e.g. "what's the weather")? The assistant replies explaining it can help start a trip when given a destination and budget, and does not attempt to draft.
- What happens if the agent submits a chat request while a previous chat interpretation or draft is still processing? The system finishes or supersedes the in-flight request cleanly, mirroring the existing structured-form/compare/select busy-state guard — never two conflicting outcomes or a stuck indicator.
- What happens if the interpreted request turns out to be infeasible (e.g. budget below the flights reserve) once it reaches the compare pipeline? The SAME infeasible/failure messaging the structured form already shows for this case is shown — no separate chat-specific error path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The AI Builder's landing view (before any draft exists) MUST offer a chat entry point, alongside the existing structured form, where the agent can type a natural-language trip request.
- **FR-002**: The system MUST interpret a chat-first request into the same parameter set the structured form collects: destination, trip dates (or an equivalent duration), party size, an optional trip style, and a budget (amount, currency, mode).
- **FR-003**: When the chat message identifies at least a destination and a budget amount, the system MUST resolve any unstated parameters to the same defaults the structured form starts with, and MUST proceed to the existing compare-then-choose pipeline (spec 019) with the resolved request — no separate chat-specific comparison view.
- **FR-004**: When the chat message does not identify a destination, or does not identify a budget amount, the system MUST reply asking for exactly the missing piece(s) and MUST NOT attempt to draft anything.
- **FR-005**: Choosing an option from a chat-originated compare view MUST persist, book, share, and support post-draft chat refinement identically to an option reached from the structured form (spec 019 US2, spec 020) — no divergent behavior downstream of the resolved request.
- **FR-006**: The structured form entry point MUST continue to function exactly as it does today — this feature adds an alternative entry, it does not modify or gate the form.
- **FR-007**: Every price and inventory item in a chat-originated draft MUST come from the same live-verified supply pipeline the form-originated draft uses — never a value invented from the chat interpretation step.
- **FR-008**: In a deployment with no live AI capability configured (the deterministic/keyless demo mode), chat-first interpretation MUST still work deterministically — the same message always resolves to the same parameters.
- **FR-009**: While a chat request is being interpreted, the system MUST show the agent that it is working, rather than an unresponsive input.
- **FR-010**: The chat-first interpretation step MUST NOT introduce any way for the agent's browser to submit itinerary pricing or content that gets trusted and saved as-is — resolved parameters are a request, not itinerary content; every saved price and item still comes from live inventory via the existing pipeline (mirrors spec 020 FR-012).
- **FR-011**: The chat-first entry point MUST only ever be reachable by, and only ever act on behalf of, the currently authenticated agent's own agency — a chat request MUST NOT be able to draft or affect any other agency's data.

### Key Entities

- **Chat Trip Request**: A single natural-language message from the agent, interpreted into a resolved (destination, dates, party, style, budget) parameter set or a clarifying reply — exists only for the current interpretation; it is not a persisted entity and does not itself become part of the canonical itinerary.
- **Trip Request** *(existing, reused)*: The same structured parameter set the form already produces and feeds into the compare-then-choose pipeline — unchanged in shape or meaning by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from "AI Builder landing view" to "comparing 1-3 live-priced trip options" using only a single chat message, with zero structured-form fields filled in, for any request that names a destination and a budget.
- **SC-002**: 100% of chat requests missing a destination or a budget receive a clarifying reply and leave the AI Builder on its landing view — no draft is ever attempted from incomplete information.
- **SC-003**: The structured form's existing behavior shows zero regressions after this feature ships (same inputs produce the same compare/select/draft outcomes as before).
- **SC-004**: The keyless/deterministic demo mode produces identical interpreted parameters across repeated runs of the same chat message, with zero network calls.

## Assumptions

- This feature covers reaching the FIRST draft via chat. Adding items into an empty/unstarted itinerary purely by chat (distinct from starting the first draft) is out of scope: once a first draft exists — whether reached via chat or the form — the existing post-draft ChatPanel (spec 020) already provides chat-driven add/remove/hotel-swap, so this feature's scope (start the first draft via chat) plus the already-shipped spec 020 together close the operator's full "add through chat" ask.
- The chat-first interpretation is a single-shot mapping of one message to a trip request (or a clarifying reply) — it does not accumulate context across multiple chat turns the way a back-and-forth conversation would; a follow-up message after a clarifying reply is interpreted fresh, on its own content. This mirrors the existing post-draft ChatPanel's own single-turn-per-message model (spec 020 Assumptions) and keeps the deterministic/keyless guarantee simple to reason about.
- When the chat message under-specifies trip dates or length, the system applies the same kind of sensible defaults the structured form's own initial values represent (2 adults, 0 children, no style preference, hard-cap budget mode) plus a near-term default start date and trip length — exact default values are an implementation decision, not a product-visible contract, as long as they are deterministic.
- "Destination" and "budget amount" are the two pieces of information treated as essential to resolving a request; every other field has a workable default, mirroring which fields the structured form marks `required` today (destination, dates, budget) versus optional (trip style).
- This feature rides the existing canonical itinerary schema and the existing draft/selectDraft procedures unchanged — no new persisted entity, no schema migration.
