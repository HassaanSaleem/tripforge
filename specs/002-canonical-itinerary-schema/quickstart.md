# Quickstart: Consuming the Canonical Itinerary Schema v0

**Feature**: `002-canonical-itinerary-schema` | **Status**: design-only (landing
gated on OPERATOR-DESK **D-006**)

> This shows how downstream packages will consume the v0 schema **once landed**.
> The imports resolve today only for `parseItinerary` / `Provenance` (the stub);
> the entity types (`Day`, `Item`, `PricingBlock`, `ListedItinerary`) resolve
> after D-006 authorizes the implementation.

## The one rule (INV-001)

Every package that touches an itinerary imports its types from
`@tripforge/itinerary-schema` — and **only** from there. No package declares its
own itinerary-, day-, item-, media-ref-, or pricing-shaped type.

```ts
import {
  parseItinerary, ItinerarySchema, type Itinerary,
  type Day, type Item, type PricingBlock,
  ListedItinerarySchema, type ListedItinerary,
  SCHEMA_VERSION,
} from "@tripforge/itinerary-schema";
```

## Validate at every boundary

```ts
// api/db/marketplace: never trust an unvalidated itinerary
const itinerary = parseItinerary(untrustedInput); // throws on bad shape / unknown version
```

## Build a v0 itinerary (illustrative)

```ts
const trip = parseItinerary({
  id: "itin_123", agencyId: "agc_1", title: "5 Days in Lisbon",
  currency: "EUR",
  days: [{ dayNumber: 1, items: [
    { kind: "stay", id: "i1", title: "Hotel Baixa", checkIn: "2026-09-01",
      checkOut: "2026-09-03", occupancy: { adults: 2 },
      pricing: { netRate: { amountMinor: 24000, currency: "EUR" },
                 sellPrice: { amountMinor: 28800, currency: "EUR" } } },
  ]}],
  pricing: { budgetMode: "target", total: { amountMinor: 150000, currency: "EUR" },
    categories: [{ category: "accommodation", allocated: { amountMinor: 60000, currency: "EUR" } }] },
  provenance: { rebrandLineage: [] },
});
// schemaVersion defaults to SCHEMA_VERSION; all Money is integer-minor EUR.
```

## Money is integer-minor + currency (INV-009)

```ts
// ✅ { amountMinor: 28800, currency: "EUR" }   → 288.00 EUR
// ❌ 288.0  (float)  ·  ❌ { amountMinor: 288.5 }  ·  ❌ { amountMinor: 28800 } (no currency)
```

Money **math** (markup, take-rate, revenue-share splits) lives in
`packages/domain` (INV-010) — the schema carries values, `domain` computes.

## Listing on the marketplace needs full provenance (INV-002/012)

```ts
const listed = ListedItinerarySchema.parse(trip); // requires author + licenseTerms + revenueShareBps
// seed-0006 enforces this inside the license/white-label transaction.
```

## Verifying the boundary

```bash
npm test --workspace @tripforge/itinerary-schema   # L1: roundtrip, money, provenance, migration
npx depcruise packages/itinerary-schema            # INV-017: leaf (zod only)
# grep-clean: no itinerary-shaped type outside packages/itinerary-schema (INV-001)
```
