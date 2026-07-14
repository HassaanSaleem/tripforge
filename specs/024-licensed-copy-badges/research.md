# Phase 0 Research: Licensed-Copy & Resale Provenance Badges

## D1 — Where does lineage depth come from?

**Decision**: `document.provenance.rebrandLineage.length`. Every license (`licenseListing` →
`whiteLabelCopy`, packages/marketplace/src/white-label.ts:30) appends the source itinerary's row id
to the copy's `rebrandLineage`. Depth 0 = never licensed (original); depth 1 = a first-generation
copy; depth N = N generations deep.

**Alternatives considered**: adding a new `generation` integer column written at license time —
rejected: it would duplicate data already fully reconstructable from `rebrandLineage`, requiring a
new write on the money-adjacent licensing transaction for a value with zero independent meaning
(YAGNI; Constitution "simplicity default").

## D2 — Where does original-author attribution come from?

**Decision**: `document.provenance.originalAuthorAgencyId`, resolved to a name via `organization`.
`whiteLabelCopy` preserves this across chains — `source.provenance.originalAuthorAgencyId ??
source.agencyId` (white-label.ts:27) — so it always names the FIRST author, never an intermediate
reseller, with no extra tracking needed.

**Alternatives considered**: showing the immediate licensor's name instead — rejected, contradicts
the ticket's explicit ask ("original-author attribution") and the field's own established meaning.

## D3 — How does the org-name lookup avoid N+1 queries?

**Decision**: batch-resolve the distinct set of `originalAuthorAgencyId`s in one extra
`inArray`-scoped query against `organization`, mirroring the existing `vettedAgencyIds`
(packages/marketplace/src/vetting.ts:23) and `ratingAggregates` batch-lookup precedent already used
by `browseListings`. One extra query per `listItineraries`/`browseListings` call, not one per row.

**Alternatives considered**: joining `organization` directly in the main select — rejected for
`listItineraries` specifically because the join key (`originalAuthorAgencyId`) is inside the JSONB
`document` column, not a foreign-key column Drizzle can join on directly; a JSON-path SQL join is
possible but more complex than parsing the already-fetched document + one batched follow-up query,
which also mirrors the codebase's existing batch-lookup idiom exactly.

## D4 — Why `resaleGeneration: number | null` (not `0 | 1 | 2...`) on `BrowseListing`?

**Decision**: `null` for depth 0 (no marker), the depth number (≥ 1) otherwise — mirrors the
existing `licenseCount: number | null` / `sellerCreditTotalMinor: number | null` optional-field
convention already on `BrowseListing`, so the UI's existing "render only when non-null" pattern
(`listing.mine && listing.licenseCount !== null ? ... : null`) applies unchanged.

**Alternatives considered**: a boolean `isResale` + separate `generation: number` — rejected,
redundant (generation ≥ 1 already implies resale) and a second field to keep in sync for no
benefit.

## D5 — Picker option marker: text suffix vs. custom listbox

**Decision**: append a text suffix to the existing `{title} ({currency})` option label — the ticket
asks for "badge + attribution" but a native HTML `<select><option>` cannot render a styled
`<span>` badge; the accessible name IS the option's text content. A text suffix
(`"— Licensed copy · original by {name}"`) fully satisfies FR-001/FR-002 (marked + attributed) and
is readable by screen readers, unlike a color-only badge would be.

**Alternatives considered**: replacing the native `<select>` with a custom listbox component to
allow a styled badge — rejected as disproportionate scope for a read-side provenance fix; the
existing picker already has a documented "already listed" text-suffix precedent
(`" — already listed"` in listing-form.tsx:89) this change directly extends, so it is also the
established convention, not a new one.

## Resolved Technical Context

No NEEDS CLARIFICATION markers remain — all Technical Context fields in plan.md are resolved by
D1–D5 above and by direct inspection of the existing codebase (itineraries.ts, listings.ts,
white-label.ts, provenance.ts, vetting.ts).
