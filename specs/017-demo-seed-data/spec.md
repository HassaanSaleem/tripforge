# Feature Specification: Demo Seed Data

**Feature Branch**: `017-demo-seed-data`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Demo seed data — populated platform on boot (ticket demo-01-seed, iteration 5)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator boots a populated demo, not an empty shell (Priority: P1)

An operator preparing for a demo runs a fresh `docker compose down -v && docker compose up --build --wait`, signs in with a documented demo account, and immediately sees a populated product: their own drafted trips with visible budget breakdowns, a marketplace full of listings from other agencies, ratings with comments, and non-zero seller earnings — with zero manual setup.

**Why this priority**: This is the whole point of the ticket. Every other story only matters if this one works — an empty platform blocks every demo journey.

**Independent Test**: Boot the stack from scratch, sign in with a demo login documented in the PR body, and observe a workspace with existing trips (not an empty state) and a marketplace with multiple active listings.

**Acceptance Scenarios**:

1. **Given** a fresh database volume, **When** the stack boots (`docker compose up --build --wait`), **Then** the workspace, marketplace, and ratings are pre-populated without any manual step.
2. **Given** the stack has already been seeded once, **When** it is rebuilt and restarted against the SAME database volume, **Then** the seed step does not duplicate agencies, itineraries, listings, licenses, or ratings, and does not corrupt any money ledger.
3. **Given** the documented demo credentials in the PR body, **When** an operator signs in through the browser sign-in page, **Then** authentication succeeds and the workspace loads that agency's seeded trips.

---

### User Story 2 - A trip in a hero city looks like a real trip, not a fixture (Priority: P2)

An agent (demo operator or, later, any real user) drafts a trip to one of a small set of signature cities and sees realistic, distinct hotel/activity/transfer names, short descriptions, and photos — instead of generic repeated placeholder names with no imagery.

**Why this priority**: Curated content is what makes the seeded (and any live-drafted) itinerary look like a real travel product on screen; without it the demo still looks like a debug fixture even with data populated.

**Independent Test**: Draft a new itinerary (seeded or live) for one of the curated cities and confirm the hotel/activity/transfer names are realistic and distinct from the generic placeholder pattern; draft for a non-curated destination and confirm the existing placeholder behavior is unchanged.

**Acceptance Scenarios**:

1. **Given** a trip request for a curated hero city, **When** the itinerary is drafted, **Then** the assembled itinerary's items carry realistic, city-specific names (not the generic two-item placeholder pattern used today).
2. **Given** a trip request for a destination that is NOT one of the curated hero cities, **When** the itinerary is drafted, **Then** behavior is unchanged from today (generic procedural names, no regression).
3. **Given** the curated catalog for a hero city, **When** its content is inspected, **Then** every image reference is a licensed stock source with an attribution, never a scraped or fabricated photo.

---

### User Story 3 - A seller agency has evidence of marketplace income (Priority: P3)

An operator viewing a specific seeded agency's workspace sees that agency has licensed out at least one trip and earns a non-zero, correctly-split revenue share, with the listing carrying real ratings and comments from the agencies that licensed it.

