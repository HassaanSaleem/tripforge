# Feature Specification: Seller Earnings Surface

**Feature Branch**: `014-seller-earnings-surface`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Seller earnings surface for the marketplace (ticket seed-0030). The seller side of a marketplace trade currently has no read surface for its own revenue. A real first-sale split is conserved correctly in revenue_share_ledger, but the seller can never see it: browseListings (the seller's only marketplace read) carries zero earnings keys, no workspace.marketplace.earnings/.licenses procedure exists, the listing card shows only rating/terms (identical whether licensed 0 or 50 times), and the workspace trip view never marks a trip as \"Listed\". Requirements: (1) a seller-scoped read (extend browseListings or add a new procedure) returns license count + seller-credit total per listing, aggregated from revenue_share_ledger, scoped so a seller only ever sees aggregates for their OWN sellerAgencyId (INV-004 tenant scoping) — other agencies' listings must not leak earnings data; (2) the marketplace panel renders the earnings figure on the seller's own listing card (mine: true only); (3) the workspace trip view shows a \"Listed\" mark (with fee/currency) for a trip with an active listing, extending workspace.itinerary.list; (4) L3 test: license a listing N times, assert the seller's projection reports N licenses and the exact conserved seller-credit sum; (5) no change to the fixed-take-rate split semantics or the revenue_share_ledger schema — this is read-side projection + UI only, no canonical schema version bump, no money-semantics change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what a listing has earned (Priority: P1)

A seller agency has listed a finished itinerary on the marketplace and other
agencies have licensed it one or more times. The seller opens the marketplace
page and, on their own listing's card, sees how many times it has been
licensed and the total amount they have earned from it (their credit share,
not the buyer's full fee).

**Why this priority**: This is the core gap the ticket exists to close — the
platform correctly pays sellers today but never tells them, undermining trust
in the "earn a share on every resale" promise that is the marketplace's core
value proposition to the supply side.

**Independent Test**: Can be fully tested by having one agency list a trip,
having a second and third agency license it, then loading the marketplace
page as the first agency and confirming the listing card shows "2 licenses"
and the exact sum of the two seller-credit amounts.

**Acceptance Scenarios**:

1. **Given** a seller's listing has never been licensed, **When** the seller
   views their listing card on the marketplace page, **Then** the card shows
   zero licenses and zero earnings (not a blank or missing figure).
2. **Given** a seller's listing has been licensed 2 times, **When** the seller
   views their listing card, **Then** the card shows "2" as the license count
   and the exact sum of the seller's credited amount across both licenses,
   formatted in the listing's currency.
3. **Given** a listing belongs to another agency, **When** the current agency
   browses the marketplace, **Then** that listing's card shows no earnings
   figure for the current agency (earnings are seller-only, never public).

---

### User Story 2 - Know which of my trips are on the marketplace (Priority: P2)

An agent opens their workspace trip list and wants to know, without going to
the marketplace page, which of their trips currently have an active listing
and for how much they are listed.

**Why this priority**: Complements User Story 1 — sellers manage their trips
from the workspace first and the marketplace second; a "Listed" indicator
where they already look closes a natural sibling gap (seed-0027 lineage) at
low incremental cost once the same underlying data is read-side available.

**Independent Test**: Can be fully tested by listing one of an agency's trips
on the marketplace, then loading that agency's workspace trip list and
confirming the listed trip (and only that trip) shows a "Listed" mark with
its fee and currency.

**Acceptance Scenarios**:

1. **Given** a trip has an active marketplace listing, **When** the seller
   views their workspace trip list, **Then** that trip's row shows a "Listed"
   mark with the listing's fee and currency.
2. **Given** a trip has never been listed, or its listing was deactivated,
   **When** the seller views their workspace trip list, **Then** that trip's
   row shows no "Listed" mark.

---

### Edge Cases

- A listing with zero licenses MUST show an explicit zero, not an absent or
  undefined figure (a seller must never wonder whether zero means "no data"
  or "no sales").
- A deactivated (no longer active) listing carries no "Listed" mark in the
  workspace trip list, since it is no longer live on the marketplace — but
  its historical earnings remain visible on the marketplace page if the
  listing card is still reachable, so a seller never loses the record of past
  income when they take a trip off the market. (Marketplace page only shows
  active listings today per existing behavior; this feature does not change
  that — see Assumptions.)
- Cross-tenant safety: an agency must never be able to read another agency's
  earnings figures, whether by browsing the marketplace or by any other
  reachable request shape.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The marketplace read available to a seller MUST report, for
  each of the seller's own active listings, the total number of times it has
  been licensed and the total seller-credit amount earned from it, both
  aggregated from the existing revenue-share ledger.
- **FR-002**: The earnings figures MUST be exact — the license count MUST
  equal the number of completed licenses on that listing, and the seller
  credit total MUST equal the exact sum of the conserved per-license seller
  credit amounts (no rounding beyond the currency's existing minor-unit
  precision).
- **FR-003**: A listing with no licenses MUST report a license count of zero
  and a seller-credit total of zero, not a missing or null figure.
- **FR-004**: Earnings figures for a listing MUST only ever be visible to the
  listing's own seller agency; no request shape available to any other
  agency may return another agency's earnings for that listing.
- **FR-005**: The marketplace page MUST display the license count and
  earnings total on the seller's own listing card; listing cards belonging to
  other agencies MUST NOT display an earnings figure to the current viewer.
- **FR-006**: The workspace trip list MUST indicate, for each of the agency's
  own trips, whether it currently has an active marketplace listing.
- **FR-007**: When a trip has an active listing, the workspace trip list MUST
  show the listing's fee and currency alongside the "Listed" indicator.
- **FR-008**: When a trip has no active listing, the workspace trip list MUST
  show no "Listed" indicator for that trip.
- **FR-009**: This feature MUST NOT alter the revenue-share split calculation,
  the fixed take-rate semantics, or the revenue-share ledger's schema — it is
  read-side aggregation and presentation only.
- **FR-010**: This feature MUST NOT require a canonical itinerary schema
  version change.

### Key Entities

- **Listing earnings aggregate**: A per-listing, seller-scoped summary
  derived from existing license and revenue-share records — license count and
  total seller credit. Not a new persisted entity; computed on read.
- **Trip listing indicator**: A per-trip, seller-scoped fact derived from
  whether an active marketplace listing currently references that trip, plus
  that listing's fee and currency. Not a new persisted entity; computed on
  read.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seller can determine, within one page view of the
  marketplace, exactly how many times each of their listings has sold and
  exactly how much they have earned from it — with zero manual calculation.
- **SC-002**: A seller can determine, within one page view of their
  workspace, which of their trips are currently live on the marketplace and
  for what fee — without navigating to the marketplace page.
- **SC-003**: In a test where a listing is licensed N times by independent
  buyers, the seller's earnings view reports exactly N licenses and a seller
  credit total exactly equal to the sum of the conserved per-license credit
  amounts — zero discrepancy.
- **SC-004**: No agency, in any test of cross-tenant access, can observe
  another agency's earnings figures for a listing it does not own.

## Assumptions

- Earnings are reported per active listing, matching the existing
  marketplace browse surface's scope (active listings only); a deactivated
  listing's historical earnings are out of scope for this feature's UI
  surfaces beyond what the existing marketplace page already shows, since
  changing what happens to deactivated listings on the marketplace page is a
  separate concern from this ticket.
- The workspace "Listed" indicator only reflects listings created by the same
  agency viewing its own trip list (an agency's own listings, never another
  agency's).
- Currency for a listing's earnings is the listing's own currency (no
  cross-currency aggregation), consistent with how the platform already
  avoids cross-currency money math elsewhere.
- This feature reuses existing tenant-scoping guarantees (INV-004) already
  proven for the marketplace and workspace read surfaces; it does not
  introduce a new authorization mechanism.
