# Phase 1 Data Model: Flights Card — Indicative Options + Deep-Link Handoff

No canonical schema change. No new database table/column. No new tRPC
procedure. This document describes the in-memory shapes the feature
introduces and the read-only fields it consumes from existing sources.

## New types (`apps/web/lib/flights.ts`)

### `IndicativeFlightOption`

| Field | Type | Notes |
|---|---|---|
| `airline` | `string` | Seeded airline name, chosen deterministically from destination |
| `departureLabel` | `string` | Human-readable indicative departure time/date text derived from `checkIn` |
| `returnLabel` | `string` | Human-readable indicative return time/date text derived from `checkOut` |
| `priceMinor` | `number` | Integer minor units — indicative price only, never persisted, never summed into any budget/pricing total |
| `currency` | `string` | ISO-4217, taken from the caller (the trip's own currency) |

Not persisted anywhere; regenerated on each render from `(destination,
checkIn, checkOut, currency)`.

### Function contract: `indicativeFlightOptions`

```ts
function indicativeFlightOptions(
  destination: string,
  checkIn: string,   // YYYY-MM-DD
  checkOut: string,  // YYYY-MM-DD
  currency: string,
): IndicativeFlightOption[] // length 2 or 3, deterministic per input tuple
```

- **Determinism**: same input tuple → byte-identical output array, every call
  (spec SC-003). Implemented via a stable string hash over `destination`
  (no `Math.random`, no `Date.now()`).
- **Robustness**: never throws — an empty/unusual `destination` string still
  yields 2-3 generic-but-labeled options (spec Edge Cases).

### Function contract: `buildFlightSearchUrl`

```ts
function buildFlightSearchUrl(
  destination: string,
  checkIn: string,
  checkOut: string,
): string // absolute https:// URL, safe to use as an <a href>
```

- Pure string construction (URL-encodes `destination`/dates into a query
  string). No origin parameter (spec Assumptions — origin is unmodeled
  product-wide).

## Existing data this feature reads (no changes)

### `tripRequest` (already persisted, already returned)

Source: `packages/api/src/services/planner.ts` `tripRequestSchema`, persisted
on `itinerary.trip_request` (`packages/db/src/schema-itinerary.ts`), already
returned by `workspace.itinerary.get` → `itineraryOverview` →
`{ tripRequest: TripRequest, ... }` (`packages/api/src/services/booking/overview.ts`).

Fields this feature reads: `destination: string`, `checkIn: string` (YYYY-MM-DD),
`checkOut: string` (YYYY-MM-DD). No other `tripRequest` field is touched.

### `flightsTransport` budget allocation (already computed)

- Freshly-drafted view: `outcome.fit.categories` (array of
  `{ category, allocatedMinor, spentMinor, state }`) — find the entry where
  `category === "flightsTransport"`.
- Reopened-trip view: `itinerary.pricing.categories` (canonical
  `BudgetAllocation[]`) — find the entry where `category === "flightsTransport"`,
  read `.allocated` (a `Money`).

Both are already-computed, already-conserved values (`packages/domain/src/budget.ts`
`allocateBudget`/`rebalanceAllocations`) — this feature performs **zero**
arithmetic on them; it only formats and displays the existing amount via the
already-existing `formatMinorAmount` helper (`apps/web/lib/planner-form.ts`).

## View-state wiring changes (no new state shape, additive fields only)

### `planner.tsx`

The `"drafted"` view-state phase currently carries only `{ phase: "drafted",
outcome: DraftedOutcome }`. It gains one additive field, mirroring how the
`"comparing"` phase already carries `tripRequest: DraftInput`:

```ts
| { phase: "drafted"; outcome: DraftedOutcome; tripRequest: DraftInput }
```

`chooseOption`'s existing `setView({ phase: "drafted", outcome })` call gains
`tripRequest` (the same value it already threads into the `selectDraft.subscribe`
call one line above — no new data, just retained instead of dropped).

### `itinerary-list.tsx`

No new state. The component already receives the full `itineraryOverview`
response (`overview`) but only destructures `overview.itinerary`,
`overview.bookings`, etc. It additionally destructures `overview.tripRequest`.

## Props contract: `<FlightsCard>`

```ts
function FlightsCard({
  destination,
  checkIn,
  checkOut,
  currency,
  flightsBudget, // Money | undefined — undefined only if the category is somehow absent
}: {
  destination: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  flightsBudget?: { amountMinor: number; currency: string };
}): JSX.Element
```

Purely presentational: calls `indicativeFlightOptions`/`buildFlightSearchUrl`
internally, renders the option list, the budget reference line (only if
`flightsBudget` is present), and the deep-link `<a>`.
