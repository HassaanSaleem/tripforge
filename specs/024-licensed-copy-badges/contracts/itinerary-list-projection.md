# Contract: workspace.itinerary.list — licensed-copy projection amendment

**Feature**: specs/024-licensed-copy-badges | **Amends**: specs/012-workspace-itinerary-list
(picker/list payload), specs/011-marketplace-ui (sell-form picker consumer)

## Procedure (unchanged surface)

`workspace.itinerary.list` — agent-gated tRPC query, no input, output `{ itineraries: MyItinerary[] }`.
Both the sell-form picker (`listing-form.tsx`) and the workspace trip list (`itinerary-list.tsx`)
call this SAME procedure today. Nothing about the procedure name, input, tenant scoping (INV-004,
`scopedWhere(itineraryTable.agencyId, session.agencyId)`), or ordering (newest-first) changes.

## Amended output shape

`MyItinerary` gains one field:

```ts
licensedCopy: { originalAuthorAgencyName: string; generation: number } | null
```

| Itinerary state | `licensedCopy` value |
|---|---|
| Self-authored, never licensed (`rebrandLineage.length === 0`) | `null` |
| A licensed white-label copy (`rebrandLineage.length >= 1`) | `{ originalAuthorAgencyName, generation }` where `generation === rebrandLineage.length` and `originalAuthorAgencyName` resolves `provenance.originalAuthorAgencyId` (the FIRST author, preserved across chains — never an intermediate reseller) |

## Invariants preserved (unchanged, re-asserted by existing + new tests)

- **Tenant scope (INV-004)**: the underlying query is still scoped to the caller's own agency —
  this feature adds a column/derived field to an already-scoped read, it does not widen the read.
- **No client-side derivation of tenant-sensitive data**: `generation` and
  `originalAuthorAgencyName` are computed server-side from data the caller's own itinerary document
  already carries (their own copy's provenance) — nothing about another agency's private data is
  newly exposed; the original author's agency NAME is the same public fact already visible on the
  marketplace listing the copy came from.
- **No canonical schema change**: `document` is read, never written, by this procedure.

## Verification hooks

- L1/L2: projection test — own original (depth 0) → `licensedCopy: null`; a licensed copy (depth 1)
  → correct name + `generation: 1`; a re-licensed chain (depth 2) → `generation: 2`, name still the
  FIRST author.
- e2e: license a listing → the resulting copy's picker option AND workspace-list row both show the
  licensed-copy marker with the original author's name.
