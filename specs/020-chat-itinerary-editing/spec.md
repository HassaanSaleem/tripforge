# Feature Specification: Conversational AI Itinerary Editing

**Feature Branch**: `kitchen/fix-demo-03-chat-builder-conversational-editing`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Conversational AI itinerary editing — chat to add/remove/replace places + inline hotel suggestions (A2/A5). OPERATOR (verbatim): 'AI itinerary builder. Not just AI building it. Chatting with the agent to add or remove certain places.' Today the flow is strictly one-shot: a form -> a single streamed draft, with NO refine/chat/addItem/removeItem procedure. Build multi-turn conversational refinement on top of an existing draft: a chat panel to add/remove/replace items via natural language, inline hotel suggestions with an 'add to trip' action, and budget re-display after every edit. Must work keyless (FakeLLM, deterministic)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add or remove an item by chatting (Priority: P1)

An agent has already drafted and selected a trip (a real, saved itinerary). Next to the itinerary, they type a plain-language request like "add a food tour on day 2" or "remove the museum" into a chat panel. The assistant interprets the request against the current itinerary, applies the change directly, and the itinerary view (day-by-day plan and budget summary) updates to reflect it — no form, no re-drafting from scratch.

**Why this priority**: This is the operator's explicit ask and the core value of the feature — without direct add/remove, there is no conversational editing, only a chat window that talks but doesn't act.

**Independent Test**: Open an already-saved itinerary, submit "add a [activity type] on day N" in the chat; verify a new activity item appears on day N and the budget summary reflects the addition. Then submit "remove the [item title]"; verify that item is gone and the budget summary reflects the removal.

**Acceptance Scenarios**:

1. **Given** a saved itinerary with at least 2 days, **When** the agent asks the chat to add an activity to a specific day, **Then** a new activity item appears on that day, the assistant's reply confirms what was added, and the change is saved to the trip (visible after a page reload).
2. **Given** a saved itinerary with an existing item, **When** the agent asks the chat to remove it by name, **Then** that item is removed from its day, the assistant confirms the removal, and the change is saved to the trip.
3. **Given** a saved itinerary, **When** the agent asks the chat to remove an item using a name that matches nothing in the itinerary, **Then** the assistant replies that it couldn't find a matching item and nothing is changed.

---

### User Story 2 - Swap the hotel via inline suggestions (Priority: P1)

The agent asks the chat about the hotel (e.g. "swap the hotel for something boutique near the water", or simply "suggest a hotel"). Instead of silently picking one, the assistant shows 2-3 hotel suggestion cards (name, price) inline in the chat. The agent reviews them and clicks "Add to trip" on the one they want, which replaces the current stay in the itinerary.

**Why this priority**: Hotel choice is high-stakes and highly personal (location, style, price) — the operator's ask specifically calls out "inline hotel suggestions" as a distinct, visible UI moment rather than a silent swap, so agents stay in control of the trip's most expensive line item.

**Independent Test**: In the chat, ask about hotel options; verify 2-3 distinct suggestion cards render with a name and price each. Click "Add to trip" on one; verify the itinerary's stay item is replaced by the chosen option and the budget summary updates.

**Acceptance Scenarios**:

1. **Given** a saved itinerary with an existing stay, **When** the agent asks the chat to swap or suggest a hotel, **Then** 2-3 hotel suggestion cards appear inline in the chat, each showing a name and price, and the itinerary is NOT changed yet.
2. **Given** hotel suggestion cards are showing, **When** the agent clicks "Add to trip" on one, **Then** the itinerary's stay item is replaced by the chosen hotel, the budget summary updates, and the change is saved to the trip.
3. **Given** hotel suggestion cards are showing, **When** the agent ignores them and asks something else instead, **Then** the itinerary remains unchanged (suggestions are informational until acted on).

---

### User Story 3 - Budget stays visible and accurate after every edit (Priority: P2)

After each applied edit (add, remove, or hotel swap), the agent sees an up-to-date budget breakdown — how much of each spending category is allocated versus actually planned — without having to leave the chat or re-run the planner.

