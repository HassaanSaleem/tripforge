# Contract: Curated Hero-City Supply Catalog

## Scope

`packages/supply-adapter/src/sandbox/{hotel,activity,transfer}.ts` — the
sandbox adapters' `search()` methods.

## Contract

For a given search request:

1. If the request's destination (hotel/activity: `criteria.destination`;
   transfer: `criteria.to`, falling back to `criteria.from`), trimmed and
   lower-cased, matches one of `lookupCuratedCity`'s known keys (`lisbon`,
   `tokyo`, `marrakech`, `reykjavik`), the adapter returns ONLY the curated
   offers for that city (registered into the engine, same as today's
   procedural offers) — it does NOT also append the generic procedural
   offers for that request.
2. Otherwise, behavior is BYTE-IDENTICAL to today: the existing procedural
   two-item generation runs unchanged.
3. The `sandbox-fail-book` fixture offer (always registered at adapter
   construction, used by partial-failure tests) is unaffected either way —
   it is not part of `search()`'s return value in either branch.

## Data requirements per curated offer

- `title`: a realistic, human-recognizable name (never containing the raw
  destination string mechanically prefixed, e.g. NOT `"Lisbon Grand"` —
  curated names are independently authored, e.g. `"Casa do Alfama"`).
- `description`: one short sentence.
- `imageUrl`: a licensed stock photo source URL (Unsplash or Pexels source
  URL only — never a scraped search-engine image result, never an
  AI-generated image presented as a real photo).
- `attribution`: a short credit string for the image source.
- `netRateMinor` + `currency`: integer minor units, explicit ISO currency —
  hotel/transfer in USD, activity in EUR (matches today's procedural
  convention).
- Activities additionally carry `durationMinutes`; transfers additionally
  carry `mode: "private" | "shared"` and come in outbound + `-return`-suffixed
  pairs, mirroring `transfer.ts`'s existing offerId convention.

## Non-goals

- This contract does not change `HotelPort`/`ActivityPort`/`TransferPort`
  (the port interfaces) or any type outside `packages/supply-adapter`.
- This contract does not thread `imageUrl`/`attribution` into the canonical
  itinerary item's `media` array — see research.md D5.
