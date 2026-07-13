# Feature Specification: Planner UX Redesign — Human Labels, Destination Picker, Hero Draft Card

**Feature Branch**: `kitchen/fix-demo-05-planner-ux-redesign`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Planner redesign — human labels not raw enums, destination as country/city select, draft as hero card (B12 + UI). Today the planner is a 9-field grid form that exposes raw enum strings to the user (budgetMode dropdown shows 'hardCap'/'target'; pace shows 'balanced'; destination is a bare text input placeholder 'e.g. Lisbon'). It reads as a debug form, not a product. Build a polished planner entry: human labels + segmented controls for budget mode and trip style; destination as a searchable country/city selector seeded with hero destinations, free text as fallback; the generated draft presented as an image-forward hero itinerary card with a day timeline and budget breakdown, not a plain table. Presentation-only — no change to the underlying draft/budget contract."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Human-readable trip preferences (Priority: P1)

An agent opens the trip planner to start a new itinerary and needs to choose how strict the budget is and what pace the trip should have. Today those choices are exposed as raw server enum strings ("hardCap", "target", "balanced", "budget", "premium"), which reads like an internal debug tool rather than a product an agent would show a client. The agent should instead see plain-language choices that map to the same underlying values.

**Why this priority**: This is the single biggest "looks like a debug form" signal in the current planner and touches every planning session — fixing it delivers visible polish with the least implementation risk (pure presentation, no new data source).

**Independent Test**: Can be fully tested by opening the planner and confirming the budget-mode and trip-style controls display only human-readable labels (no `hardCap`/`target`/`balanced`/`budget`/`premium` identifiers anywhere in the rendered page), while a submitted plan still produces the same request shape the server already accepts.

**Acceptance Scenarios**:

1. **Given** the planner is open, **When** the agent looks at the budget-mode control, **Then** they see plain-language options (e.g. "Hard cap" and "Target budget") with no raw enum text visible.
2. **Given** the planner is open, **When** the agent looks at the trip-style control, **Then** they see plain-language pace/style options with no raw enum text visible.
3. **Given** the agent selects a human-readable option and submits the form, **Then** the itinerary drafts successfully exactly as it did before the redesign (same underlying value reaches the server).

---

### User Story 2 - Destination picker with seeded hero destinations (Priority: P2)

An agent starting a new plan wants to pick a destination quickly rather than typing a free-text guess into a placeholder field. They should be able to search/browse a short list of curated destinations, or fall back to typing a destination that isn't in the curated list.

**Why this priority**: Destination is the first and most prominent field in the form; a bare text input with a placeholder example reads as unfinished. This depends on nothing beyond static seed data, so it ships independently of the other two stories.

**Independent Test**: Can be fully tested by opening the planner, using the destination control to pick one of the seeded destinations (confirming it populates the field), and separately confirming free-text entry for an unlisted destination still works and drafts successfully.

**Acceptance Scenarios**:

1. **Given** the planner is open, **When** the agent interacts with the destination field, **Then** they can browse/search a list of at least four seeded destinations, each visually distinguished (e.g. a flag or a distinct color/graphic treatment), and select one to populate the field.
2. **Given** the agent wants a destination not in the seeded list, **When** they type a destination name directly, **Then** the free-text value is accepted and used exactly as before.
3. **Given** a destination has been chosen (seeded or free-text), **When** the form is submitted, **Then** the same destination string reaches the draft request as today.

---

### User Story 3 - Hero itinerary card for the drafted result (Priority: P3)

After an agent drafts an itinerary, they currently see a plain table of days and a budget table. They want the result to look like something they could confidently show a client — an image-forward summary card with a day timeline and a clear budget breakdown — instead of a raw data table.

**Why this priority**: This is the most visually involved change (a new result layout) and is most valuable once the input side (Stories 1-2) is already polished, so it's sequenced last, but it can still be built and demoed independently against any existing drafted itinerary.

**Independent Test**: Can be fully tested by drafting an itinerary and confirming the result renders as a single hero card (image-forward header, day-by-day timeline, budget breakdown) rather than the current plain table, with all the same underlying data (title, totals, per-day items, per-category budget fit) still visible and unchanged in value.

**Acceptance Scenarios**:

1. **Given** an itinerary has just been drafted, **When** the result renders, **Then** it appears as a single visually-designed hero card (not a bare table) showing the itinerary title, total price, and an image-forward header treatment.
2. **Given** the hero card is showing, **When** the agent reviews it, **Then** the day-by-day itinerary content and the per-category budget breakdown (allocated/planned/state) are both present and show the exact same values as the pre-redesign table.
3. **Given** the agent drafts a second itinerary in the same session, **When** the new result arrives, **Then** the hero card fully replaces the previous one (no stale card left behind).

---

