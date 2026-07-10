# Contracts — Marketplace UI (011)

## §1 Page contract: `/marketplace` (workspace group)

- Server component. `getWorkspaceIdentity(headers)`:
  - **agent** → branded workspace header (platform brand allowed — workspace
    surface, INV-024) + `<MarketplacePanel />`.
  - **null** → the workspace membership prompt (same copy pattern as
    `/workspace`), NO marketplace data fetched or rendered (FR-001, SC-005).
- The workspace header on `/workspace` and `/marketplace` carries a nav link
  between the two surfaces.
- `export const dynamic = "force-dynamic"` (session-dependent, like `/workspace`).

## §2 NEW procedure contract: `workspace.itinerary.list`

- **Gate**: `agentProcedure` (UNAUTHORIZED anon; FORBIDDEN traveler — inherits
  the pinned RBAC ladder).
- **Input**: none.
- **Output**: `{ itineraries: Array<{ id: string; title: string; currency:
  string; createdAt: string }> }`, ONLY rows of the caller's agency
  (`scopedWhere`, INV-004), ordered `createdAt` DESC.
- **L3 witness** (`l3-itinerary-list.test.ts`): two agencies with one
  itinerary each — each caller sees exactly its own row; anon/traveler callers
  refused. No documents, no trip requests in the projection.

## §3 Panel contract: browse

- On mount: `browseListings.query()` → render every listing (data-model table).
- Loading state → skeleton/progress line; failure → `role="alert"` message
  from `marketplaceErrorMessage` (transport table).
- `mine === true` → "Your listing" badge, NO license button (FR-006).
- `mine === false` → license button.
- Empty list → invitational empty state (US1 scenario 3).
- Rating line via `formatRating` — explicit "Not yet rated" when unrated.
- `data-testid="marketplace-browse"` on the browse section;
  `data-testid="listing-card"` per card (e2e hooks).

## §4 Panel contract: list an itinerary

- Picker options from `workspace.itinerary.list`; empty → explanatory
  no-itineraries state linking to `/workspace` (US2 scenario 3); form
  unsubmittable.
- Fields: itinerary (select), listing title (text), license fee in the picked
  itinerary's currency (numeric string, major units; currency rendered
  read-only beside it), license terms (textarea), revenue share % (numeric
  string).
- Submit: `toCreateListingInput` maps/validates PURELY; inline `{ error }`
  renders as `role="alert"` and NOTHING is sent (US2 scenario 4).
- Success (`listed`): confirmation line + browse reload (FR-011); form resets.
- Refusals render via `createListingFailureMessage` (exhaustive, FR-005);
  `provenance_incomplete` renders each reported issue.
- `data-testid="listing-form"`, confirmation `data-testid="listing-created"`.

## §5 Panel contract: license a listing

- License button (non-mine cards) → `licenseListing.mutate({ listingId })`;
  busy state disables the button ("Licensing…").
- Success (`licensed`): split receipt rendered VERBATIM from the outcome —
  fee, seller credit, platform take (each `formatMinorAmount`-formatted with
  the outcome's own currency), copy itinerary id in a `<code>` — plus browse
  reload (FR-011). `data-testid="license-receipt"`.
- Refusals render via `licenseFailureMessage` (exhaustive, FR-007) inline on
  the card.
- The receipt explicitly labels the copy as the agency's white-label copy in
  their workspace.

## §6 Pure helper contract: `apps/web/lib/marketplace-flow.ts` (+ `basis-points.ts`)

All DOM-free, all L1-tested (FR-009):

| Export | Contract |
|--------|----------|
| `percentToBps(raw, subject)` *(basis-points.ts)* | "" → error; non-finite → error; <0 or >100 → error; >2dp → error; else `{ bps }`. Messages interpolate `subject`. `toMarkupBps` (booking-flow) delegates with subject "Markup" — its messages stay byte-identical |
| `toCreateListingInput(values, currency)` | Validates picker/title/terms non-empty; fee via `currencyFractionDigits` major→minor (non-numeric/negative/excess-precision → error); share via `percentToBps`; returns typed input or first error |
| `createListingFailureMessage(outcome)` | Exhaustive over non-`listed` statuses; provenance issues joined into the message |
| `licenseFailureMessage(outcome)` | Exhaustive over non-`licensed` statuses |
| `formatRating(average, count)` | null/0 → "Not yet rated"; else "★ {avg.toFixed(1)} ({count})" |
| `formatShareBps(bps)` | Display scaling only: 1000 → "10%" (booking-flow `formatMarkupBps` pattern; distinct wording context) |
| `marketplaceErrorMessage(error)` | `transportErrorMessage` with marketplace wording (transport table) |

## §7 e2e contract: `tests/e2e/marketplace-journey.spec.ts`

Journey (research D10): sign-up A → draft → list on `/marketplace` → assert
"Your listing" + no license button; sign-up B → browse shows A's listing
(cross-tenant, SC-002) with license button → license → receipt shows copy id +
split integers (SC-004) → re-license refused with already-licensed wording.
Runs against the BUILT compose image only (INV-027).