**Why this priority**: Budget-awareness is a core product principle; an editing feature that could silently take a trip over budget without telling the agent would undermine the platform's core value proposition, but this is a supporting confirmation on top of P1's actual edits rather than a standalone user journey.

**Independent Test**: Apply an edit that adds a priced item; verify the budget summary shown immediately after reflects the new total and per-category spend without a manual refresh or a new planner run.

**Acceptance Scenarios**:

1. **Given** an itinerary within budget, **When** the agent adds an item via chat that pushes a category over its allocation, **Then** the budget summary shown right after the edit reflects the new spend and flags the affected category, using the same over/under-budget indicators already shown elsewhere in the product.
2. **Given** an itinerary, **When** the agent removes an item via chat, **Then** the budget summary shown right after reflects the reduced spend for that item's category.

---

### User Story 4 - Works without a live AI key (Priority: P2)

A fresh, keyless deployment (no live LLM API key configured) still lets an agent add, remove, and swap items through the chat, deterministically, so the demo experience is not degraded by this feature.

**Why this priority**: The platform explicitly supports a keyless deterministic demo mode; a conversational feature that only works with a live LLM key would block UAT/demo usage — but this is a mode-of-operation guarantee on top of the P1 behaviors, not a separate user journey.

**Independent Test**: With no LLM API key configured, run the same chat request twice against a freshly seeded, identical itinerary; verify both runs interpret the request the same way and produce the same resulting itinerary.

**Acceptance Scenarios**:

1. **Given** no live LLM API key is configured, **When** an agent uses the chat to add, remove, or ask about hotels, **Then** the assistant still responds sensibly and applies the requested change (or shows suggestions) using only already-available trip inventory.
2. **Given** the same starting itinerary and the same chat message submitted twice in keyless mode, **When** comparing the two outcomes, **Then** they are identical.

### Edge Cases

