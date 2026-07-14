# Implementation Plan: Licensed-Copy & Resale Provenance Badges

**Branch**: `kitchen/fix-seed-0018-licensed-copy-marker` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-licensed-copy-badges/spec.md` (ticket seed-0018)

## Summary

Licensed white-label copies are indistinguishable from originals everywhere in the product — the
sell-form picker, the workspace trip list, and cross-tenant marketplace listing cards all show
only title/currency, so a user cannot tell a licensed copy from a self-authored original. The data
already exists: `whiteLabelCopy` (packages/marketplace/src/white-label.ts) stamps
`provenance.originalAuthorAgencyId` and extends `provenance.rebrandLineage` on every license. Fix:
**read-time projection** — extend `listItineraries` (the picker + workspace list's shared read) to
carry a `licensedCopy: { originalAuthorAgencyName, generation } | null` derived from the document's
existing stored provenance, and extend `browseListings` (marketplace browse) to carry a
`resaleGeneration: number | null` from the same lineage depth on the LISTED itinerary. Both are
read-side projection additions only — no canonical schema change, no new writes, no migration.

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm + turborepo monorepo)

**Primary Dependencies**: Next.js app router (apps/web), tRPC v11 (packages/api), Drizzle ORM on
Postgres (packages/db), `@tripforge/itinerary-schema` (`parseItinerary`, `Provenance`)

**Storage**: Postgres — READ-ONLY use of the existing `itinerary.document` JSONB column
(`provenance.originalAuthorAgencyId`, `provenance.rebrandLineage`) and the existing `organization`
table (for the original author's agency name). No migrations, no new columns, no new writes.

**Testing**: Vitest L1 (projection unit tests + display-helper unit tests) + Vitest L2 (router
caller tests extended) + Playwright e2e (license → picker/workspace-list marker; re-list → buyer
card marker)

**Target Platform**: Dockerized Next.js (compose stack), Vercel-serverless-correct (INV-028:
per-request DB reads, no in-process state)

**Project Type**: Web monorepo — API service + two presentational components

**Performance Goals**: No new round trips — `listItineraries` and `browseListings` already run one
query each per call; this adds columns/joins to those same queries, not new queries. Parsing the
JSONB document per row is bounded by the caller's own itinerary/listing count (small, tenant- or
marketplace-scoped, no pagination today).

**Constraints**: Zero canonical schema change (Constitution IV); zero new writes; markers derived
only from already-stored provenance; tenant scoping (INV-004) preserved for the picker/workspace
list read; the existing public cross-tenant projection scoping preserved for listing cards (no new
fields beyond what a buyer may already infer from a licensed copy they hold).

**Scale/Scope**: 2 API service files extended (itineraries.ts, listings.ts) + 2 display-helper
files extended (itinerary-list.ts, marketplace-flow.ts) + 3 UI files extended (listing-form.tsx,
itinerary-list.tsx, listing-browse.tsx) + L1/L2 tests extended + 1 e2e spec extended.

## Constitution Check

*GATE: evaluated before Phase 0 research; re-checked after Phase 1 design — PASS (both).*

- **I. Marketplace-First**: PASS. Directly strengthens marketplace trust/liquidity — a buyer who
  can see resale depth and a reseller who can recognize their own licensed copies both trade with
  more confidence (this is the exact gap that produced a witnessed false PRODUCT_FAIL). No new
  surface; deepens the existing resell/white-label (B2B2B) flow the constitution prioritizes.
- **II. Agent Experience Is the Wedge**: PASS. Removes a real point of agent confusion in the
  picker/workspace list (time-to-list-correctly). No regression to time-to-client-ready-itinerary
  — the client-facing branded output is untouched by this feature.
- **III. Budget-Aware AI**: N/A — no planner/budget change.
- **IV. Canonical Itinerary Schema**: PASS. No schema change, no version bump, **no migration note
  required** — the document is read-only here; provenance fields already exist in the schema
  exactly as Principle IV requires ("Provenance fields ... are part of the schema, not an
  afterthought"). This feature makes existing provenance fields visible, it does not add any.
- **V. Integrate Supply, Don't Contract It**: N/A — no supplier-adapter surface touched.
- **VI. Trust, Provenance & Revenue-Share Integrity**: PASS — this feature IS the constitution's
  own example of provenance as "a first-class product surface" (ticket's own framing). No
  revenue-share terms are displayed or altered (explicitly out of scope, see spec Assumptions);
  only the already-mandatory provenance fields (author, lineage) become visible where they were
  silently dropped. Not a money path — no new integration tests required by this principle, but
  read scoping (INV-004 / existing cross-tenant projection boundary) is preserved and tested.

## Project Structure

### Documentation (this feature)

```text
specs/024-licensed-copy-badges/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1-D5
├── data-model.md         # Phase 1 — projection inputs/outputs (no new entities)
├── quickstart.md         # Phase 1 — validation guide
├── contracts/
│   ├── itinerary-list-projection.md      # Amended workspace.itinerary.list payload
│   └── browse-listings-projection.md     # Amended workspace.marketplace.browseListings payload
├── checklists/requirements.md
└── tasks.md              # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/api/src/services/itineraries.ts        # listItineraries: + licensedCopy projection
packages/marketplace/src/listings.ts            # browseListings: + resaleGeneration projection
packages/api/src/__tests__/itineraries.test.ts  # L1/L2: licensedCopy projection (if file exists; else co-located with existing router caller tests)
packages/marketplace/src/__tests__/listings.test.ts  # L1/L2: resaleGeneration projection
apps/web/lib/itinerary-list.ts                  # formatLicensedCopyBadge helper + test
apps/web/lib/marketplace-flow.ts                # formatResaleBadge helper + test
apps/web/app/(workspace)/marketplace/listing-form.tsx     # picker option marker
apps/web/app/(workspace)/workspace/itinerary-list.tsx      # workspace trip row marker
apps/web/app/(workspace)/marketplace/listing-browse.tsx    # cross-tenant card marker
tests/e2e/marketplace-journey.spec.ts (or sibling)         # license -> picker marker; re-list -> buyer card marker
```

**Structure Decision**: Existing monorepo layout; no new packages, no new routes. The projection
changes live in the existing API/marketplace service layer; presentation lives in the existing
marketplace + workspace components (all three already exist and already render the fields this
feature extends).

## Design Sketch (Phase 1 condensed)

1. **`listItineraries` projection** (packages/api/src/services/itineraries.ts): the existing query
   already selects `document`-adjacent columns per itinerary row but not `document` itself. Add
   `document: itineraryTable.document` to the select, `parseItinerary(row.document)` per row (the
   file already imports `parseItinerary`), and derive:
   - `generation = parsed.provenance.rebrandLineage.length`
   - if `generation >= 1`: resolve `parsed.provenance.originalAuthorAgencyId` to an agency name via
     a single batched lookup against `organization` (one extra query, keyed by the distinct set of
     author ids in the result set — mirrors the existing `vettedAgencyIds`/`ratingAggregates`
     batch-lookup pattern in packages/marketplace).
   - `MyItinerary.licensedCopy: { originalAuthorAgencyName: string; generation: number } | null`.
2. **`browseListings` projection** (packages/marketplace/src/listings.ts): join `itineraryTable` on
   `marketplaceListing.itineraryId` (the row already has `itineraryId` implicitly via the listing;
   confirm column name), select `document`, `parseItinerary`, and add
   `BrowseListing.resaleGeneration: number | null = rebrandLineage.length || null` (null, not 0, so
   the UI's existing `listing.mine`-style optional-marker pattern applies directly — `>= 1` renders,
   `null`/`0` does not).
3. **Display helpers** (pure, DOM-free, matching `formatListedBadge`/`formatShareBps` precedent):
   - `apps/web/lib/itinerary-list.ts`: `formatLicensedCopyBadge({ originalAuthorAgencyName, generation })`
     → `"Licensed copy · original by {name}"` (generation not surfaced here — attribution is the
     ask; the picker/workspace list is the OWNER's own view, generation number matters less than
     who authored it).
   - `apps/web/lib/marketplace-flow.ts`: `formatResaleBadge(generation)` → `` `Resale · Gen ${generation}` ``.
4. **UI**:
   - `listing-form.tsx` picker `<option>`: append the badge text after "(currency)" when
     `itinerary.licensedCopy` is non-null, e.g. `"Paris balanced trip (USD) — Licensed copy ·
     original by Bright Peak Travel"` (native `<select><option>` cannot carry a styled `<span>`
     badge — text suffix is the only option-element-compatible approach; still satisfies FR-001/002
     without a new component).
   - `itinerary-list.tsx` trip row: new `<span className="tf-badge tf-badge--licensed"
     data-testid="trip-licensed-copy">{formatLicensedCopyBadge(trip.licensedCopy)}</span>` beside the
     existing currency/listed badges, rendered only when `trip.licensedCopy !== null`.
   - `listing-browse.tsx` `ListingCard`: new `<span className="tf-badge tf-market-resale"
     data-testid="listing-resale-badge">{formatResaleBadge(listing.resaleGeneration)}</span>` inside
     the existing `.tf-market-meta` badge row, rendered only when `listing.resaleGeneration !== null`.
5. **Tests**: L1 unit tests for both new display helpers (pure functions, easy to pin exactly like
   `formatListedBadge`/`formatShareBps`); L1/L2 projection tests for `listItineraries` (own itinerary
   with lineage depth 0 → `licensedCopy: null`; depth 1 → name + generation 1; depth 2 chain →
   generation 2, name = FIRST author not intermediate) and `browseListings` (listing on a
   lineage-depth-0 itinerary → `resaleGeneration: null`; depth ≥ 1 → the correct number); e2e
   extends the existing license flow assertions to check the picker option text and, after
   re-listing, a second agency's browse view for the resale badge.

## Complexity Tracking

No constitution violations. No deviations to justify. One judgment call — a text-suffix badge in
the native `<select>` picker vs. restructuring it to a custom listbox component — is resolved in
favor of the text suffix: it satisfies FR-001/FR-002 with zero new interaction surface, and a
custom listbox is out of scope for a read-side provenance fix (YAGNI, Constitution "simplicity
default").
