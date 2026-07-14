# Feature Specification: Licensed-Copy & Resale Provenance Badges

**Feature Branch**: `024-licensed-copy-badges`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Ticket seed-0018 (iteration-3 report FEAT-2): after licensing two listings, an agency's
sell-form picker shows two identical "Paris balanced trip (USD)" options that carry materially
different licensed-under obligations — no licensed-copy marker, no lineage hint. Cross-tenant
listing cards carry no platform-authored "resale / generation 2" badge either. A buyer can't tell
a copy-of-a-copy from an original. WITNESS: the zero-context UAT evaluator for PR #31 licensed a
listing and then could not recognize the resulting copy in the sell-form picker — a real,
witnessed false PRODUCT_FAIL over exactly this indistinguishability.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reseller recognizes their own licensed copies (Priority: P1)

An agent licenses a marketplace listing. The white-label copy lands in their own workspace
looking identical to every itinerary they drafted themselves. When they later open the sell-form
picker to list a trip, or just browse their workspace trip list, they cannot tell which entries
are their own originals and which are licensed copies — this is the exact confusion that produced
a false PRODUCT_FAIL in a prior UAT run.

**Why this priority**: This is the highest-frequency, highest-witnessed friction — it hits every
reseller, every time they open the picker after a license, and has already caused a real evaluator
failure.

**Independent Test**: License a listing, then open the sell-form picker and the workspace trip
list — the resulting copy is visibly marked as a licensed copy with the original author's agency
name, distinguishing it from self-authored originals, without reading any free text.

**Acceptance Scenarios**:

1. **Given** an agency has licensed a listing titled "Paris balanced trip (USD)", **When** they
   open the sell-form picker, **Then** the resulting copy's option is marked as a licensed copy and
   names the original author's agency — distinct from any self-authored itinerary of the same
   title.
2. **Given** the same licensed copy, **When** the agency views their workspace trip list, **Then**
   the trip row carries the same licensed-copy marker and attribution.
3. **Given** an itinerary the agency drafted themselves and never licensed, **When** they view the
   picker or trip list, **Then** no licensed-copy marker appears on it.

---

### User Story 2 - Buyer recognizes a resale vs. an original on the marketplace (Priority: P2)

A buyer browsing the marketplace sees listings from other agencies. Some listings are original
work; others are white-label copies the seller themselves licensed and re-listed (a "resale"). The
buyer has no platform-authored way to tell which is which — only the reseller's own voluntary
free-text terms might mention it, and often don't.

**Why this priority**: Real but lower-frequency than US1 — it protects buyer trust in resale
transactions rather than blocking a core reseller workflow every time.

**Independent Test**: License a listing, re-list the resulting copy, then browse the marketplace as
a third agency — the re-listed card shows a platform-authored resale/generation marker (e.g.
"Resale · Gen 2"), independent of whatever the reseller's own license-terms text says.

**Acceptance Scenarios**:

1. **Given** agency B licenses agency A's original listing and re-lists the resulting copy, **When**
   agency C browses the marketplace, **Then** B's card shows a resale/generation marker (this is a
   first license, so "Gen 1").
2. **Given** agency C then licenses B's resale and re-lists it, **When** another agency browses,
   **Then** C's card shows "Gen 2" — one generation deeper than B's.
3. **Given** agency A's original, never-licensed listing, **When** anyone browses the marketplace,
   **Then** no resale/generation marker appears on it.

---

### Edge Cases

- A copy is licensed a second, third, etc. time (chain depth > 1): the generation number reflects
  the full chain length (lineage depth), and the attribution on the picker/workspace-list badge
  always names the FIRST author in the chain, never an intermediate reseller — this already matches
  how `originalAuthorAgencyId` is preserved across chains.
- An itinerary with no marketplace history at all (lineage depth 0): no marker anywhere, on either
  surface — a self-authored original must never look licensed.
- The reseller's own free-text license terms remain visible unchanged; the new markers are
  additive and do not depend on parsing or replacing that text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sell-form picker and the workspace trip list MUST mark any itinerary whose stored
  provenance carries a rebrand lineage of depth ≥ 1 as a licensed copy.
- **FR-002**: The licensed-copy marker on the picker and workspace list MUST show the ORIGINAL
  author's agency name (attribution) — not just a generic "copy" label, and not an intermediate
  reseller's name.
- **FR-003**: Every marketplace listing card (browse view, cross-tenant) whose underlying itinerary
  has a rebrand lineage depth ≥ 1 MUST show a platform-authored resale/generation marker.
- **FR-004**: The generation number shown MUST equal the itinerary's rebrand lineage depth exactly
  (1 for a first license, 2 for a license-of-a-license, etc.) — it is never inferred from the
  reseller's free-text terms.
- **FR-005**: All marker data MUST be derived from the itinerary document's existing stored
  provenance fields (`originalAuthorAgencyId`, `rebrandLineage`) — no new canonical schema fields,
  no canonical schema version bump, no new writes anywhere in this feature.
- **FR-006**: An original itinerary that has never been licensed (rebrand lineage depth 0) MUST show
  no licensed-copy marker and no resale/generation marker on any surface.
- **FR-007**: The reseller's existing free-text license-terms display is unaffected — this feature
  is additive and does not read, parse, or alter that field.
- **FR-008**: Every marker MUST be scoped to reads the caller is already authorized to see (INV-004
  tenant scoping for the picker/workspace list; the existing cross-tenant public-projection scoping
  for listing cards) — no marker calculation may leak data the caller could not already see.

### Key Entities

- No new entities. Reuses the canonical itinerary document's existing `provenance` fields:
  `rebrandLineage` (array of source itinerary ids — its length is the generation/lineage depth) and
  `originalAuthorAgencyId` (the first author's agency id, preserved across resale chains).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who just licensed a listing can identify, without reading any free text or
  opening the trip, that the resulting workspace entry is a licensed copy and who originally
  authored it — in the same glance as picking it from the sell-form picker or scanning the trip
  list.
- **SC-002**: A marketplace buyer can distinguish a first-generation listing from a deeper resale
  by generation number alone, without relying on the seller's voluntary terms text.
- **SC-003**: 100% of itineraries with rebrand lineage depth ≥ 1 show the appropriate marker on
  every surface this feature covers (picker, workspace list, cross-tenant cards); 0% of
  lineage-depth-0 itineraries show any such marker.
- **SC-004**: The false-PRODUCT_FAIL class witnessed in the PR #31 UAT run (evaluator unable to
  recognize a licensed copy in the picker) does not recur for the same scenario.

## Assumptions

- "Original-author attribution" means the FIRST author's agency name (`originalAuthorAgencyId`),
  matching how that field is already defined and preserved across resale chains — not the
  immediate licensor in a multi-generation chain.
- The cross-tenant listing card's resale/generation marker does not require author attribution
  (the seller's own agency name is already shown on every card); it is a depth/generation
  indicator only, per the ticket's own example ("Resale · Gen 2").
- Displaying the copy's licensed-under revenue-share TERMS is explicitly out of scope (it
  intersects a separate pending operator decision on resale-share semantics) — this feature only
  adds provenance-derived badges, never terms.
- This is a read-side projection and presentation change only; no database migration, no new
  tables/columns, no change to the licensing write path.
