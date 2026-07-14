# Contract: workspace.marketplace.browseListings — resale-generation projection amendment

**Feature**: specs/024-licensed-copy-badges | **Amends**: specs/006-marketplace-v0 (browse
contract), specs/011-marketplace-ui (browse card consumer)

## Procedure (unchanged surface)

`workspace.marketplace.browseListings` — agent-gated tRPC query, no input, output
`{ listings: BrowseListing[] }`. This is the one deliberate cross-tenant read (active listings
only, seller-published public fields). Nothing about the procedure name, input, active-only
filter, or existing field set changes.

## Amended output shape

`BrowseListing` gains one field:

```ts
resaleGeneration: number | null
```

| Listed itinerary state | `resaleGeneration` value |
|---|---|
| First-generation listing (the listed itinerary's `rebrandLineage.length === 0`) | `null` |
| A re-listed licensed copy (`rebrandLineage.length >= 1`) | the depth number (1, 2, ...) |

## Invariants preserved (unchanged, re-asserted by existing + new tests)

- **Cross-tenant projection allowlist (research D7)**: still seller-published public fields only —
  `resaleGeneration` is a depth NUMBER derived from provenance the seller already implicitly
  disclosed by re-listing a licensed copy (the copy itself is visible to anyone who licenses it);
  no new PII, no net rate, no other tenant's private data crosses this boundary.
- **No author attribution added here** (see spec Assumptions) — the seller's own agency name is
  already on every card; this field is a generation/depth indicator only, kept minimal on purpose.
- **`null` (not `0`) for depth 0** — mirrors the existing `licenseCount`/`sellerCreditTotalMinor`
  optional-field convention so the UI's existing "render only when non-null" pattern applies
  unchanged.

## Verification hooks

- L1/L2: projection test — a listing on a never-licensed itinerary → `resaleGeneration: null`; a
  listing on a licensed copy (depth 1) → `resaleGeneration: 1`; a listing on a re-licensed chain
  (depth 2) → `resaleGeneration: 2`.
- e2e: agency A lists an original; agency B licenses + re-lists the copy; agency C browses and sees
  B's card carrying the "Resale · Gen 1" marker; A's original card carries none.
