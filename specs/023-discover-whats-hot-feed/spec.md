# Feature Specification: Discover / "What's Hot" Feed

**Feature Branch**: `023-discover-whats-hot-feed`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Discover / \"What's Hot\" feed — a top-of-funnel inspiration surface on the consumer/workspace app (ticket demo-08-discover, operator must-have, PRD §9.7 Pillar 4). Country/destination selection (reuse the existing HERO_DESTINATIONS: Lisbon, Tokyo, Marrakech, Reykjavik) opens a scrollable, image-forward \"what's hot\" feed of trending places/experiences for that destination — each card shows licensed imagery, a short \"what's happening\" blurb, and a hotel highlight. Every feed item is actionable — a \"Plan this\" action opens the AI itinerary builder pre-seeded with that destination. Seeded/curated content is acceptable for this cycle. UI bar: premium, editorial, magazine-grade. Acceptance: pick a country → see a populated what's-hot feed with real (licensed, attributed) imagery → tap an item's \"Plan this\" action → the AI builder opens pre-seeded with that destination."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse what's hot for a destination (Priority: P1)

An agent, exploring for inspiration before starting a build, opens the Discover destination in the workspace, picks one of the featured countries/cities, and sees a scrollable, image-forward feed of trending places and experiences for that destination — each item showing a photo, a short "what's happening" blurb, and a highlighted hotel.

**Why this priority**: This is the entire value of the feature — without a populated, browsable feed there is nothing to act on. It is the P0 slice that makes Discover a real surface instead of the current "coming soon" placeholder.

**Independent Test**: Sign in as a verified agent, navigate to Discover, select a destination from the picker, and confirm the feed renders populated cards (image, blurb, hotel highlight) instead of an empty or "coming soon" state.

**Acceptance Scenarios**:

1. **Given** a signed-in, verified agent on the Discover page, **When** they select a featured destination (e.g. Lisbon), **Then** a scrollable feed of at least 3 distinct "what's hot" items for that destination renders, each with a photo, a short blurb, and a hotel highlight.
2. **Given** the Discover feed is showing one destination's items, **When** the agent switches to a different featured destination, **Then** the feed replaces its contents with that destination's own distinct items (no stale cross-destination content).
3. **Given** an unverified or unauthenticated visitor, **When** they attempt to reach the Discover page, **Then** they see the same workspace access guard already enforced on every other workspace destination (no special-cased bypass).

---

### User Story 2 - Turn inspiration into a plan (Priority: P1)

An agent, having found an appealing place or experience in the Discover feed, taps "Plan this" on that item and is taken straight into the AI itinerary builder with the destination already filled in, so they can continue building a budget-priced itinerary without retyping the destination.

**Why this priority**: PRD §9.7's hard rule is that every feed item must be actionable — a feed that only shows pretty pictures is engagement with no conversion. This is what makes Discover a top-of-funnel acquisition surface rather than a dead-end gallery, and is equally load-bearing as User Story 1.

**Independent Test**: From a populated Discover feed, tap "Plan this" on any item and confirm the builder opens with that item's destination already populated in the destination field, with no additional typing required to proceed.

**Acceptance Scenarios**:

1. **Given** a populated Discover feed for a destination, **When** the agent taps "Plan this" on a feed item, **Then** the AI itinerary builder opens with the destination field pre-filled with that item's destination.
2. **Given** the builder was opened via "Plan this" from Discover, **When** the agent reviews the pre-filled destination, **Then** they can immediately continue the normal build flow (adjust dates/budget/party size and generate a draft) without the pre-fill blocking or altering any other step.

---

### User Story 3 - Trustworthy, attributed imagery (Priority: P2)

An agent browsing Discover sees real, licensed photography for each place — never a placeholder icon, a scraped image, or an AI-generated photo passed off as real — with attribution available so the platform's content-sourcing claims hold up.

**Why this priority**: Content-sourcing integrity is a named PRD "do-not" (§9.7) and an architecture invariant (no fabricated place imagery) — a trust/legal risk, not cosmetic polish — but it is secondary to the feed simply existing and being actionable (User Stories 1–2).

**Independent Test**: Inspect the imagery rendered for each Discover feed item and confirm every image resolves to a real photograph from a licensed stock source with attribution metadata present (verifiable via page inspection), and that no image is an AI-generated illustration presented as a real photo.

**Acceptance Scenarios**:

