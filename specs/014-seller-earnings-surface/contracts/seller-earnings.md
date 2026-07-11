# Contract: Seller Earnings Reads

Both procedures below already exist and are unchanged in name, auth gate
(`agentProcedure`), and error shape — only their output shape grows.

## §1. `workspace.marketplace.browseListings` (query, no input)

**Existing output** (unchanged fields): `listingId`, `title`, `priceMinor`,
`currency`, `licenseTerms`, `revenueShareBps`, `sellerAgencyId`,
`sellerAgencyName`, `ratingAverage`, `ratingCount`, `mine`.

**New output fields** (added to each listing row):

```ts
licenseCount: number | null;          // null when mine === false
sellerCreditTotalMinor: number | null; // null when mine === false
```

**Contract**:
- When `mine === true`: `licenseCount` and `sellerCreditTotalMinor` are
  always present and numeric (0 when never licensed) — never `null`.
- When `mine === false`: both fields are `null`. The caller MUST NOT be able
  to observe another agency's earnings through this or any other reachable
  field on the row.
- `sellerCreditTotalMinor` is denominated in the listing's own `currency`.

## §2. `workspace.itinerary.list` (query, no input)

**Existing output** (unchanged fields): `id`, `title`, `currency`, `createdAt`.

**New output field**:

```ts
listing: { listingId: string; priceMinor: number; currency: string } | null;
```

**Contract**:
- `listing` is non-null if and only if the itinerary currently has an
  ACTIVE marketplace listing (mirrors `marketplace_listing.status ===
  'active'`).
- `listing.currency` always equals the itinerary's own `currency` (a listing
  is always created in its source itinerary's currency, per `createListing`).
- Deactivating a listing MUST cause this field to become `null` on the next
  read (no caching/staleness beyond the existing read-after-write behavior of
  the underlying query).

## Tenant scoping (both procedures)

Both procedures already run under `agentProcedure`, which derives
`session.agencyId` server-side from the verified session — the client
supplies no tenant identifier. Extending their outputs does not change this;
the new fields are computed from data already scoped to (or filtered by) the
same `session.agencyId` used for every other field on these rows.
