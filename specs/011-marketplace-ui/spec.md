# Feature Specification: Marketplace UI — browse, list, license

**Feature Branch**: `011-marketplace-ui`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Marketplace UI (ticket seed-0009d, DEMO SURFACE): an agent-facing marketplace page in the (workspace) route group where a signed-in agent can (1) BROWSE active public listings cross-tenant — title, seller agency name, license fee, revenue-share terms, license terms, rating average/count, and a clear 'your listing' marker on their own listings; (2) LIST one of their own finished itineraries on the marketplace with declared terms, handling every typed refusal the existing createListing procedure returns; and (3) LICENSE another agency's listing, receiving a white-label copy — the UI shows the copy itinerary id and the recorded revenue split exactly as returned by the server, handling typed refusals. Needs a small new agent-gated read procedure listing the agent's own itineraries so the listing form has a real picker — tenant-scoped per INV-004. All money values displayed exactly as returned. Every user-visible failure string comes from pure, DOM-free helper functions with L1 tests. Presentation uses the seed-0009s .tf-* theme kit. OUT OF SCOPE: rating submission UI and seller deactivate-listing UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the marketplace (Priority: P1)

A signed-in agent opens the marketplace page from their workspace and sees every active listing across all agencies — each with its title, the selling agency's name, the license fee, the revenue-share terms, the license terms, and its rating (average and count, or an explicit "not yet rated" state). Listings published by the agent's own agency carry a clear "your listing" marker. A visitor without an agency membership sees a sign-in/membership prompt instead of marketplace data.

**Why this priority**: Browse is the foundation the other two journeys stand on — without a rendered, trustworthy view of the supply side there is nothing to list into or license from. It is also the first cross-tenant surface an agent sees, so the trust boundary (what is public vs. tenant-private) must be right from the start.

**Independent Test**: Sign in as an agent while another agency has an active listing; open the marketplace page and verify the listing renders with all published fields and no "your listing" marker; verify a listing created by the agent's own agency does carry the marker; sign out and verify the page shows the membership prompt and no listing data.

**Acceptance Scenarios**:

1. **Given** two agencies where agency B has an active listing, **When** an agent of agency A opens the marketplace page, **Then** they see B's listing with title, seller agency name, license fee with currency, revenue-share terms, license terms, and rating state.
2. **Given** an agency with its own active listing, **When** one of its agents opens the marketplace page, **Then** that listing carries a clear "your listing" marker.
3. **Given** no active listings exist, **When** an agent opens the marketplace page, **Then** they see a friendly empty state inviting them to be the first to list — not an error.
4. **Given** an anonymous visitor (or a signed-in user with no agency membership), **When** they open the marketplace page, **Then** they see the workspace membership prompt and no listing data.
5. **Given** a listing that has never been rated, **When** it renders in browse, **Then** its rating state reads as "not yet rated" rather than a zero score.

---

### User Story 2 - List a finished itinerary (Priority: P2)

