# Data Model — Marketplace UI (011)

This feature adds **no database entities and no schema changes**. It consumes
existing server projections/outcomes (spec 006) verbatim and adds one read-only
projection plus client-side view models. Server types reach the browser ONLY
via tRPC router type inference (research D1).

## Consumed server projections (existing, untouched)

### BrowseListing (from `workspace.marketplace.browseListings`)

| Field | Type | UI use |
|-------|------|--------|
| `listingId` | uuid | React key; license input |
| `title` | string | Card heading |
| `priceMinor` | int (minor units) | Displayed via `formatMinorAmount` — never recomputed |
| `currency` | string | Currency of fee and split |
| `licenseTerms` | string | Terms row |
| `revenueShareBps` | int 0–10000 | Displayed via `formatShareBps` (display scaling only) |
| `sellerAgencyId` | string | (not rendered — `mine` is the marker) |
| `sellerAgencyName` | string | Seller row |
| `ratingAverage` | number \| null | `formatRating` (research D8) |
| `ratingCount` | int | `formatRating` |
| `mine` | boolean | "Your listing" badge; suppresses the license action (FR-006) |

### CreateListingOutcome (from `workspace.marketplace.createListing`)

`listed { listingId, itineraryId }` · `not_vetted` · `already_listed { listingId }`
· `provenance_incomplete { issues: string[] }` (· `not_found` → thrown as
tRPC NOT_FOUND by the router; reaches the panel as a transport error).

### LicenseListingOutcome (from `workspace.marketplace.licenseListing`)

`licensed { licenseId, copyItineraryId, priceMinor, platformTakeMinor,
sellerCreditMinor, currency }` · `not_vetted` · `own_listing` · `not_active`
· `already_licensed { licenseId }` (· `not_found` → tRPC NOT_FOUND).

The `licensed` payload is the **recorded split** — the UI renders these five
values verbatim (FR-003/SC-004) and never derives one from another.

## New server projection (this feature)

### MyItinerary (from NEW `workspace.itinerary.list`)

| Field | Type | Constraint |
|-------|------|-----------|
| `id` | uuid | Tenant-scoped: only rows where `agencyId = session.agencyId` (INV-004) |
| `title` | string | Picker label |
| `currency` | string | Shown read-only next to the fee input (research D4) |
| `createdAt` | ISO string | Sort key, newest first |

Read-only select; no state transitions.

## Client view models (in `marketplace-flow.ts` / panel state)

### ListingFormValues

| Field | Type | Mapping |
|-------|------|---------|
| `itineraryId` | string | From picker; "" = nothing picked → submit refused inline |
| `title` | string | 1–200 chars (server enforces; empty refused inline) |
| `feeMajor` | string | → `priceMinor` via `currencyFractionDigits` (research D4) |
| `licenseTerms` | string | 1–2000 chars (server enforces; empty refused inline) |
| `sharePercent` | string | → `revenueShareBps` via `percentToBps` (research D5) |

`toCreateListingInput(values, currency)` returns
`{ input: CreateListingInput } | { error: string }` — pure, L1-tested.

### Panel view states

- Browse: `loading` → `loaded { listings }` | `failed { message }`; reloaded
  after successful actions (research D6).
- Listing form: `idle` → `submitting` → `listed { confirmation }` |
  `refused { message }`.
- License (per listing): `idle` → `licensing` → `licensed { receipt }` |
  `refused { message }`.

## Failure → message mapping tables (FR-005/FR-007, exhaustive)

### createListing refusals

| Status | Message intent |
|--------|----------------|
| `not_vetted` | Agency not vetted to sell yet — plain-language, no raw code |
| `already_listed` | This itinerary already has an active listing — benign notice |
| `provenance_incomplete` | Listing needs complete provenance + the reported issues, verbatim list |

### licenseListing refusals

| Status | Message intent |
|--------|----------------|
| `not_vetted` | A side isn't vetted — licensing unavailable |
| `own_listing` | You can't license your own listing |
| `not_active` | Listing no longer on the marketplace — refresh browse |
| `already_licensed` | Your agency already licensed this trip — benign notice |

### Transport table (shared wording pattern, research D7)

| Failure | Message intent |
|---------|----------------|
| UNAUTHORIZED | Sign in again (session lapsed) |
| FORBIDDEN | Marketplace requires an agency membership |
| NOT_FOUND | The itinerary/listing is no longer available |
| BAD_REQUEST | The server rejected the request — check the form |
| network | Connection failed — retry |
