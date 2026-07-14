# Phase 1 Data Model: Licensed-Copy & Resale Provenance Badges

No new entities, no new tables, no new columns. This feature projects two fields that already
exist in the canonical itinerary document's `provenance` object (`packages/itinerary-schema/src/provenance.ts`)
into two existing read surfaces.

## Existing entity reused (unchanged)

**Provenance** (part of every canonical `Itinerary` document):
- `originalAuthorAgencyId?: string` — the first author's agency id, preserved across resale chains.
- `rebrandLineage: string[]` — source itinerary ids the document passed through; `.length` is the
  lineage/generation depth (0 = original).

## Projection additions

### `MyItinerary` (packages/api/src/services/itineraries.ts, `listItineraries` output)

```ts
export interface MyItinerary {
  id: string;
  title: string;
  currency: string;
  createdAt: string;
  listing: MyItineraryListing | null;
  /** NEW — non-null when this itinerary is a licensed white-label copy. */
  licensedCopy: { originalAuthorAgencyName: string; generation: number } | null;
}
```

- `generation = provenance.rebrandLineage.length`.
- `licensedCopy = null` when `generation === 0`.
- `originalAuthorAgencyName` resolved from `provenance.originalAuthorAgencyId` via a batched
  `organization` lookup (research D3). If the id is somehow unresolvable (should not happen —
  `organization.id` is FK-referenced elsewhere and never hard-deleted), fall back to
  `"a previous owner"` rather than throwing — a display gap, not a data-integrity failure, must
  never break the picker/workspace list.

### `BrowseListing` (packages/marketplace/src/listings.ts, `browseListings` output)

```ts
export interface BrowseListing {
  // ...existing fields unchanged...
  /** NEW — the listed itinerary's rebrand lineage depth; null when 0 (not a resale). */
  resaleGeneration: number | null;
}
```

- Derived from the LISTED itinerary's own `provenance.rebrandLineage.length` (the itinerary the
  `marketplaceListing` row points at — which may itself be a licensed copy the seller re-listed).
- `null` when depth is 0 (renders no marker); the depth number otherwise.
- No author attribution on this surface (see spec Assumptions — the seller's own name is already
  shown on every card; this field is a generation/depth indicator only).

## State transitions

None — both fields are pure derivations of already-immutable-at-read-time provenance data. A
license event (`licenseListing`) is the only thing that changes `rebrandLineage`/
`originalAuthorAgencyId`, and it already exists; this feature adds no new transition, only makes an
existing one visible.
