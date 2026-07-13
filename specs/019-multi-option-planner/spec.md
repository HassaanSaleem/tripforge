# Feature Specification: Multi-Option AI Itinerary Generation

**Feature Branch**: `kitchen/fix-demo-04-multi-option-planner`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Multi-option AI itinerary generation (demo-04-multi-option). OPERATOR (verbatim): 'AO should also recommend multiple options to the user not just one fixed.' Today the planner produces exactly one persisted itinerary per draft request. Required: 2-3 distinct itinerary options differentiated by theme/spend, a compare UI, and picking one opens it exactly like today's drafted-itinerary view — a real persisted, bookable itinerary. FakeLLM must deterministically produce distinct variants for the keyless demo. No canonical itinerary schema change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare multiple drafted options (Priority: P1)

An agent fills out the trip-planning form (destination, dates, party, budget) and submits it. Instead of seeing a single fixed itinerary, the agent sees 2-3 clearly differentiated itinerary options for the same trip inputs — for example a budget-conscious option, a balanced option, and a premium option — each showing its own total price against the budget and a couple of highlights (e.g. which hotel, how many activities).

**Why this priority**: This is the entire point of the feature (the operator's explicit ask) — without it there is nothing to compare or pick.

**Independent Test**: Submit the planner form with a valid trip request; verify 2-3 options are rendered, each with a distinct label, a distinct total price, and at least one distinct highlight (not simply the same plan repeated).

**Acceptance Scenarios**:

1. **Given** a valid trip request (destination, dates, party size, budget), **When** the agent submits the planner form, **Then** the agent sees 2 or 3 distinct itinerary options, each labeled (e.g. "Budget-savvy", "Balanced", "Premium") with its own total price and a short highlight.
2. **Given** the compare view is showing multiple options, **When** the agent inspects any two options, **Then** at least one of price, selected stay, or activity count differs between them (they are not the same plan under different labels).

---

### User Story 2 - Select one option and continue exactly as today (Priority: P1)

Having compared the options, the agent picks the one they want. The chosen option becomes the agent's real, saved trip — opening in the same builder view the single-draft flow already has today (hero card, day-by-day plan, budget-fit table), with the same booking and client-share controls available. The options the agent did NOT pick leave no trace: no extra trips appear in the agent's trip list, and no funnel/analytics event is recorded for them.

**Why this priority**: Comparison without commitment has no product value — the agent must be able to act on their choice, and the two options they discard must not pollute their workspace or the platform's funnel metrics.

**Independent Test**: From a rendered compare view, pick one option; verify exactly one new trip appears in the agent's trip list (matching the picked option's label/price), the builder view opens showing that trip, and it can be booked or shared exactly as an itinerary drafted under the old single-option flow could.

**Acceptance Scenarios**:

1. **Given** 2-3 compared options, **When** the agent picks one, **Then** that option opens in the builder view with its full day-by-day plan and budget-fit summary, and the booking and share controls are available on it.
2. **Given** the agent has picked an option, **When** the agent later reopens their trip list, **Then** exactly one new trip appears (the picked option) — the unpicked options are not present.
3. **Given** the agent picked an option, **When** the agent proceeds to book an item on it, **Then** booking behaves exactly as it does today for a single-drafted itinerary (same quote/book flow, same money-path guarantees).

---

### User Story 3 - Keyless demo stays fully functional (Priority: P2)

A fresh, keyless deployment (no live LLM API key configured) still produces 2-3 genuinely distinct options deterministically, so the demo experience is not degraded by this feature and remains reproducible for QA/UAT without network access or an API key.

**Why this priority**: The platform explicitly supports a keyless deterministic demo mode; a feature that only works with a live LLM key would break that guarantee and block UAT/demo usage.

**Independent Test**: With no LLM API key configured, submit the same trip request twice; verify both runs produce the same 2-3 options with the same labels, prices, and selections (fully deterministic, no randomness).

**Acceptance Scenarios**:

1. **Given** no live LLM API key is configured, **When** an agent submits a trip request, **Then** 2-3 distinct options are still produced, using only already-available trip inventory.
2. **Given** the same trip request is submitted twice in the keyless mode, **When** comparing the two runs, **Then** the options produced are identical (same labels, same prices, same selections).

### Edge Cases

