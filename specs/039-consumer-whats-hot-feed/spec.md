# Feature Specification: Consumer "What's Hot" Discovery Feed

**Feature Branch**: `039-consumer-whats-hot-feed`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Consumer 'What's Hot' discovery feed on the traveler surface (ticket goal-consumer-whats-hot, GOAL.md Deliverable 2.2, PRD §9.7). Bring the What's Hot discovery feed to the signed-in traveler consumer surface. Today /view/discover is an honest 'coming soon' placeholder and the agent workspace already has a real curated feed (spec 023). Give travelers the same experience: pick a featured destination, see a scrollable feed of ≥3 curated items per destination (licensed/attributed imagery, a 'what's happening' blurb, a hotel highlight), and every card's 'Plan this' action opens the CONSUMER AI planner pre-seeded with that destination so the traveler builds a live-priced, bookable itinerary that forks to an agent (Constitution I) or self-book. Reuse the curated feed data; generalize the workspace feed presentational components into a neutral shared component parameterized by the plan-handoff path (INV-024). Brand-neutral (INV-020), signed-in-gated (INV-023). No schema/money/supply/revenue-share change. Operator-authorized P2 pull-forward."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A traveler browses What's Hot (Priority: P1)

A signed-in traveler on the consumer surface opens **Discover** from their navigation and sees an image-forward "What's Hot" feed. They pick one of the featured destinations (Lisbon, Tokyo, Marrakech, Reykjavik) and see a scrollable feed of trending places and experiences for that destination — each card showing a real photo, a short "what's happening" blurb, and a highlighted hotel.

**Why this priority**: This is the whole value of the feature — without a populated, browsable consumer feed there is nothing to act on. It replaces the current "coming soon" placeholder that greets a traveler who taps Discover, turning a dead end into a real top-of-funnel surface (GOAL.md D2.2, PRD §9.7).

**Independent Test**: Sign in as a traveler, open `/view/discover`, select a destination from the picker, and confirm the feed renders at least 3 populated cards (image, blurb, hotel highlight) instead of a "coming soon" or empty state.

**Acceptance Scenarios**:

1. **Given** a signed-in traveler on the consumer Discover page, **When** they select a featured destination (e.g. Lisbon), **Then** a scrollable feed of at least 3 distinct "What's Hot" items for that destination renders, each with a photo, a short blurb, and a hotel highlight.
2. **Given** the feed is showing one destination's items, **When** the traveler switches to a different featured destination, **Then** the feed replaces its contents with that destination's own distinct items (no stale cross-destination content).
3. **Given** the traveler's consumer navigation, **When** they look at the Discover entry, **Then** it is a live, followable link (not a "coming soon" signpost) and marks itself active on the Discover page.

---

### User Story 2 - Turn inspiration into a plannable, bookable trip (Priority: P1)

A traveler who has found an appealing place in the Discover feed taps **"Plan this"** on that card and is taken straight into the consumer AI planner with that destination already seeded, so they can generate a live-priced, bookable itinerary and continue into the request-an-agent / self-book fork without retyping the destination.

**Why this priority**: PRD §9.7's hard rule — and GOAL.md D2.2 — is that **every feed item MUST be actionable**: tapping one opens a plannable, budget-priced, bookable itinerary connected to an agent or the marketplace (Constitution I — feed the marketplace). A feed that only shows pretty pictures is engagement with no conversion. This is what makes consumer Discover a real acquisition surface rather than a gallery, and is equally load-bearing as User Story 1.

**Independent Test**: From a populated consumer Discover feed, tap "Plan this" on any card and confirm the consumer planner opens with that card's destination already seeded into the chat, requiring no additional typing to proceed to a build.

**Acceptance Scenarios**:

1. **Given** a populated consumer Discover feed for a destination, **When** the traveler taps "Plan this" on a card, **Then** the consumer AI planner (`/view/plan`) opens with the chat pre-seeded with that card's destination.
2. **Given** the planner was opened via "Plan this", **When** the traveler reviews the seeded chat, **Then** they can immediately send it (or edit budget/dates) and proceed to the normal build → live-priced options → request-agent/self-book fork without the pre-seed blocking or altering any other step.
3. **Given** an anonymous (signed-out) visitor, **When** they navigate to `/view/discover`, **Then** they are redirected to traveler sign-in (the same gate as `/view/plan`), never shown the feed.

---

### User Story 3 - Trustworthy, attributed, brand-neutral imagery (Priority: P2)

A traveler browsing consumer Discover sees real, licensed photography for each place — never a placeholder icon, a scraped image, or an AI-generated photo passed off as real — with attribution present; and the surface carries no platform ("TripForge"/"Trellis") wordmark or agency branding (it is the neutral traveler surface).

**Why this priority**: Content-sourcing integrity is a named PRD "do-not" (§9.7) and an architecture invariant (no fabricated place imagery), and brand-neutrality of the client surface is INV-020 — trust/legal posture, not cosmetics — but it is secondary to the feed simply existing and being actionable (US1–US2). Reusing the already-vetted curated feed data satisfies imagery integrity by construction.

**Independent Test**: Inspect the imagery and page chrome on the consumer Discover page and confirm every image resolves to a real licensed-stock photograph with visible attribution, and that the page body/title contain no platform wordmark.

**Acceptance Scenarios**:

1. **Given** any consumer Discover feed card, **When** its image is inspected, **Then** it is a real photograph served from a licensed-stock source with attribution shown on the card.
2. **Given** the consumer Discover page, **When** the page body and document title are inspected, **Then** no "TripForge"/"Trellis" platform wordmark appears (INV-020 negative), consistent with every other consumer surface.

---

### Edge Cases

- **A feed image fails to load** → the card must degrade to a labeled fallback panel (the destination/title), never a broken `<img>` icon, and the rest of the card (blurb, hotel, "Plan this") stays fully functional and actionable.
- **The seeded destination reaches the planner** → the seed only pre-fills the traveler's first chat message; it must not auto-submit, skip the confirm step, or bypass any planner validation. An empty/absent `destination` param is byte-identical to opening `/view/plan` directly.
- **A traveler navigates directly to `/view/discover` while signed out** → redirected to sign-in (US2 AS3), not the anonymous share-token catch-all.
- **A `destination` param that is not one of the featured destinations** (e.g. hand-edited URL) → the planner still opens with whatever text was seeded; the planner's existing interpret/needs-info flow handles an unrecognized destination gracefully (no crash). The Discover feed itself only ever emits the four featured destinations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The consumer surface MUST expose a Discover destination at `/view/discover` that renders a real "What's Hot" feed (destination picker + card grid) instead of the current "coming soon" placeholder.
- **FR-002**: The consumer Discover page MUST be gated to signed-in travelers: an anonymous request MUST redirect to traveler sign-in (same policy as `/view/plan`), and MUST NOT fall through to the anonymous `/view/[token]` catch-all.
- **FR-003**: The feed MUST show, for a selected featured destination, at least 3 distinct curated items, each with a real licensed image, a short "what's happening" blurb, and a hotel highlight.
- **FR-004**: The destination picker MUST offer the featured destinations (Lisbon, Tokyo, Marrakech, Reykjavik) and switching selection MUST replace the grid with only the newly-selected destination's items.
- **FR-005**: Every feed card MUST carry a "Plan this" action that navigates to the **consumer** AI planner (`/view/plan`) with the card's destination passed as a seed — never to the agent workspace planner.
- **FR-006**: The consumer AI planner MUST accept an optional seed destination and, when present, pre-fill the traveler's first chat message with that destination so no typing is required to proceed; when absent, planner behavior MUST be byte-identical to today.
- **FR-007**: The seed MUST NOT auto-submit, skip confirmation, or bypass any existing planner validation/flow step — it only pre-fills the composer.
- **FR-008**: The consumer Discover navigation entry MUST be a live link (not a "coming soon" signpost) and MUST mark itself active on the Discover page.
- **FR-009**: The feed's imagery MUST be real, licensed-stock photography with attribution rendered on each card; no scraped or AI-fabricated place imagery.
- **FR-010**: A feed card whose image fails to load MUST degrade to a labeled fallback (no broken image icon) while keeping its blurb, hotel highlight, and "Plan this" action intact.
- **FR-011**: The consumer Discover surface MUST be brand-neutral (INV-020): no "TripForge"/"Trellis" wordmark in the page body or title, and no agency branding.
- **FR-012**: The consumer Discover surface MUST NOT import workspace-grouped UI components; shared feed presentation MUST come from a neutral, user-type-agnostic module (INV-024 — workspace UI never leaks into the client experience).
- **FR-013**: The feature MUST NOT change the canonical itinerary schema, any money path, the supply-adapter boundary, or revenue-share/client-ownership semantics; it is a read-only presentational surface over existing curated data plus a destination pre-seed.

### Key Entities

- **What's Hot feed item** (existing, `DiscoverFeedItem`): a curated, non-tenant, non-money content record — id, destination, title, blurb, licensed image (url/alt/attribution/source), hotel highlight, and the exact destination string to seed the planner with. Reused as-is from the agent-side feed; no new entity is introduced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in traveler can go from tapping Discover to a populated What's Hot feed in one click, with zero "coming soon"/empty states for any of the four featured destinations.
- **SC-002**: Every card in the feed is actionable — 100% of cards have a working "Plan this" action that lands the traveler in the consumer planner with the destination seeded (no dead or decorative-only cards).
- **SC-003**: A traveler can go from a Discover card to a generated live-priced set of trip options with no destination retyping — the only required interaction after "Plan this" is sending the pre-seeded message.
- **SC-004**: Each featured destination shows at least 3 curated items, and every rendered image is licensed-stock with attribution present (0 placeholder/fabricated images).
- **SC-005**: The consumer Discover page shows no platform wordmark in body or title (INV-020), verifiable by page inspection, matching every other consumer surface.

## Assumptions

- **Reuses the agent-side curated feed data** (`apps/web/lib/discover-feed.ts`) and the four `HERO_DESTINATIONS`; no new content is authored and no backend fetch is introduced (same non-tenant/non-money rationale as the agent-side feed, spec 023 research Decision 1).
- **Signed-in-only** for the consumer Discover surface, matching `/view/plan` — the consumer surface's Discover is part of the signed-in traveler experience. (An anonymous public discovery surface is out of scope for this cycle.)
- **The planner seed pre-fills the composer, not a form** — the consumer planner is chat-first (spec 038) with no destination form field, so the seed is delivered as pre-filled first-message text (the chat-first analog of the workspace planner's pre-seeded form field, spec 023).
- **Curated/seeded content is acceptable** for this cycle (same as the agent-side feed); a backend-driven trending feed is a later concern.
- **Operator-authorized P2 pull-forward** (GOAL.md, 2026-07-21): the consumer/client surface is roadmap P2; this feature lands under that explicit operator scope decision, recorded in the plan's Constitution Check. It funnels demand into the agent network (Constitution I) via the planner's request-an-agent fork and does not become a generic standalone planner play.
