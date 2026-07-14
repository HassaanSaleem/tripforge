# Phase 1 Data Model: Demo Seed Data

No canonical itinerary schema changes and no new database tables. This
feature only (a) extends an existing internal adapter type with two optional
fields, and (b) populates existing tables through existing write paths. This
document describes the shapes touched, not new persistence.

## Extended type: `SupplyContent` (packages/supply-adapter/src/ports/common.ts)

```ts
export interface SupplyContent {
  title: string;
  description?: string;
  features?: string[];
  imageUrl?: string;      // NEW — licensed stock source URL only
  attribution?: string;   // NEW — required alongside imageUrl in curated data
}
```

Both new fields are optional at the type level (backward compatible with
every existing fixture that omits them) but the curated-catalog data itself
always sets BOTH together for every hero-city offer (never one without the
other) — enforced by construction in `curated-catalog.ts`, not by the type
system.

## New module: curated catalog (packages/supply-adapter/src/sandbox/curated-catalog.ts)

```ts
interface CuratedOfferFixture {
  offerId: string;
  title: string;
  description: string;
  imageUrl: string;
  attribution: string;
  netRateMinor: number;
  currency: string; // "USD" for hotel/transfer, "EUR" for activity
}

interface CuratedActivityFixture extends CuratedOfferFixture {
  durationMinutes: number;
}

interface CuratedTransferFixture extends CuratedOfferFixture {
  mode: "private" | "shared";
}

interface CuratedCityCatalog {
  hotels: CuratedOfferFixture[];       // 3-4 entries
  activities: CuratedActivityFixture[]; // 4-5 entries
  transfers: CuratedTransferFixture[]; // outbound+return pairs, matching transfer.ts's existing convention
}

// Keyed by lower-cased, trimmed city name: "lisbon" | "tokyo" | "marrakech" | "reykjavik"
export const CURATED_CITIES: Record<string, CuratedCityCatalog>;

export function lookupCuratedCity(destination: string): CuratedCityCatalog | undefined;
```

No persistence — this is static, in-module fixture data, read at request
time by the three sandbox adapters' `search()` methods (same lifecycle as
today's procedural generation: recomputed per call, registered into the
per-instance `SandboxSupplyEngine` via its existing `register()` method).

## Populated rows (existing tables, existing write paths — no new columns)

All of the following are created through the write paths named — the seed
script never inserts into `itinerary`, `marketplace_listing`,
`marketplace_license`, `revenue_share_ledger`, `listing_rating`, `pmf_event`,
or `media_asset` directly; only `organization`/`member`/`agency_vetting` are
inserted directly (per research.md D2), plus Better Auth's own `user`/
`account` rows (via `signUpEmail`, per D1).

| Table | Written by | Cardinality this feature adds |
|---|---|---|
| `organization` (agency) | direct insert | 4-5 |
| `user` / `account` | `auth.api.signUpEmail` | 1-2 per agency (6-8 total) |
| `member` | direct insert | 1 per seeded user, `role: "owner"` |
| `agency_vetting` | direct insert | 1 per agency (all 4-5 vetted) |
| `itinerary` | `workspace.itinerary.draft` (via caller) | 6+ |
| `pmf_event` (`trip_created`) | same draft call (existing side effect) | 1 per drafted itinerary |
| `media_asset` | `workspace.media.register` (via caller) | 1+ |
| `itinerary` (media ref update) | `workspace.itinerary.attachMedia` (via caller) | 1+ |
| `marketplace_listing` | `workspace.marketplace.createListing` (via caller) | 3+ |
| `marketplace_license` | `workspace.marketplace.licenseListing` (via caller) | 3+ |
| `revenue_share_ledger` | same license call (existing side effect, same tx) | 3+ |
| `pmf_event` (`take_rate_accrued`, `trip_created` source=licensed) | same license call | 3+ each |
| `listing_rating` | `workspace.marketplace.rateListing` (via caller) | 3+ |
| `pmf_event` (`listing_rated`) | same rate call | 3+ |

## Idempotency keys (how re-running the script recognizes existing rows)

- **Agencies**: a fixed, deterministic slug per demo agency (e.g.
  `demo-azure-travel-co`) — looked up by slug before insert; existing row
  short-circuits agency+membership+vetting creation for that agency.
- **Demo users**: a fixed, deterministic email per seeded user (e.g.
  `owner@azure-travel-demo.test`) — `signUpEmail` against an existing email
  fails with a typed "already exists" response, which the script treats as
  already-seeded (skip), not an error.
- **Itineraries**: drafting has no built-in "already exists" outcome (every
  call mints a new row), so the script guards it itself — check
  `workspace.itinerary.list` for an already-seeded marker (a fixed title
  prefix, e.g. `"[demo] "`, combined with the deterministic destination/
  agency pairing this feature always uses) for that agency before drafting
  again; skip if found.
- **Listings/licenses/ratings**: already idempotent BY CONSTRUCTION via their
  own typed outcomes — `createListing` returns `{status: "already_listed"}`
  for a re-list of the same itinerary (a partial unique index enforces at
  most one active listing per itinerary), `licenseListing` returns
  `{status: "already_licensed"}` for a repeat (listing, reseller) pair
  (unique index), and `rateListing` UPSERTs on (listing, rater) — so the
  script simply calls them every run and treats the "already" outcomes as
  success, with no separate marker-based pre-check needed.