### Edge Cases

- What happens when the agent picks a seeded destination, then edits the text afterward? The field must behave as an ordinary editable text value from that point on (edits are free text, not locked to the picker selection).
- What happens when the destination search/browse list finds no match for what the agent typed? The control must still let the agent submit their typed free-text value as the destination.
- What happens when the itinerary draft fails (infeasible / planner failure / transport error)? The existing failure messaging (unchanged wording, from the existing pure-logic mapping) must still be shown; the hero card must not render for a non-drafted outcome.
- What happens on narrow (mobile-width) screens? The redesigned controls and the hero card must remain usable (no horizontal overflow, controls remain tappable) consistent with the existing responsive behavior of the form.
- What happens when the agent reloads the planner mid-session? Behavior is unchanged from today — the form resets to its initial empty state (no new persistence is introduced by this feature).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The planner MUST present the budget-mode choice using plain-language labels only; no raw enum identifier string may appear anywhere in the rendered control or its visible text.
- **FR-002**: The planner MUST present the trip-style/pace choice using plain-language labels only; no raw enum identifier string may appear anywhere in the rendered control or its visible text.
- **FR-003**: Selecting a human-readable budget-mode or trip-style option MUST map to exactly the same underlying value the draft request already sends today (no new values, no removed values).
- **FR-004**: The planner MUST offer a destination control that lets the agent choose from a seeded set of at least four hero destinations (at minimum: Lisbon/Portugal, Tokyo/Japan, Marrakech/Morocco, Reykjavik/Iceland), each with a distinct visual treatment.
- **FR-005**: The destination control MUST also accept free-text entry for a destination outside the seeded set, and that free-text value MUST be usable exactly as the current bare text input is used today.
- **FR-006**: Choosing a seeded destination MUST populate the same destination value that is sent in the draft request (no separate hidden field or mismatched value).
- **FR-007**: The drafted-itinerary result MUST render as a single image-forward hero card (day timeline + budget breakdown) instead of the current plain table layout, while showing the same underlying values (title, total price, budget mode, per-day items, per-category allocated/planned/state) as before.
- **FR-008**: The hero card presentation MUST NOT alter, recompute, or reformat any money value beyond what the existing display-formatting logic already does — every amount shown MUST come from the existing minor-unit formatting path.
- **FR-009**: None of the changes in this feature may alter the shape or semantics of the data sent to or received from the itinerary-drafting procedure — only how that data is collected and displayed.
- **FR-010**: All pre-submission validation behavior (required fields, date ordering, positive budget, party-size checks) and all failure-message text MUST remain exactly as it is today.
- **FR-011**: The redesigned planner MUST remain usable without any external image assets or third-party image loading — visual richness comes from styling only.

### Key Entities

- **Destination option**: A seeded, human-facing entry in the destination picker — a display name (city + country) and a visual treatment. Purely a presentation-layer concept; it resolves to the same plain destination string the form already collects.
- **Trip-style / budget-mode option**: A human-readable label paired 1:1 with an existing server-accepted enum value. Presentation-layer only — no new value space.
- **Draft result hero card**: The visual presentation of an existing drafted itinerary (title, pricing, days, budget-fit categories) — a new view of existing data, not a new data entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person unfamiliar with the system, shown the planner, cannot identify any raw internal identifier/enum text anywhere on the page (100% of visible budget-mode and trip-style text is plain language).
- **SC-002**: An agent can select a destination from the seeded picker in under 3 interactions (open control, search or scroll, select) and still has a working free-text path for any destination not listed.
- **SC-003**: 100% of previously-passing planner request-mapping and failure-message test assertions continue to pass unmodified after the redesign (the underlying contract is provably unchanged).
- **SC-004**: A drafted itinerary is presented as a single cohesive visual card rather than a plain data table, with 100% of the previously-shown data points (title, total, per-day items, per-category budget fit) still present and correct.

## Assumptions

- The set of trip-style values (`balanced`, `budget`, `premium`) and budget-mode values (`hardCap`, `target`) is fixed by the existing server contract; this feature only adds human-readable labels for the existing values, it does not add or remove values.
- "Image-forward" visual treatment means CSS-driven color/graphic treatment (gradients, iconography, flags), not real photography — the codebase's demo image/catalog seed data (a separate, not-yet-built ticket) is not a dependency of this feature.
- The seeded destination list is a static, hardcoded set for this iteration (not fetched from a backend catalog); it exists purely to make the picker feel populated and to demonstrate the pattern, and does not preclude a future feature wiring it to real supply/catalog data.
- Mobile/responsive behavior follows the existing breakpoint conventions already used elsewhere in the planner form and app shell — no new breakpoints are introduced.
- No new persistence (e.g. remembering a previously chosen destination across sessions) is in scope.
