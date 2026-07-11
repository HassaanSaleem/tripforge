# Data Model: Booked-Price Fidelity on the Client View

**Feature**: specs/013-booked-price-fidelity | **Date**: 2026-07-11

No new tables, no migrations, no canonical-schema change. This feature is a read-side
projection over existing entities.

## Entities consumed (existing, read-only)

### booking_component (packages/db/src/schema.ts)

The per-item realized outcome of a confirmed booking. Fields this feature reads:

| Field | Use here |
|-------|----------|
| `itinerary_id`, `agency_id` | scope (existing `scopedWhere` read in `resolveShareLink` — INV-004; a white-label copy sees only its own agency's bookings) |
| `item_id` | join key to the document item (`booked` mark today; booked price after this feature) |
| `sell_minor` | the confirmed client price (integer minor units) — recorded at quote time as net × markup by pure domain math (spec 005 FR-007) |
| `currency` | recorded itinerary currency; used to construct the domain `Money` so a corrupted cross-currency row fails loudly in the fold (research D3) |

**Cardinality guarantee relied on**: at most ONE confirmed component per (itinerary, item) —
item-level exclusivity (spec 005 FR-016) with the `UNIQUE (itinerary_id, item_id)` backstop.
The projection therefore needs no tie-breaking.

### itinerary document (canonical schema, unchanged)

`item.pricing.sellPrice` keeps draft-estimate semantics: equal to the net rate at assembly
time ("markup applies at quote time"), used as the displayed price ONLY for items without a
confirmed booking. Never written by this feature (spec 010 FR-011).

## Projection value (in-memory, service layer)

### bookedPriceByItemId: Map<itemId, Money>

Built in `resolveShareLink` from the extended component select. Replaces the current
`bookedItemIds: Set<string>` argument of `toClientItineraryView` — the map's key set IS the
booked set, so "booked" and "has a booked price" cannot drift (research D2).

### ClientViewItem / ClientItineraryView (existing payload — semantics amended, shape unchanged)

| Field | Semantics after this feature |
|-------|------------------------------|
| `booked` | unchanged — item has a confirmed booking component |
| `sellMinor` | **booked component sell** when `booked`; document `sellPrice` otherwise; `null` when neither exists |
| `totalSellMinor` | server-side `addMoney` fold of exactly the per-item values shown; `null` when nothing priced |

No new fields cross the trust boundary. Forbidden values (net amounts, markup, supplier ids,
provenance, tenant ids) remain structurally absent — allowlist unchanged (spec 010 FR-007).

## State transitions

None. Read-only projection; no writes anywhere in the feature.
