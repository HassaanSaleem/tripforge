# Contract: `workspace.itinerary.createManual` (tRPC)

`agentProcedure`-gated (INV-023/024): anonymous → 401 UNAUTHORIZED; traveler
(no agency) → 403 FORBIDDEN. Business validation errors are zod parse errors
at the input boundary (no runtime "invalid" status needed — every constraint
below is expressible as a schema bound, matching the `groupTravel.post`
precedent). All money is integer minor units + currency (INV-009). No
supplier-port call, no LLM call — pure validate-and-persist, same class as
`licenseListing`'s copy-insert.

## Input (zod, strict)

```ts
{
  title: string (min 1),
  currency: string (length 3, uppercased),
  destination: string (min 1),
  checkIn: string (ISO date YYYY-MM-DD),
  checkOut: string (ISO date YYYY-MM-DD, > checkIn),
  party: { adults: int >= 1, children: int >= 0 (default 0) },
  days: Array<{
    dayNumber: int >= 1,
    date?: string,
    items: Array<ManualItemInput>,   // see below, 0..N per day, 0..N days allowed
  }>,
}
```

`ManualItemInput` — discriminated union on `kind`, the same 3 kinds as
`ItemSchema` (`packages/itinerary-schema/src/item.ts`), input fields only
(server assigns `id`; `supplyRef`/`pricing`/`media` are never accepted from
the client on create — an item starts unpriced by construction, matching
research D7):

```ts
| { kind: "stay", title: string, checkIn: string, checkOut: string, occupancy: { adults: int >= 1, children: int >= 0 } }
| { kind: "activity", title: string, startsAt?: string, durationMinutes?: int > 0 }
| { kind: "transfer", title: string, from: string, to: string, mode: "private" | "shared" | "rail" | "other" }
```

## Behavior

1. Validate input (zod boundary).
2. Assign a fresh `id` to the itinerary and to every item (`randomUUID`,
   matching every other persist path).
3. Build the `Itinerary` document: `days` mapped 1:1 from input (items get
   generated ids, no `supplyRef`/`pricing`/empty `media: []`); `pricing` is
   the synthesized placeholder block (data-model.md); `provenance` defaults
   to `{ rebrandLineage: [] }` (this is an original trip, not a copy).
4. Re-validate the WHOLE document through `ItinerarySchema.parse` (via the
   existing `persistDocument` helper, `itineraries.ts:176-182` — INV-001: no
   layer trusts unvalidated input past the boundary).
5. Build a `TripRequest` from `{ destination, checkIn, checkOut, party }` +
   synthesized `budget` (data-model.md D6); this becomes the row's
   `trip_request` value.
6. In ONE transaction (mirrors `selectDraftOption`,
   `packages/api/src/services/planner.ts:341-357`):
   - `INSERT INTO itinerary` with `creationSource: "manual"`.
   - `recordPmfEvent({ type: "trip_created", source: "self_built", ... })` —
     unchanged event, unchanged value (research D2).
7. Return the persisted document.

## Output

```ts
{ status: "created", itinerary: Itinerary }
```

No other outcome variant — every rejectable condition (malformed dates,
empty title, `checkOut <= checkIn`, non-positive `adults`) is a zod parse
failure at the input boundary, not a runtime status (matching
`groupTravel.post`'s precedent: "capacity <= 0 or price < 0 — input-schema
bounds, no runtime 'invalid' status needed").

## Tenant scoping (INV-004)

`agencyId` is taken from `ctx.session`, never from client input — the created
itinerary is owned by the caller's agency by construction; there is no
cross-tenant surface to test here (unlike `get`/`applyChatEdit`, which load an
*existing* row by id and must reject a foreign `itineraryId` — `createManual`
never receives an itinerary id from the client).

## Downstream: zero special-casing (SC-002)

Once persisted, the row is indistinguishable from an AI-drafted one to every
other procedure:

- `workspace.itinerary.get`/`list` — reads the row like any other (plus the
  new `origin` field, data-model.md).
- `workspace.itinerary.chatEdit`/`applyChatEdit` — operates on the document
  exactly as today (research D4); attaching a real supplier rate to a manual
  item is not a new code path.
- `booking.quote`/`booking.book` — an item with no `supplyRef` is silently
  excluded from the bookable set, exactly like an unpriced AI-drafted item
  (`packages/api/src/services/booking/quote.ts:63-65`, unchanged).
- `marketplace.listListing`/`licenseListing` — list/license/white-label a
  manually-built itinerary exactly like an AI-drafted one; the copy's
  `creationSource` is set to `"licensed_copy"` (data-model.md), independent
  of whatever the original's `creationSource` was.
- `clientView.get` — renders days/items/media exactly as today; unpriced
  items already render with a `null` price (`client-view.ts`, unchanged).