- What happens when the agent's message doesn't map to any supported action (e.g. off-topic chatter, or a request like "make this cheaper" that isn't add/remove/hotel-swap)? The assistant replies explaining what it can help with (add an item, remove an item, or suggest hotels) and makes no change to the itinerary.
- What happens when the agent asks to add an item but the trip's inventory has nothing available to add (e.g. no activities exist for the destination)? The assistant replies that it couldn't find anything to add and makes no change.
- What happens when the agent asks to remove an item that matches more than one item in the itinerary (e.g. two items with similar names)? The assistant removes the best/first match and its reply names exactly which item it removed, so the agent can immediately ask to undo or adjust if it picked the wrong one.
- What happens if the agent submits a new chat message while a previous one is still being processed? The system finishes or supersedes the in-flight request cleanly — the agent never sees two conflicting replies or a stuck "thinking" indicator.
- What happens if the agent navigates away and comes back later? The itinerary changes they already applied are still there (persisted); the chat conversation itself does not need to still be visible — a fresh chat panel is an acceptable, expected reset.
- What happens if an edit would remove the itinerary's only remaining item, or add to a day number that doesn't exist in the trip? The assistant declines with a plain-language explanation and makes no change, rather than producing an invalid or empty trip.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a chat interface, visible alongside an already-saved itinerary, where the agent can type natural-language edit requests.
- **FR-002**: The system MUST interpret a chat request against the CURRENT saved itinerary and resolve it to exactly one of: a direct add of one item, a direct removal of one item, hotel suggestions to choose from, or a clarifying reply that makes no change.
- **FR-003**: When the system directly adds or removes an item, it MUST apply that change to the agent's saved trip immediately (no separate confirmation step) and the change MUST persist (visible on reload).
- **FR-004**: When the agent's request is about the hotel/stay (swap, replace, or ask for options), the system MUST present 2-3 suggestion options inline in the chat rather than silently changing the trip.
- **FR-005**: The system MUST let the agent explicitly commit to one hotel suggestion (e.g. an "Add to trip" action per option), and only then MUST the trip's stay be replaced.
- **FR-006**: Every added or replaced item's price MUST come from real, currently available trip inventory — never a placeholder, estimated, or client-supplied value.
- **FR-007**: After every applied edit (add, remove, or hotel replacement), the system MUST show an updated budget breakdown (allocated vs. planned spend per category) reflecting the new state of the trip.
- **FR-008**: If a chat request does not map to a supported action, the system MUST reply explaining what it can do and MUST NOT modify the itinerary.
- **FR-009**: If a chat request identifies an item to remove that does not match anything in the current itinerary, the system MUST reply that it found no match and MUST NOT modify the itinerary.
- **FR-010**: If a chat request would add an item to a day that does not exist in the trip, or would leave the trip with no bookable content, the system MUST decline with a plain-language explanation and MUST NOT modify the itinerary.
- **FR-011**: In a deployment with no live AI capability configured (the deterministic/keyless demo mode), the system MUST still support add, remove, and hotel-suggestion requests deterministically — the same request against the same itinerary state always produces the same outcome.
- **FR-012**: The chat interaction MUST NOT introduce any way for the agent's browser to submit itinerary pricing or content that gets trusted and saved as-is — every saved price and item detail is determined by the system from live inventory, never echoed back from what the client displayed.
- **FR-013**: The system MUST only ever change items belonging to the itinerary the agent currently has open — a chat request MUST NOT be able to affect any other agent's trip.
- **FR-014**: While a chat request is being processed, the system MUST show the agent that it is working (e.g. a "thinking"/processing indicator) rather than an unresponsive input.

### Key Entities

- **Chat Message**: A single turn in the editing conversation — who sent it (agent or assistant) and its text. Exists only for the current viewing session; it is not required to survive a page reload.
- **Edit**: A single, concrete change resolved from a chat request — either adding one item, removing one item, or replacing the stay — always targeting one specific existing itinerary.
- **Hotel Suggestion**: A candidate stay option shown inline in the chat (name, price) in response to a hotel-related request — not yet part of the trip until the agent explicitly adds it.
- **Itinerary (Trip)**: The existing saved trip record — unchanged in shape or meaning by this feature; edits modify its contents (which items exist on which days) and its budget summary, exactly as any other update to a saved trip would.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from "trip is drafted" to "trip has an item added via chat, an item removed via chat, and the hotel swapped via a suggestion card" in a single sitting, without ever leaving the itinerary page or re-running the planner form.
- **SC-002**: 100% of applied edits (add, remove, hotel replacement) show an updated, accurate budget breakdown immediately after the edit, with no manual refresh required.
- **SC-003**: 100% of chat requests that don't map to a supported action receive an explanatory reply and leave the itinerary byte-identical to before the request.
- **SC-004**: The keyless/deterministic demo mode produces identical edit outcomes across repeated runs of the same request against the same starting itinerary, with zero network calls.
- **SC-005**: Every itinerary change made through the chat is still present after the agent reloads the page — no edit is ever silently lost.

## Assumptions

- A trip has at most one stay (hotel) item at a time in this version — asking the chat to add or suggest a hotel when one already exists is treated as a request to replace the existing stay, not add a second one. Multi-hotel trips (e.g. city-hopping itineraries with a different hotel per leg) are out of scope for this feature.
- The chat conversation itself (the back-and-forth text) is not required to persist across a page reload or be resumable in a later session — only the resulting itinerary edits (the actual add/remove/replace outcomes) are durable. A fresh chat panel on return is expected behavior, not a defect.
- "Add a food tour", "remove the museum", and similar requests target activity or transfer items directly (the system picks the best-fitting available option); the agent is not asked to choose among multiple activity candidates the way they are for hotels — hotel choice is the one case singled out for an explicit suggestion-and-pick step because it's the highest-value, most personal decision in the trip.
- Requests that amount to general trip-wide optimization rather than a specific add/remove/hotel action (e.g. "make day 3 cheaper", "make this more luxurious") are out of scope for this version and receive the same clarifying, no-change reply as any other unsupported request; the operator's example phrases are read as illustrative flavor text, not a scope commitment, since the ticket's own acceptance criteria only exercises add/remove/hotel-swap.
- This feature builds on an itinerary that has already been drafted and saved (the existing one-shot/multi-option planner flow) — it does not change how a trip is first created, only how an already-saved trip can be refined afterward.
- Suggested hotel imagery/rich content depends on whatever trip inventory is currently available to the platform; this feature does not introduce a new content source and will automatically reflect richer inventory if/when it becomes available separately.
