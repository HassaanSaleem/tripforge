# Contract: `workspace.marketplace.*` (tRPC)

All procedures are `agentProcedure`-gated (INV-023/024): anonymous → 401
UNAUTHORIZED; traveler (no agency) → 403 FORBIDDEN. Business refusals are typed
VALUES in the response (booking-router precedent); TRPCErrors are reserved for
auth/validation/not-found. All money is integer minor units + currency
(INV-009). `NOT_FOUND` is thrown when the referenced entity does not exist OR
is outside the caller's legitimate visibility.

## §1 `createListing` (mutation) — FR-001..005

Input (zod, strict):

```ts
{
  itineraryId: uuid,        // must be owned by caller's agency (tenant-scoped)
  title: string (1..200),
  priceMinor: int >= 0,     // in the itinerary's currency
  licenseTerms: string (1..2000),
  revenueShareBps: int 0..10000
}
```

Outcomes (discriminated on `status`):

- `{ status: "listed", listingId, itineraryId }` — listing active; source
  document now carries stamped provenance (author + terms + bps).
- `{ status: "not_vetted" }` — caller's agency has no vetting grant (FR-002).
- `{ status: "already_listed", listingId }` — an ACTIVE listing exists for
  this itinerary (D9).
- `{ status: "provenance_incomplete", issues: string[] }` — stamped document
  still fails the listed-itinerary rule (FR-004).
- throws `NOT_FOUND` — itinerary absent or not owned by caller's agency.

## §2 `browseListings` (query) — FR-006

Input: `{}` (v0 — no filters/pagination). Cross-tenant BY DESIGN (research D7):
returns only `status = 'active'` listings projected to public fields.

```ts
{ listings: Array<{
    listingId, title, priceMinor, currency, licenseTerms, revenueShareBps,
    sellerAgencyId, sellerAgencyName,
    ratingAverage: number | null,   // 1 d.p.; null when unrated
    ratingCount: number,
    mine: boolean                    // caller is the seller
} > }
```

## §3 `deactivateListing` (mutation) — FR-007

Input: `{ listingId: uuid }`. Seller-only (tenant-scoped).

- `{ status: "deactivated", listingId }`
- `{ status: "already_inactive", listingId }`
- throws `NOT_FOUND` — listing absent or not the caller's.

## §4 `licenseListing` (mutation) — FR-008..012, INV-012

Input: `{ listingId: uuid }`.

One database transaction (all-or-nothing; INV-011/012 — see research D8):
license row + revenue-share ledger row (price = platformTake + sellerCredit,
`splitTakeRate` at `DEFAULT_PLATFORM_TAKE_RATE_BPS = 1000`) + white-label copy
itinerary row + PMF events (`take_rate_accrued` → seller,
`trip_created(source=licensed)` → reseller).

Outcomes:

- `{ status: "licensed", licenseId, copyItineraryId, priceMinor,
    platformTakeMinor, sellerCreditMinor, currency }`
- `{ status: "not_vetted" }` — caller's agency not vetted, or the listing's
  SELLER agency no longer vetted at license time (FR-002; both sides vetted at
  v0 — the seller side is re-checked inside the license transaction; seed-0006a).
- `{ status: "own_listing" }` — caller is the seller (FR-012).
- `{ status: "not_active" }` — listing deactivated (FR-007 edge; also the
  losing side of a deactivation race).
- `{ status: "already_licensed", licenseId }` — caller's agency already holds
  a license (FR-012; concurrent duplicates — exactly one `licensed` outcome).
- throws `NOT_FOUND` — listing does not exist.

## §5 `rateListing` (mutation) — FR-013

Input: `{ listingId: uuid, stars: int 1..5, comment?: string (..1000) }`.

- `{ status: "rated", listingId, stars, ratingAverage, ratingCount }` —
  insert or replace (one rating per agency per listing).
- `{ status: "not_licensee" }` — caller's agency holds no license (FR-013).
- throws `NOT_FOUND` — listing does not exist.
- stars outside 1..5 → zod validation error (thrown, not a typed outcome).

## §6 Operator action (out-of-band, not tRPC) — FR-001

`node packages/db/scripts/vet-agency.mjs <agency-slug-or-id>` — inserts the
`agency_vetting` row (idempotent; prints the resulting state). Platform
operator only; no product surface reaches it.
