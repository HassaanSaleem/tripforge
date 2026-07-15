# Data Model: Bring-Your-Own Itinerary (Manual Entry)

## Canonical itinerary document — UNCHANGED

No change to `packages/itinerary-schema`. A manually-built itinerary is a
normal `Itinerary` document (`packages/itinerary-schema/src/itinerary.ts`):

```
Itinerary {
  schemaVersion: "0.1.0"          // unchanged
  id, agencyId, title, currency
  days: Day[]
  media: MediaRef[]
  pricing: PricingBlock            // synthesized placeholder (see below)
  provenance: Provenance           // default { rebrandLineage: [] }, unchanged shape
}

Day {
  dayNumber, date?, subtotal?
  items: Item[]
}

Item (discriminated union on `kind`, unchanged shapes):
  StayItem     { kind: "stay", id, title, checkIn, checkOut, occupancy, supplyRef?, media, pricing? }
  ActivityItem { kind: "activity", id, title, startsAt?, durationMinutes?, supplyRef?, media, pricing? }
  TransferItem { kind: "transfer", id, title, from, to, mode, supplyRef?, media, pricing? }
```

Manually-entered items omit `supplyRef` and `pricing` until a real supplier
rate is attached (research D4/D7) — already a valid, tested shape
(`packages/itinerary-schema/src/__tests__/fixtures.ts:41-47`).

**Synthesized `pricing` block at create time** (required field, no allocator
run for a manual trip):
```ts
{ budgetMode: "target", total: { amountMinor: 0, currency }, categories: [] }
```

## New: `itinerary.creation_source` column (packages/db)

Additive column on the existing `itinerary` table
(`packages/db/src/schema-itinerary.ts`):

```ts
creationSource: text("creation_source").notNull().default("ai_drafted"),
```

| Value | Set by | Meaning |
|---|---|---|
| `ai_drafted` | `selectDraftOption` (`packages/api/src/services/planner.ts`) | Persisted from the AI planner (existing path, unchanged logic — one new field on an existing insert) |
| `manual` | new `createManual` service (`packages/api/src/services/itineraries.ts`) | Agent-entered via the manual builder |
| `licensed_copy` | `licenseListing` (`packages/marketplace/src/licensing.ts`) | White-label copy created at license time (existing path, unchanged logic — one new field on an existing insert) |

`DEFAULT 'ai_drafted'` makes the migration backward-compatible with zero
backfill: every pre-existing row was in fact AI-drafted or a licensed copy,
and pre-existing licensed-copy rows keep displaying correctly through the
**existing** `licensedCopy` derivation (`provenance.rebrandLineage`, below) —
the UI never reads `creation_source` for a row where `licensedCopy !== null`
(see origin-display rule below), so the default's inaccuracy for old
licensed-copy rows is never observed.

Not a Postgres enum type — plain `text`, validated at the Zod boundary in the
service layer, matching the existing `media_asset.source` convention.

## Existing: `Provenance` (unchanged, reused for licensed-copy detection)

```ts
Provenance {
  originalAuthorAgencyId?: string
  licenseTerms?: string
  revenueShareBps?: number
  rebrandLineage: string[]   // default []
}
```

`rebrandLineage.length > 0` already means "this row is a licensed white-label
copy" (spec 024) — this is untouched; `creation_source` is a *new, separate*
signal and the two are combined only at display time (see below), never
merged into one field.

## Derived read model: `MyItinerary` (extended)

`packages/api/src/services/itineraries.ts`, interface `MyItinerary`
(existing, extended by one field):

```ts
export interface MyItinerary {
  id: string;
  title: string;
  currency: string;
  createdAt: string;
  listing: MyItineraryListing | null;
  licensedCopy: { originalAuthorAgencyName: string; generation: number } | null;
  origin: "manual" | "ai_drafted" | null;   // NEW — null when licensedCopy !== null (see below)
}
```

Display rule (`listItineraries`): when `licensedCopy !== null`, `origin` is
`null` and the UI shows only the existing "Licensed copy · original by X"
badge (spec Edge Cases: a copy's shown origin is its licensing provenance,
not a re-classification). When `licensedCopy === null`, `origin` is read
straight from the row's `creation_source` column (`'manual'` or
`'ai_drafted'`).

## `TripRequest` (unchanged shape, new synthesis path)

No change to `packages/api/src/services/planner.ts`'s `tripRequestSchema`.
The manual-create mutation builds one instance of the existing type from its
own input, exactly the shape the planner form already collects:

```ts
{
  destination: string,
  checkIn: string,   // YYYY-MM-DD
  checkOut: string,  // YYYY-MM-DD, > checkIn
  party: { adults: number, children: number },
  budget: { mode: "target", amountMinor: 1, currency },  // synthesized placeholder (positive() bound)
}
```

Persisted into the itinerary row's existing `trip_request` jsonb column
unchanged — no new column, no new consumer-side branching (quote flow,
chat-edit, flights-deeplink all read the same fields regardless of how the
row was created).

## New tRPC input: `createManualItineraryInputSchema`

Lives alongside `tripRequestSchema` in `packages/api/src/services/planner.ts`
or as a sibling schema in `itineraries.ts` (final placement decided during
implementation, per Pre-Write Discipline — likely `itineraries.ts` since
that's where the service function lives):

```ts
z.strictObject({
  title: z.string().min(1),
  currency: z.string().length(3).toUpperCase(),
  destination: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.strictObject({ adults: z.number().int().min(1), children: z.number().int().min(0).default(0) }),
  days: z.array(z.strictObject({
    dayNumber: z.number().int().min(1),
    date: z.string().optional(),
    items: z.array(manualItemInputSchema),   // discriminated union mirroring ItemSchema's 3 kinds, minus id/supplyRef/pricing/media
  })),
}).refine((v) => v.checkOut > v.checkIn, ...)
```

Server assigns `id`s (items and itinerary), stamps `agencyId` from the
session, sets `creationSource: "manual"`, builds the `Itinerary` object, and
validates the WHOLE thing through the existing `ItinerarySchema.parse`
boundary (via `persistDocument`, `itineraries.ts:176-182`) before insert —
identical re-validation discipline to every other write path (INV-001).

## New PMF event

No new event type. The manual-create transaction records the **existing**
`trip_created` event with `source: "self_built"` (research D2) — unchanged
from what the AI-drafted path already records, so the
`pmf_resold_vs_self_built` view continues to mean exactly what it means
today.
