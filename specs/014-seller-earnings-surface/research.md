# Research: Seller Earnings Surface

## D1: Where does the per-listing earnings aggregate live?

**Decision**: A new `earningsAggregates(db, sellerAgencyId, listingIds)` helper
in `packages/marketplace/src/earnings.ts`, called from `browseListings` in
`packages/marketplace/src/listings.ts` — mirroring the existing
`ratingAggregates(db, listingIds)` helper in `ratings.ts` exactly (same
group-by-then-Map shape, same call site pattern inside `browseListings`).

**Rationale**: `browseListings` already computes one per-listing aggregate
(`ratingAggregates`) and merges it into the response row-by-row. Adding a
second aggregate the same way is the smallest, most consistent change —
no new procedure, no new router entry, no new client call site. The ticket's
own file pointers name `browseListings` as the extension point.

**Alternatives considered**:
- *New `workspace.marketplace.earnings` procedure*: rejected — doubles the
  client round-trips the marketplace panel needs on load (it already loads
  `browseListings` and `itinerary.list` in parallel); the aggregate is cheap
  and small (one seller's own listings), so a second query for the same
  screen adds latency and a second loading state for no benefit.
- *Denormalized counter columns on `marketplace_listing`*: rejected — would
  require a schema migration and a second write path to keep in sync with
  `revenue_share_ledger`, violating the "read-side only, no schema change"
  constraint and introducing a new drift risk the ledger doesn't have today.

## D2: How is the aggregate scoped so no agency can see another's earnings?

**Decision**: `earningsAggregates` takes `sellerAgencyId` as a required
parameter and its query filters `revenueShareLedger.sellerAgencyId =
sellerAgencyId` (a column that already exists on the ledger row per
`schema.ts:371`) in addition to `listingId IN (...)`. `browseListings` calls
it ONCE with `actor.agencyId` and ONLY the caller's own listing ids (filtered
from the already-loaded rows by `sellerAgencyId === actor.agencyId`), then
merges the result onto `mine: true` rows only; every other row gets no
earnings field.

**Rationale**: Filtering at the query (not just at render time) means the
database itself never returns another agency's revenue rows to this code
path — there is no intermediate state where all-agencies data is fetched and
then filtered client-side, which is the same "narrow at the source" pattern
`scopedWhere` already establishes elsewhere in the codebase (INV-004).

**Alternatives considered**:
- *Fetch aggregates for all listing ids, filter at merge time*: rejected —
  would require dropping the `sellerAgencyId` filter, computing every agency's
  earnings on every browse call, and trusting application code alone not to
  leak it in the response — a strictly weaker guarantee for no performance
  benefit (the caller's own listings are a small, already-filtered subset).

## D3: How does `sum()` reach the marketplace package without a deep drizzle import?

**Decision**: Add `sum` to the existing drizzle re-export line in
`packages/db/src/index.ts` (`export { and, avg, count, desc, eq, gt, inArray,
isNull, or } from "drizzle-orm"`), the same barrel that already re-exports
`avg`/`count` for `ratingAggregates`.

**Rationale**: INV-017 forbids deep drizzle imports outside `@tripforge/db`;
`avg` and `count` were added to this exact line for the same reason when
`ratingAggregates` was built. `sum` is the next aggregate function needed and
belongs in the same barrel, not a new import path.

**Alternatives considered**:
- *Compute the sum in application code after fetching raw rows*: rejected —
  for a per-listing group-by this means fetching every ledger row for every
  license instead of one aggregated row per listing; strictly more data over
  the wire for the same answer, and inconsistent with the `ratingAggregates`
  precedent this feature mirrors.

## D4: How does the workspace trip list learn a trip is listed?

**Decision**: Extend `listItineraries` (`packages/api/src/services/
itineraries.ts`) with a LEFT JOIN from `itinerary` to `marketplaceListing`
on `itineraryId` AND `status = 'active'`. The partial unique index
`marketplace_listing_active_itinerary_idx` already guarantees at most one
active listing per itinerary (schema.ts:326), so the join cannot multiply
rows.

**Rationale**: `listItineraries` is already the tenant-scoped, per-agency
itinerary read (INV-004 proven); a trip belongs to exactly one agency, and
its active listing (if any) belongs to that same agency by construction
(`createListing` requires `scopedWhere` ownership before listing), so no
additional tenant check is needed beyond the existing `scopedWhere` on the
itinerary itself.

**Alternatives considered**:
- *Have the UI call `browseListings` separately and cross-reference by
  itineraryId*: rejected — `browseListings` returns only listings' own ids,
  not the source itineraryId, and is cross-tenant-shaped (all agencies'
  active listings); reusing it would mean filtering a larger, differently-
  scoped result set client-side for a per-itinerary fact that belongs beside
  the itinerary itself.

## D5: Currency handling

**Decision**: No cross-currency aggregation. A listing has exactly one
currency (`marketplace_listing.currency`); its earnings are summed and
displayed in that same currency. The workspace "Listed" mark shows the
listing's own currency for its own fee. No conversion, no multi-currency
total across a seller's several listings.

**Rationale**: Matches the platform's existing avoidance of cross-currency
money math (per-itinerary/per-listing currency is authoritative everywhere
else — `formatMinorAmount(amount, currency)` never sums across currencies).

**Alternatives considered**:
- *A single cross-listing earnings total in the seller's "home" currency*:
  rejected — no such concept exists yet on an agency, and inventing one would
  require a currency-conversion decision this ticket does not ask for.