- What happens when the trip is too short or the budget too tight to produce genuinely distinct options (e.g. a 1-night trip, or a budget that only fits one hotel)? The system MUST still return at least one option (falling back to fewer, non-duplicate options) rather than fail outright, and MUST NOT show two options that are identical in every displayed respect (price, stay, highlight).
- What happens when the trip/budget is infeasible for planning at all (e.g. budget below the flights reserve, or no bookable days)? The system reports the same infeasible/failed outcome as today's single-draft flow — no options are shown, mirroring current behavior exactly.
- What happens if the agent picks an option and then the underlying travel inventory has changed in the meantime (e.g. a hotel sold out between comparing and picking)? The system re-checks live availability/pricing at the moment of selection (not simply persisting what was shown during comparison) and reports the same typed failure the current single-draft flow already reports if nothing plannable remains.
- What happens if the agent never picks an option and abandons the compare view? No trip is created and no funnel event is recorded — identical to today's behavior when an agent never submits the form.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST, on a valid trip-planning submission, present the agent with 2 to 3 distinct itinerary options for the same trip inputs before any of them is saved as a real trip.
- **FR-002**: Each option MUST be individually labeled with a human-readable theme (e.g. "Budget-savvy", "Balanced", "Premium") and MUST show its total price and how that price compares to the agent's stated budget.
- **FR-003**: Each option MUST show at least one differentiating highlight (e.g. which stay was chosen, how many activities are included) so options are visually and substantively distinguishable, not just relabeled duplicates.
- **FR-004**: The agent MUST be able to select exactly one option from the compare view to proceed with.
- **FR-005**: Selecting an option MUST produce a real, saved trip — identical in every respect (persistence, editability, bookability, shareability) to a trip produced by today's single-option drafting flow.
- **FR-006**: Options that the agent does not select MUST NOT be saved as trips and MUST NOT be recorded in the platform's trip-creation funnel metrics.
- **FR-007**: All prices and budget comparisons shown for every option MUST reflect real, currently available trip inventory pricing — no placeholder, estimated, or client-computed values.
- **FR-008**: When the agent's selection is finalized, the system MUST re-check the chosen option against currently available trip inventory before saving it, and MUST report a typed failure (mirroring today's single-draft failure reporting) if the option can no longer be fulfilled.
- **FR-009**: In a deployment with no live AI planning capability configured (the deterministic/keyless demo mode), the system MUST still produce 2-3 distinct options deterministically — the same trip request always yields the same options.
- **FR-010**: If the trip's constraints are too narrow to produce 2-3 genuinely distinct options, the system MUST return as many distinct options as it can (at least 1) rather than show duplicate-looking options or fail outright.
- **FR-011**: If the trip/budget combination is infeasible for planning at all, the system MUST report the same infeasible/failed outcome it reports today — no options are shown in that case.
- **FR-012**: The compare-and-select experience MUST NOT introduce any new way for a client to submit itinerary pricing or content that gets trusted and saved as-is — the saved trip's price and content are always determined by the system, not echoed back from what the client displayed.

### Key Entities

- **Itinerary Option**: A candidate trip plan shown during comparison — a label/theme, a total price, a budget-fit indicator, and one or more highlights. Not yet a saved trip; exists only for the duration of the compare-and-select interaction.
- **Trip (Itinerary)**: The existing saved, canonical trip record — unchanged in shape or meaning by this feature. An Itinerary Option becomes a Trip only once the agent selects it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from submitting a trip request to seeing 2-3 comparable, genuinely different options within the same time it previously took to see a single option (no added end-to-end latency beyond generating the extra options).
- **SC-002**: 100% of comparisons show options that differ from each other in at least one of price, selected stay, or activity count — no two options in the same comparison are visually indistinguishable.
- **SC-003**: 100% of the agent's trip list entries correspond to options the agent explicitly selected — zero unpicked options ever appear as saved trips.
- **SC-004**: The keyless/deterministic demo mode produces byte-identical option sets (labels, prices, selections) across repeated runs of the same trip request, with zero network calls.
- **SC-005**: A selected option is bookable, listable, and shareable with 100% behavioral parity to a trip produced by the prior single-option flow (no regression in the existing booking/marketplace/share user journeys).

## Assumptions

- "2-3 distinct options" is satisfied by exactly 3 named variants — "Budget-savvy", "Balanced", "Premium" — in the common case; fewer than 3 is an acceptable degraded outcome only when the trip's constraints genuinely can't support that many distinct plans (edge case), never a normal-case default.
- Comparison-time options are not required to survive a page reload or be resumable later — if the agent navigates away before selecting, they must resubmit the trip request (same as abandoning today's single-draft form before it completes has no persisted trace).
- "No new funnel event for unpicked options" means the existing trip-creation funnel event fires exactly once per agent action that results in a saved trip, exactly as it does today — this feature does not add or remove funnel event types, only preserves the existing one-event-per-saved-trip guarantee under the new multi-option flow.
- Re-checking inventory at selection time may re-run the same kind of supply lookups used at comparison time; this is an internal implementation concern, not a user-facing requirement, beyond the failure-handling guarantee in FR-008.
- This feature changes only the agent-facing professional planner surface; it does not touch the client-facing shared trip view, which continues to show whatever single trip the agent has already chosen and saved.
