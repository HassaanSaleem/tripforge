# Data Model: Marketplace v0

All tables live in `packages/db/src/schema.ts` (Drizzle, applied via
`drizzle-kit push`). Conventions inherited from spec 005: uuid PKs
(`defaultRandom`), money as `bigint` integer minor units + explicit `currency`
text (INV-009), tenant `agency_id → organization.id` (INV-004), timestamps
`defaultNow`.

## agency_vetting — the who-may-list gate (FR-001/002, research D2)

| Column | Type | Notes |
|--------|------|-------|
| agency_id | text PK → organization.id (cascade) | vetted iff the row exists |
| vetted_at | timestamp NOT NULL defaultNow | |
| vetted_by | text NOT NULL | operator note/identifier — audit trail |

Written ONLY by the operator action (`packages/db/scripts/vet-agency.mjs`);
no product code path inserts here. Read by `isVetted(db, agencyId)`.

## marketplace_listing (FR-003/005/006/007, research D8/D9)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| seller_agency_id | text NOT NULL → organization.id (cascade) | tenant owner (INV-004) |
| itinerary_id | uuid NOT NULL → itinerary.id (cascade) | the listed source itinerary |
| title | text NOT NULL | listing headline |
| price_minor | bigint NOT NULL, >= 0 (app-validated) | license fee, integer minor units |
| currency | text NOT NULL | = the itinerary's single currency |
| license_terms | text NOT NULL | human-readable terms (also stamped in provenance) |
| revenue_share_bps | bigint NOT NULL, 0–10000 (app-validated) | obligation stamped into copies |
| status | text NOT NULL | `active` \| `inactive` |
| created_at | timestamp NOT NULL defaultNow | |
| deactivated_at | timestamp NULL | set when status → inactive |

Indexes: `uniqueIndex(itinerary_id).where(status = 'active')` — at most one
ACTIVE listing per itinerary (D9 backstop); `index(seller_agency_id)` for
management reads.

State transitions: `active → inactive` (seller deactivation; one-way at v0 —
re-listing creates a new row).

## marketplace_license (FR-008/012, research D8)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| listing_id | uuid NOT NULL → marketplace_listing.id | |
| seller_agency_id | text NOT NULL → organization.id | denormalized from listing (two-sided reads) |
| reseller_agency_id | text NOT NULL → organization.id | the buyer |
| copy_itinerary_id | uuid NOT NULL → itinerary.id | the white-label copy produced by this license |
| price_minor | bigint NOT NULL | price paid (snapshot of listing price) |
| currency | text NOT NULL | |
| created_at | timestamp NOT NULL defaultNow | |

Indexes: `UNIQUE (listing_id, reseller_agency_id)` — duplicate-license gate
(FR-012), decides concurrent races (exactly one insert wins);
`index(reseller_agency_id)`.

Tenancy: visible to EITHER party (`seller_agency_id = X OR reseller_agency_id
= X`) — explicit two-sided predicate, documented INV-004 shape (research D7).

## revenue_share_ledger (FR-008/010/011, research D3)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| license_id | uuid NOT NULL UNIQUE → marketplace_license.id (cascade) | exactly one split per license |
| seller_agency_id | text NOT NULL → organization.id | tenant owner — the revenue is the seller's economics |
| reseller_agency_id | text NOT NULL → organization.id | context |
| price_minor | bigint NOT NULL | conservation identity: price = take + credit |
| platform_take_minor | bigint NOT NULL | `splitTakeRate` floor (domain, INV-010) |
| seller_credit_minor | bigint NOT NULL | price − take |
| currency | text NOT NULL | |
| created_at | timestamp NOT NULL defaultNow | |

Immutable — never updated or deleted by application code (markup_ledger
precedent). Written ONLY inside the license transaction (INV-012).

## listing_rating (FR-013)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| listing_id | uuid NOT NULL → marketplace_listing.id (cascade) | |
| rater_agency_id | text NOT NULL → organization.id (cascade) | tenant owner; must hold a license |
| stars | bigint NOT NULL | 1–5 (app-validated; zod int range) |
| comment | text NULL | |
| created_at | timestamp NOT NULL defaultNow | |
| updated_at | timestamp NOT NULL defaultNow | bumped on re-rate |

Indexes: `UNIQUE (listing_id, rater_agency_id)` — one rating per agency per
listing; re-rating is an upsert on this key (FR-013).

## Existing tables touched

- **itinerary**: no shape change. Two new write paths: (a) the source row's
  `document` is updated with stamped provenance at listing time (D8); (b) the
  white-label copy is a NEW row (reseller tenant, inherited `trip_request`,
  copy document). The jsonb document remains canonical-schema-validated at the
  boundary (INV-001).
- **pmf_event**: no shape change. Two additive event types (`listing_created`,
  `listing_rated` — no money fields) join the closed vocabulary in
  `pmf-events.ts`; existing types `take_rate_accrued` and
  `trip_created(source=licensed)` gain their first real emitters (research D4).

## Canonical itinerary schema

**NO change** — `ProvenanceSchema` + `ListedItinerarySchema` (seed-0002,
SCHEMA_VERSION 0.1.0) already define provenance and the listing refinement.
No version bump, hence no operator schema gate. The white-label transform
(`whiteLabelCopy`, pure) produces documents valid under the existing schema:
`agencyId` re-homed, `provenance.originalAuthorAgencyId` preserved (first
author wins across resale chains), `licenseTerms`/`revenueShareBps` stamped
from the listing, `rebrandLineage` extended with the source itinerary row id.
