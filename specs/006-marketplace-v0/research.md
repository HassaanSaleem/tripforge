# Phase 0 Research: Marketplace v0

All Technical Context unknowns resolved. Each decision records what was chosen,
why, and what was rejected.

## D1 — Package placement: `packages/marketplace` with `(db, actor, input)` functions

**Decision**: New `packages/marketplace` exporting flow functions
(`createListing`, `browseListings`, `deactivateListing`, `licenseListing`,
`rateListing`, `isVetted`) that take the Drizzle `Db` handle and a plain
`MarketplaceActor { agencyId, userId }` — not the api `Container`, not the tRPC
session type.

**Rationale**: the ticket mandates the package ("Lives in packages/marketplace").
Taking `Db` + a plain actor avoids a dependency on `packages/api` (which owns
`Container`/session types) — no cycle, and the trade layer gets its own bounded
package to grow through P1 (Constitution I: the moat). The api routers stay thin
adapters exactly like `routers/booking.ts`.

**Alternatives considered**: service module inside `packages/api/src/services/`
(the seed-0005 booking precedent) — rejected: contradicts the ticket text and
would couple moat logic to the api plumbing package.

## D2 — Vetting storage: marketplace-owned `agency_vetting` table + operator script

**Decision**: `agency_vetting(agency_id PK → organization.id, vetted_at,
vetted_by)`. An agency is vetted iff its row exists. Granting is a platform
operator action: `node packages/db/scripts/vet-agency.mjs <agency-slug-or-id>`
(runs against `DATABASE_URL`; usable inside the compose stack). Both listing
creation AND licensing require the caller's agency to be vetted (spec FR-001/002,
D-0006.a).

**Rationale**: the `organization` table is Better Auth plugin territory — adding
platform columns there risks fighting the auth library's schema expectations.
Vetting is marketplace-domain state; a marketplace table keeps ownership clean
and the grant path auditable (`vetted_by`, `vetted_at`). A script (not a UI, not
a self-serve endpoint) is the smallest honest P0 implementation of
"operator-only" — it cannot be reached from any product surface.