An agent picks one of their own workspace itineraries, declares the marketplace terms — a listing title, a license fee (entered in major units of the itinerary's own currency), license terms text, and a revenue-share percentage — and publishes it. On success the new listing appears in browse. Every refusal the platform returns (agency not vetted, itinerary already listed, provenance incomplete, itinerary not found) is explained in plain language.

**Why this priority**: Listing is the supply-side half of the trade layer — an agent must be able to put a finished trip on the marketplace before anyone can license it. It depends on browse (P1) existing to confirm the outcome.

**Independent Test**: Sign in as an agent with at least one drafted itinerary; open the listing form, pick the itinerary, fill terms, submit; verify the success confirmation and that the listing now renders in browse marked "your listing". Submit again for the same itinerary and verify the "already listed" explanation.

**Acceptance Scenarios**:

1. **Given** an agent with a drafted itinerary, **When** they list it with a title, fee, terms, and revenue-share percentage, **Then** they see a success confirmation and the listing appears in browse marked as theirs.
2. **Given** an itinerary that already has an active listing, **When** the agent tries to list it again, **Then** they see a plain-language "already listed" explanation and no duplicate listing is created.
3. **Given** an agent whose agency has no itineraries yet, **When** they open the listing form, **Then** the picker states there is nothing to list yet and points them to the planner — the form cannot be submitted.
4. **Given** a license fee input that is negative, non-numeric, or has more decimal places than the currency supports, **When** the agent submits, **Then** they see an inline validation message and nothing is sent to the platform.
5. **Given** the platform refuses the listing (not vetted / provenance incomplete / not found), **When** the refusal returns, **Then** the agent sees a distinct human-readable explanation for that exact reason — never a raw code or technical payload; a provenance refusal includes the specific issues reported.

---

### User Story 3 - License another agency's listing (Priority: P3)

An agent browsing the marketplace licenses another agency's listing. On success they see a confirmation that a white-label copy of the trip now exists in their workspace — showing the copy's identifier and the recorded revenue split (the license fee, the seller's credit, and the platform's take, in the listing currency) exactly as the platform recorded it. Every refusal (own listing, listing no longer active, already licensed, either side not vetted) is explained in plain language.

**Why this priority**: Licensing is the demand-side completion of the trade loop and the money moment (revenue-share recorded). It needs browse (P1) to find a listing and — for a live demo — benefits from listing (P2) to create one, so it comes last while still being independently testable against a pre-existing listing.

**Independent Test**: With agency B's active listing on the marketplace, sign in as an agent of agency A, license the listing, and verify the confirmation shows a copy identifier and a split whose displayed numbers are exactly the platform's recorded values. License it again and verify the "already licensed" explanation.

**Acceptance Scenarios**:

1. **Given** another agency's active listing, **When** the agent licenses it, **Then** they see a confirmation with the white-label copy's identifier and the recorded split — fee, seller credit, platform take, currency — exactly as returned.
2. **Given** a listing published by the agent's own agency, **When** they attempt to license it, **Then** the action is refused with an "own listing" explanation (the browse row never offers a license action on own listings).
3. **Given** a listing the agency has already licensed, **When** they license it again, **Then** they see an "already licensed" explanation and no second copy or charge is recorded.
4. **Given** a licensing attempt that the platform refuses because a side is not vetted or the listing is no longer active, **When** the refusal returns, **Then** the agent sees a distinct plain-language explanation for that exact reason.

---

### Edge Cases

- Marketplace has no active listings → browse renders an inviting empty state, not an error or blank page.
- Agent's agency has no itineraries → listing form is explicit about why it cannot be used yet and where to go (the planner).
- The session expires (or the user signs out in another tab) between page load and an action → the action fails with a human-readable sign-in message, not a raw authorization error.
- Two refusal shapes carry extra data (provenance issues list; existing listing/license identifiers) → the message renders the useful detail without exposing raw payloads.
- A listing is deactivated (or licensed by someone else) between browse render and the agent's action → the typed refusal from the platform ("no longer active" / "already licensed") is what the agent sees; the page recovers by refreshing browse.
- Network failure mid-action → a retryable, human-readable message; no optimistic UI state pretends the action succeeded.
- Rating aggregates: a rated listing shows average and count; an unrated one shows an explicit unrated state — the UI never invents a default score.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The marketplace page MUST live in the agent workspace surface: a verified agent sees the marketplace; an anonymous visitor or non-agent sees the workspace membership prompt and no marketplace data (INV-024 page gate; authorization for data stays with the platform per INV-023).
- **FR-002**: Browse MUST show every active listing across all agencies — title, seller agency name, license fee with currency, revenue-share terms, license terms, and rating average/count with an explicit unrated state — and MUST mark listings owned by the viewing agent's agency as theirs.
- **FR-003**: Every displayed money value MUST be exactly a value returned by the platform. The single permitted client-side numeric conversion is mapping the license-fee input from major units to the platform's integer minor-unit input (the planner budget input precedent); display of any amount performs formatting only, never arithmetic.
- **FR-004**: The listing form MUST offer a picker of the viewing agency's OWN itineraries only (tenant-scoped, INV-004), collect listing title, license fee, license terms, and revenue-share percentage, and submit to the existing listing-creation procedure. The revenue-share percentage input maps to the platform's basis-point unit (0–100% in steps the platform accepts).
- **FR-005**: Every typed listing refusal MUST map to a distinct human-readable message — not vetted, already listed, provenance incomplete (including the reported issues), not found — and the mapping MUST be exhaustive over the platform's refusal set so a new refusal reason cannot silently reach the page as raw data.
- **FR-006**: Browse rows for other agencies' listings MUST offer a license action; on success the UI MUST confirm the white-label copy (its identifier) and the recorded revenue split — fee, seller credit, platform take, currency — exactly as returned. Own listings MUST NOT offer a license action.
- **FR-007**: Every typed licensing refusal MUST map to a distinct human-readable message — own listing, not active, already licensed, not vetted — exhaustively, as in FR-005.
- **FR-008**: Transport and authorization failures (signed-out, forbidden, network) MUST surface as human-readable messages consistent with the workspace's existing failure wording.
- **FR-009**: Every user-visible failure or refusal string MUST come from pure, DOM-free helper functions covered by unit tests (the established workspace pattern), so wording is testable without a browser.
- **FR-010**: The platform MUST expose a small agent-gated read of the viewing agency's own itineraries (identifier, title, currency) for the picker — tenant-scoped per INV-004 with no cross-tenant leakage, and covered by a test proving another agency's itineraries are never returned.
- **FR-011**: After a successful listing or licensing action, browse MUST reflect the new marketplace state without requiring a manual page reload.
- **FR-012**: Presentation MUST use the established premium theme kit (.tf-* component classes) — polished, sell-grade surfaces consistent with the planner and booking flows; no bare unstyled HTML.

### Key Entities

- **Marketplace listing (public projection)**: What browse renders — title, seller agency name, license fee (integer minor units + currency), revenue-share terms, license terms, rating average/count, and whether it belongs to the viewing agency. Published, deliberately cross-tenant data only.
- **My itinerary (picker row)**: The minimal tenant-scoped projection of the agency's own itineraries the listing form needs — identifier, title, currency.
- **Listing declaration**: The seller's terms — listing title, license fee, license terms text, revenue-share percentage — submitted when publishing.
- **License confirmation (recorded split)**: The platform's record of a completed license — white-label copy identifier, fee, seller credit, platform take, currency. Displayed verbatim; never recomputed client-side.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from opening the marketplace page to a confirmed license — white-label copy identifier and recorded split on screen — in under 2 minutes without assistance.
- **SC-002**: A listing published by one agency is visible to an agent of another agency on their next browse render — full cross-tenant visibility of active listings with zero leakage of non-listed itinerary data.
- **SC-003**: 100% of the platform's typed refusals across listing and licensing render as distinct plain-language explanations; no raw codes, identifiers-only, or technical payloads reach the page.
- **SC-004**: Every money amount on the page equals a platform-returned value verbatim (verifiable by tests); the recorded split shown after licensing matches the platform's ledger record exactly.
- **SC-005**: Visitors without an agency membership can never observe marketplace data through this page — the page gate and the platform's own refusals both hold.

## Assumptions

- "Finished itinerary" means any itinerary in the agency's workspace (e.g. drafted via the planner); whether it is listable is decided entirely by the platform's provenance-completeness gate at submission — the picker does not pre-filter, so the provenance refusal path is reachable and explained.
- Rating submission and seller deactivation are explicitly out of scope for this feature (the platform procedures exist); browse only displays rating aggregates. A follow-up ticket covers those controls.
- Vetting is decided server-side; this UI only explains vetting refusals, it never displays or edits vetting state.
- The marketplace page is reachable from the workspace (navigation affordance from the existing workspace surface); deep-linking to it while signed out shows the membership prompt.
- The existing marketplace procedures (browse/create/license) and their typed outcomes are stable and already verified by the trade-layer feature's own tests (spec 006); this feature adds no new money semantics, no schema changes, and no supplier-facing behavior.