**Why this priority**: This demonstrates the marketplace/trade pillar (the product's differentiation) is alive, not just the build/book pillars — but the platform is still a believable demo even if this story alone were missing, so it ranks after the two stories above.

**Independent Test**: Sign in as a seeded seller agency and confirm the seller-earnings surface shows a non-zero amount; browse the marketplace and confirm at least one listing carries 3 or more ratings with comments from distinct agencies.

**Acceptance Scenarios**:

1. **Given** the seed has completed, **When** an operator opens the marketplace browse view, **Then** at least 3 active listings from different, verified-badge-eligible agencies are visible.
2. **Given** the seed has completed, **When** an operator signs in as a seller agency that has licensed out a trip, **Then** that agency's earnings surface shows a non-zero amount consistent with the recorded revenue split.
3. **Given** the seed has completed, **When** an operator opens a licensed listing, **Then** it shows 3 or more ratings with star values and short comments from distinct rating agencies.

---

### Edge Cases

- What happens when the seed step runs against a database that already has SOME but not all of the demo rows (e.g. a prior partial run was interrupted)? The seed step must check for existence before each write and skip/continue rather than fail or duplicate.
- What happens when a demo agency's email already exists from a previous run? Account creation for that email must be skipped as already-done, not fail the whole seed step.
- What happens when a non-curated destination is requested? The existing generic placeholder behavior must be produced unchanged (no regression to today's behavior).
- What happens when a rating is attempted by an agency that has not licensed the listing? Unaffected by this feature — the seed only creates ratings after a completed license, exercising the existing licensee-only rule rather than bypassing it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST populate, on first boot against an empty database, 4-5 demo agencies that are already vetted for marketplace participation (no additional manual vetting step).
- **FR-002**: The system MUST create 1-2 real, password-authenticated user accounts per demo agency, and the credentials for every seeded account MUST be documented in a human-readable place (the feature's delivery record) so an operator can actually sign in.
- **FR-003**: The system MUST produce at least 6 drafted itineraries spread across a small set of curated hero destinations and across the demo agencies, each with a visible, correct per-category and per-day budget breakdown.
- **FR-004**: At least one seeded itinerary MUST carry an attached media asset (visible in its gallery or on one of its items).
- **FR-005**: The system MUST publish at least 3 of the seeded itineraries as active marketplace listings, each owned by its vetted seller agency, with a stated price and revenue-share term.
- **FR-006**: The system MUST complete at least 3 license (white-label) transactions across the published listings, so that at least one seller agency's earnings are non-zero.
- **FR-007**: The system MUST record at least 3 ratings (star value + short comment) on licensed listings, contributed by agencies that actually completed a license on that listing (the existing licensee-only rating rule is exercised, not bypassed).
- **FR-008**: For a small, named set of hero destinations, itinerary drafting MUST surface realistic, distinct, human-recognizable hotel/activity/transfer names and short descriptions, each associated with a licensed-source photo and attribution — replacing today's generic, repeated placeholder names for those destinations only.
- **FR-009**: Drafting an itinerary for any destination outside the curated hero set MUST behave exactly as it does today (no regression).
- **FR-010**: Every piece of seeded or curated imagery MUST come from a licensed stock source (with attribution) — never a scraped search result and never AI-fabricated imagery presented as a real photo.
- **FR-011**: The seed step MUST be safely re-runnable against a database that already contains some or all of the seeded rows, without duplicating agencies, users, itineraries, listings, licenses, ratings, or media, and without creating any inconsistent (unbalanced) money record.
- **FR-012**: All seeded monetary amounts (prices, revenue shares, earnings) MUST be internally consistent (a recorded split always sums back to its total) and expressed in a single explicit currency per record.
- **FR-013**: Every seeded agency-owned record (itineraries, listings, licenses, ratings, media) MUST be attributed to the correct owning agency — no seeded record may be visible to or attributed to the wrong agency.

### Key Entities *(include if feature involves data)*

- **Demo agency**: A vetted, named travel agency used for the demo; owns users, itineraries, and marketplace listings.
- **Demo user account**: A real, sign-in-capable account belonging to one demo agency, with credentials documented for operator use.
- **Curated hero-city catalog entry**: A realistic, named supply option (accommodation, activity, or transfer) for one of the small set of showcase destinations, with a short description and a licensed, attributed photo.
- **Seeded itinerary**: A drafted trip, owned by a demo agency, with a budget breakdown and (for at least one) an attached media asset.
- **Marketplace listing**: A published, priced, revenue-share-termed offer of a seeded itinerary from its owning agency.
- **License (white-label transaction)**: A completed purchase of a listing by another demo agency, producing a revenue split and enabling that agency to rate the listing.
- **Rating**: A star value + comment left by a licensee agency on a listing it has licensed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a completely fresh environment, an operator reaches a fully populated, demo-ready product (signed in, trips visible, marketplace populated) with a single boot command and zero manual data-entry steps.
- **SC-002**: Re-running the boot sequence against a previously-seeded environment leaves the total count of agencies, itineraries, listings, licenses, and ratings unchanged (no duplication).
- **SC-003**: 100% of demo agencies (4-5) are visible in the marketplace as verified/vetted sellers or licensees.
- **SC-004**: At least 3 of the 4 curated hero destinations are represented among the seeded itineraries.
- **SC-005**: At least one seller agency shows non-zero, correctly-attributed marketplace earnings when an operator inspects it.
- **SC-006**: Drafting a new trip for a curated hero destination produces recognizably distinct, realistic content on first look — a viewer can tell it apart from the generic placeholder pattern without reading source code.

## Assumptions

- The four curated hero destinations are Lisbon, Tokyo, Marrakech, and Reykjavik, matching the destinations already referenced by sibling demo-readiness tickets in this iteration.
- "Licensed stock image URL" means a hotlinked source URL from a provider whose terms permit this kind of use (e.g. Unsplash or Pexels-class sources), not a locally re-hosted copy — consistent with the constitution's existing content-sourcing rule.
- The seed step runs automatically as part of the existing database-migration boot sequence; no new manual command is introduced for a normal `docker compose up`.
- Demo credentials are development-only and are not intended to be secret; they are documented in the delivery record precisely so an operator can use them.
- This feature does not change the canonical itinerary schema, the booking/quote flow, or introduce any new user-facing screen — it only populates data and enriches existing supply content for a fixed set of destinations.
- Threading curated photos all the way into an itinerary item's own media gallery automatically (as opposed to the itinerary/media library carrying at least one attached asset) is out of scope for this feature and may be addressed later.