1. **Given** any Discover feed item, **When** its image is inspected, **Then** it is a real photograph served from a licensed-stock source, not a scraped or fabricated image.
2. **Given** a Discover feed item's imagery, **When** its source is checked, **Then** attribution information for that photo is present in the underlying data (even if not visually prominent in the card itself).

---

### Edge Cases

- What happens when an agent selects a destination that has no curated feed content yet (i.e. outside the initially curated set)? The destination picker only offers destinations that have curated content, so this should not be directly reachable through the UI in this cycle.
- How does the system handle an agent tapping "Plan this" while already mid-draft in the builder on another tab/session? Pre-seeding only sets the initial destination value; it must not discard or overwrite an in-progress draft in a different session.
- What happens if a feed item's image fails to load? The card must still render its blurb, hotel highlight, and "Plan this" action — a broken image must not block the item's usability.
- What happens when the same destination is viewed twice in one session? The feed's item order and content must remain stable within a session (no reshuffling that would make the surface feel broken or random).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Discover destination in the workspace navigation that, when opened, presents a set of featured destinations for the agent to choose from.
- **FR-002**: System MUST, upon destination selection, display a scrollable feed of at least 3 curated "what's hot" items specific to that destination.
- **FR-003**: Each feed item MUST display a photograph, a short descriptive blurb about what makes the place/experience notable ("what's happening"), and a highlighted hotel relevant to that destination.
- **FR-004**: Each feed item MUST provide a "Plan this" action.
- **FR-005**: Activating a feed item's "Plan this" action MUST open the AI itinerary builder with that item's destination already populated, requiring no re-entry of the destination by the agent.
- **FR-006**: System MUST restrict access to the Discover feed to the same verified, signed-in agent audience already gated on other workspace destinations — no new or weaker access path.
- **FR-007**: All feed item imagery MUST come from a real, licensed photography source with attribution recorded; the system MUST NOT display scraped image-search results or AI-generated imagery presented as real photographs.
- **FR-008**: The set of featured destinations and their feed content MAY be curated/seeded content rather than a live, continuously-updated data source for this cycle, provided the content is real and accurately described (not fabricated).
- **FR-009**: Switching the selected destination MUST update the feed to show that destination's own items only, replacing the previously shown destination's content.
- **FR-010**: The feed's visual presentation MUST be image-forward (photography is a primary, prominent element of each card, not incidental).

### Key Entities *(include if feature involves data)*

- **Featured Destination**: A city/country an agent can select in Discover (e.g. Lisbon, Tokyo, Marrakech, Reykjavik) — has a name and is associated with one or more feed items.
- **What's-Hot Feed Item**: A single trending place or experience shown within a destination's feed — has a title, a descriptive blurb, an associated photograph (with attribution), a related hotel highlight, and a destination value used to pre-seed the builder when its "Plan this" action is used.
- **Hotel Highlight**: A featured hotel recommendation shown alongside a feed item's place/experience content, giving the agent a concrete place to anchor a stay in that destination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from opening Discover to viewing a populated feed for a chosen destination in 2 interactions or fewer (open Discover, pick a destination).
- **SC-002**: An agent can go from a feed item they find interesting to a builder pre-filled with that destination in a single interaction ("Plan this" tap/click).
- **SC-003**: 100% of feed items display a real, attributed photograph — zero broken-image placeholders or unattributed images in the initially curated content set.
- **SC-004**: All 4 initially featured destinations (Lisbon, Tokyo, Marrakech, Reykjavik) each present at least 3 distinct, non-duplicate feed items.

## Assumptions

- Reuses the existing set of 4 featured destinations (Lisbon, Tokyo, Marrakech, Reykjavik) already established elsewhere in the product for destination selection, rather than introducing a new destination list.
- "Curated/seeded" content for this cycle means hand-authored, real, licensed content prepared ahead of time — not a live integration with an external events or listings API. A future iteration may replace this with a live or broader-coverage data source without changing this feature's user-facing contract.
- This feature ships independently of any other separate work that seeds the broader platform's demo data (agencies, bookings, marketplace listings) — Discover's curated content set is self-contained and does not require that other work to land first.
- "Plan this" pre-seeds only the destination value; it does not pre-fill dates, budget, party size, or any other builder input.
- The Discover feed's featured-destination set is fixed/curated for this cycle rather than end-user-configurable or personalized.
- This feature is the operator-authorized delivery of the roadmap-gated "What's Hot" discovery surface for a demo milestone, ahead of the platform's general P1→P2 sequencing — the explicit ticket authorizing this work constitutes the required scope decision.
