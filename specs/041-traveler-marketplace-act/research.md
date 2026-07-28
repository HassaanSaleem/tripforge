# Phase 0 Research: Traveler acts on a marketplace itinerary

All questions resolved from the existing codebase (no external unknowns). Each decision cites
the reused seam.

## D1 — "Book as-is" vs "fork": one mechanism or two?

**Decision**: One mechanism. Acting on a listing **always** produces a fresh **copy** (a fork);
the traveler then reaches self-book / request-agent from the copy's standard trip view.

**Rationale**: If a traveler booked the *listed* itinerary directly, `booking_component` rows
would mark that shared itinerary's items booked — polluting the public listing so no other
traveler could book it. A per-traveler copy is required for a multi-buyer listing to stay
bookable. GOAL.md bound (a) already defines the fork as "an agency-owned copy … attach the
signed-in traveler via the existing `client_trip_link`", so "book as-is" collapses into
"fork then self-book". Two UI affordances ("Book this trip" vs "Save & customize") could differ
only by navigation target; v0 exposes a single primary "Plan & book this trip" that forks and
lands on `/view/[token]`.

**Alternatives considered**: (a) book the listed itinerary in place — rejected (pollutes the
listing). (b) an ephemeral copy discarded after booking — rejected (loses "My Trips" history and
the fork provenance).

## D2 — Who owns the forked copy?

**Decision**: The **originating (selling) agency** owns the copy (`itinerary.agency_id =
listing.seller_agency_id`); the traveler is attached via `client_trip_link` (source `"fork"`).
No traveler-owner association.

**Rationale**: Bound (a) verbatim. It also makes every downstream money row (booking, component,
markup_ledger) carry the seller agency exactly as an agent booking would — the same tenancy the
proven `selfBookItinerary` already assumes (tenant from the share link, not the session;
INV-004/024). Distinct from `whiteLabelCopy`, which re-homes to a *reseller* agency and stamps a
license/revenue-share obligation — a fork is neither a license nor a resale, so it must **not**
re-home or stamp revenue-share.

## D3 — Fork copy transform

**Decision**: A new pure `travelerForkCopy(source, { copyId })` = `{ ...source, id: copyId }`
(agencyId unchanged = seller). Mirrors `packages/marketplace/src/white-label.ts` but does NOT
touch `provenance` (no license terms, no rebrand lineage, no reseller re-home). The DB insert
mirrors `licensing.ts`'s copy insert: `{ id, agencyId: seller, title, currency, document,
tripRequest: source.tripRequest, creationSource: source.creationSource }`, re-validated with
`parseItinerary` before write (INV-001). `creationSource` is **inherited** from the source (the
fork's own provenance lives in `marketplace_fork`), so the closed `creation_source` vocabulary
is untouched — no schema-gate change there.

**Rationale**: A faithful copy keeps supplyRefs so the copy is quotable/bookable; keeping
provenance unchanged avoids any revenue-share/ownership semantics change (Constitution VI).

## D4 — How does a fork copy book at the *seller's* price (bound b)?

**Decision**: Extend `deriveMarkupBps` (in `services/booking/self-book.ts`) with a **fork-aware
fallback**: if the itinerary being self-booked has a `marketplace_fork` row, derive markup from
the fork's **source** itinerary's most-recent `booking_quote` (else the platform default);
otherwise unchanged. Single extra indexed query, no recursion.

**Rationale**: A fresh copy has no `booking_quote` of its own, so the existing `deriveMarkupBps`
would fall to `DEFAULT_MARKUP_BPS` (1500) — not the seller's price. Reading the *source* trip's
markup live at book time reflects the seller's **current** sell price (bound b: "existing
marked-up sell price") without snapshotting a stale figure. If the source was never quoted, the
default applies (FR-011: never zero — a traveler must not pay net). The booking itself is 100%
the unchanged `quoteItinerary`/`bookItinerary` path → `markup_ledger` records the seller's
margin, no new take-rate (Constitution VI, INV-010/011).

**Alternatives considered**: (a) snapshot the markup on the fork row — rejected (goes stale if
the seller re-prices). (b) seed a `booking_quote` for the copy at fork time — rejected (quotes
hold live prices and expire; a seeded stale quote is wrong).

## D5 — Traveler-safe marketplace browse

**Decision**: A new cross-tenant read `browseMarketplaceForTraveler` selecting **active**
`marketplace_listing` rows joined to `itinerary` + `organization` (+ `agency_vetting` for the
badge), projecting ONLY client-safe fields: `listingId`, `title`, `agencyName`, `sellerVetted`,
`currency`, `fromTotalMinor`. The "from" total is computed by reusing `toClientItineraryView`
(empty booked-price map) so it equals exactly what the trip view already shows for an unbooked
trip — a single source of truth for "what a visitor may see about a trip" (INV-020). The listing
`priceMinor`/`revenueShareBps`/`licenseTerms` and all net/markup values are **structurally
absent** from the projection (allowlist, not deletion).

**Rationale**: `browseListings` exists but is agent-facing (`agentProcedure`, returns seller
economics). Travelers need a different projection. Reusing `toClientItineraryView` keeps the
browse total consistent with `/view/[token]` and avoids a second money-fold path.

**Alternatives considered**: showing the listing `priceMinor` — rejected (that is the
agent-to-agent license price, meaningless and confidential to a traveler).

## D6 — Fork provenance storage (new table vs reuse)

**Decision**: A new additive bolt-on table `marketplace_fork` (§data-model). NOT a canonical
itinerary field.

**Rationale**: Two needs — (1) record which listing/source a copy came from + the traveler
(provenance/audit), and (2) supply the source-itinerary id for D4's markup fallback. No existing
table links a copy back to its source listing. The bolt-on pattern is exactly how
`traveler_group` / `group_departure` / `marketplace_listing` attach metadata to an itinerary
without touching the canonical schema (schema-group-trips.ts header). Additive + backfill-free
(`db:push`, no backfill) ⇒ no `SCHEMA_VERSION` bump; operator ratify-at-merge per SCHEMA-GATE-78.

## D7 — Anonymous / deactivated / concurrency

**Decision**: Fork is a `protectedProcedure` (any authenticated user) — anonymous callers get
`UNAUTHORIZED` and the UI shows a sign-in prompt (FR-008). Fork validates the listing is
`active` inside its transaction (FOR-consistency) and returns a neutral `not_available` outcome
for missing/inactive listings (no existence oracle, FR-009). Concurrency: each fork mints a
fresh copy id (uuid) + a fresh share link, so simultaneous forks of one listing never collide
(no shared unique key across travelers) — each traveler's copy is independent (FR-004/SC-004).

**Rationale**: Mirrors `selfBook` (protected), `resolveShareLink` (neutral not_found), and the
copy-per-license independence in `licensing.ts`.

## D8 — Request-agent on a fork

**Decision**: Reuse `clientView.requestHandoff` unchanged. Because the fork copy is owned by the
seller agency, `submitTripHandoffRequest` (which resolves the itinerary's current owning agency
from the token) routes the handoff to the **seller** automatically. No new code.

**Rationale**: Bound: the request-agent fork routes demand to the marketplace agent
(Constitution I). The existing handoff already keys on the owning agency.