**Alternatives considered**: (a) column on `organization` — rejected (auth-plugin
ownership); (b) inherit the accidental anyone-who-signs-up default — rejected:
the exact IMP-1 finding this spec exists to close (Constitution VI "vetted
agents list"); (c) an `agencyAdminProcedure` self-vetting endpoint — rejected:
self-serve vetting is not vetting.

## D3 — Ledger shape: single-row conservation identity per license

**Decision**: `revenue_share_ledger(id, license_id UNIQUE → marketplace_license,
seller_agency_id [tenant], reseller_agency_id, price_minor, platform_take_minor,
seller_credit_minor, currency, created_at)` — one row per license carrying the
full split; conservation (`price = take + credit`) is a row-local identity.

**Rationale**: mirrors the house `markup_ledger` pattern (one row, `markup =
sell − net` identity) — reviewers and conservation assertions check one row, not
a reconstruction across rows. Tenancy (INV-004): the row's owning tenant is the
seller (whose revenue it records); the reseller id is context. `UNIQUE(license_id)`
makes double-recording impossible even if a future caller bypasses the flow.

**Alternatives considered**: two rows (seller-credit entry + platform-take
entry) — rejected: the platform is not a tenant (no `agency_id` for its row —
violates the INV-004 shape), and conservation would need a cross-row invariant.
spec.md's Key Entities wording was aligned to the single-row identity during
Phase 1 (spec not yet reviewed; same-cycle refinement, not a post-review edit).

## D4 — PMF events: reuse `take_rate_accrued` + `trip_created(licensed)`; add two no-money types

**Decision**: inside the license transaction emit (INV-021):
- `take_rate_accrued { agencyId: sellerAgencyId, amountMinor: platformTakeMinor, currency, itineraryId: copyId, actorUserId }` — existing type; measures take-rate revenue per active agent.
- `trip_created { agencyId: resellerAgencyId, itineraryId: copyId, source: "licensed", actorUserId }` — existing type; feeds resold:self-built ratio.

Additively extend the closed vocabulary (normal SDD flow, per the pmf-events
module doc) with two no-money types: `listing_created { agencyId, itineraryId }`
and `listing_rated { agencyId, itineraryId }` — emitted in the listing/rating
transactions. No `pmf_event` table change (both are no-money, itinerary-ref'd).

**Rationale**: the two constitution-mandated marketplace metrics are fully
served by existing types; the two additions give liquidity observability
(listings created, ratings flowing) without new columns. `booking_confirmed`
(GBV) is NOT emitted — a license fee is not booked trip value.

**Alternatives considered**: a `listing_licensed` money event — rejected:
duplicates `take_rate_accrued` + the ledger row; GBV-polluting.

## D5 — Split math: `splitTakeRate(price, takeRateBps)` in `packages/domain`, floor take

**Decision**: pure function in `packages/domain/src/money.ts`:
`splitTakeRate(price: Money, takeRateBps: number): { platformTake: Money;
sellerCredit: Money }` with `platformTake = floor(price.amountMinor ×
takeRateBps / 10000)` and `sellerCredit = price − platformTake`. Integer minor
units only; bps validated 0–10000; throws `MoneyError` on violations (same
error type as the existing money functions). Conservation is exact by
construction. Default take rate: named constant
`DEFAULT_PLATFORM_TAKE_RATE_BPS = 1000` in `packages/marketplace` config
(D-0006.b — config value, operator-changeable without schema work).

**Rationale**: INV-010 (take-rate math only in domain). Floor on the platform's
take resolves sub-minor-unit remainders in the seller's favor — the platform
never rounds revenue up in its own favor (trust posture, Constitution VI).
Matches the integer-division style of `applyMarkupBps`/`splitByWeightsMinorUnits`.

**Alternatives considered**: round-half-even — rejected: needs a tie-break
justification either way; floor is the simplest seller-favoring rule and exact
conservation holds regardless.

## D6 — Forced-failure conservation test: executor-boundary fault injection

**Decision**: the L3 conservation test (SC-002/FR-011) wraps the `Db` handle in
a test-side proxy whose transaction executor throws after N successful inserts
(fault positioned after license + ledger inserts, before/at the copy insert),
then asserts the transaction left ZERO new rows in `marketplace_license`,
`revenue_share_ledger`, `itinerary`, and `pmf_event`.

**Rationale**: same seam philosophy as the seed-0005 L3 suite (test double at
the boundary — there the supply port, here the db executor). No test hooks in
product code; Postgres transaction semantics do the conserving, the test
proves it.

**Alternatives considered**: constraint-violation injection (pre-seeding a
conflicting row) — kept as a second, cheaper probe for the duplicate-license
race (unique violation path) but insufficient alone: it exercises only the
first insert, not a mid-transaction fault.

## D7 — Cross-tenant browse: the one deliberate INV-004 carve-out, bounded

**Decision**: `browseListings` reads listings of OTHER tenants by design —
filtered to `status = 'active'` and projected to public listing fields (title,
price, terms, revenue-share bps, seller agency name, rating aggregate). Every
other path is tenant-scoped with `scopedWhere` (listing management by seller;
license reads by either party via explicit two-sided predicate; ratings by
rater). No client data, trip-request data, or non-listed itinerary content is
exposed in browse results (client ownership — Constitution VI).

**Rationale**: a marketplace is definitionally cross-tenant on its public
surface; INV-004's intent (no tenant reads another tenant's PRIVATE data) is
preserved by projecting only seller-published fields. This is documented here
so the review gate reads it as designed, not as drift.

**Alternatives considered**: none viable — a tenant-scoped marketplace cannot
create liquidity.

## D8 — Listing/copy document lifecycle

**Decision**: `createListing` runs one transaction: load the source itinerary
(tenant-scoped, owner-only), parse (`parseItinerary`), stamp provenance via the
existing `stampProvenance(document, sellerAgencyId, {licenseTerms,
revenueShareBps})`, validate the result against `ListedItinerarySchema`
(typed `provenance_incomplete` refusal on failure), persist the stamped
document back to the source row, insert the listing, emit `listing_created`.
`licenseListing` runs one transaction: `SELECT … FOR UPDATE` on the listing row
(serializes against deactivation and concurrent licensing), re-check
`status='active'`, vetting, non-self; insert license (unique violation →
typed `already_licensed`); compute split (`splitTakeRate`); insert ledger row;
build the copy via the pure `whiteLabelCopy` transform (new document id = the
new row's app-generated uuid, `agencyId` re-homed to the reseller, original
author preserved — `stampProvenance` semantics — license terms + bps stamped,
`rebrandLineage` extended with the SOURCE itinerary row id); insert the copy
itinerary row (document + inherited `trip_request` so re-quoting works);
emit both PMF events. Any failure rolls the whole transaction back (INV-011).

**Rationale**: INV-012 verbatim ("a resale/license cannot complete without its
recorded split") — the split rows and the copy exist iff the license exists.
Stamping the SOURCE at listing time makes INV-002 ("marketplace-listed
itineraries carry mandatory provenance") true of the listed original, not just
the copy. FOR UPDATE on the listing is the same serialization tool the booking
claim gate uses (id-ordered `FOR UPDATE`), reused at smaller scale.

**Alternatives considered**: validating without persisting the stamp —
rejected: the listed itinerary itself must carry provenance (INV-002), not
merely be capable of it.

## D9 — One active listing per itinerary

**Decision**: partial unique index `UNIQUE (itinerary_id) WHERE status =
'active'` on `marketplace_listing` (Drizzle `uniqueIndex().on(…).where(…)`),
plus a typed `already_listed` refusal from the insert path.

**Rationale**: prevents duplicate supply and split ratings for one trip (spec
edge case). A partial index enforces it under any interleaving, including
callers that bypass the service — same backstop philosophy as
`booking_component_itinerary_item_idx` (spec-gap-0002 precedent). Re-listing
after deactivation stays possible (the old row is `inactive`).

**Alternatives considered**: check-then-insert without the index — rejected:
racy; the house rule is claim/constraint over read-check.
