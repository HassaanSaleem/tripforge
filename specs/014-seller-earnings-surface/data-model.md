# Data Model: Seller Earnings Surface

No new tables, columns, or migrations. This feature is a read-side
projection over existing rows.

## Computed entities (not persisted)

### `EarningsAggregate` (per listing, seller-scoped)

| Field | Type | Source |
|---|---|---|
| `licenseCount` | integer ≥ 0 | `count(*)` over `revenue_share_ledger` rows joined to `marketplace_license` by `licenseId`, filtered to the listing and the caller's own `sellerAgencyId` |
| `sellerCreditTotalMinor` | integer ≥ 0 (minor units) | `sum(seller_credit_minor)` over the same row set |

Absent listing ids (no licenses yet) are NOT present in the aggregate map —
`browseListings` MUST default a missing entry to `{ licenseCount: 0,
sellerCreditTotalMinor: 0 }` per spec FR-003 (explicit zero, never absent).

### Extended `BrowseListing` (existing interface, `packages/marketplace/src/listings.ts`)

Adds two fields, populated **only** when `mine === true**:

| Field | Type | Notes |
|---|---|---|
| `licenseCount` | `number \| null` | `null` for listings not owned by the caller |
| `sellerCreditTotalMinor` | `number \| null` | `null` for listings not owned by the caller |

### Extended `MyItinerary` (existing interface, `packages/api/src/services/itineraries.ts`)

Adds one field:

| Field | Type | Notes |
|---|---|---|
| `listing` | `{ listingId: string; priceMinor: number; currency: string } \| null` | `null` when the itinerary has no active listing; present with the active listing's fee/currency otherwise |

## Relationships (existing, unchanged)

```
marketplace_listing (1) ──< marketplace_license (1) ──1:1── revenue_share_ledger
        │                                                      │
        │ itineraryId                                          │ sellerAgencyId, resellerAgencyId
        ▼                                                       │
    itinerary (source, seller-owned)                            │
                                                                  ▼
                                                        (aggregated, GROUP BY listingId
                                                         via marketplace_license.listingId)
```

No state transitions are introduced — this feature reads the existing
listing/license/ledger lifecycle (active/inactive listing, one license per
(listing, reseller) pair, one immutable ledger row per license).
