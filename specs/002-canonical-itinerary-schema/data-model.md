# Data Model: Canonical Itinerary Schema v0

**Feature**: `002-canonical-itinerary-schema` | **Plan**: [plan.md](./plan.md)

> Design artifact. The zod/TypeScript declarations below are the **proposed** v0
> shape for `packages/itinerary-schema`. They are NOT yet implemented — the
> landing is operator-gated (OPERATOR-DESK **D-006**). Field names/types are the
> reviewable proposal; the operator confirms the open decisions in plan.md.

## Entity graph (overview)

```text
Itinerary
├── schemaVersion: "0.1.0"           (literal; SCHEMA_VERSION source of truth)
├── id, agencyId, title              (agencyId = tenant, INV-004)
├── currency: string                 (ISO-4217; the ONE settled currency, FR-008)
├── days: Day[]                      (ordered)
│   └── Day
│       ├── dayNumber: int (≥1)      (stable ordering key)
│       ├── date?: string            (ISO date, optional)
│       ├── subtotal?: Money         (must match itinerary currency)
│       └── items: Item[]            (ordered; may be empty)
│           └── Item  (discriminated union on `kind`)
│               ├── stay      { …common, checkIn, checkOut, occupancy }
│               ├── activity  { …common, startsAt?, durationMinutes? }
│               ├── transfer  { …common, from, to, mode }
│               └── carRental { …common, pickUp, dropOff }   [OPEN: D-006.b]
│               (…common) = { id, kind, title, supplyRef?, media[], pricing? }
├── media: MediaRef[]                (itinerary-level gallery; optional)
├── pricing: PricingBlock            (budget breakdown; persists w/ itinerary, INV-015)
└── provenance: Provenance           (INV-002; optional fields on base type)
```

## Money (structural — INV-009, leaf-safe)

Declared inside `itinerary-schema` (NOT imported from `packages/domain`, to keep
the leaf boundary INV-017). Structurally identical to `domain`'s `Money`.

```ts
export const MoneySchema = z.object({
  amountMinor: z.number().int(),        // integer minor units (cents) — never float
  currency: z.string().length(3),       // ISO-4217, e.g. "USD"
}).strict();
export type Money = z.infer<typeof MoneySchema>;
```

- **Rule**: every monetary field on the itinerary is a `Money` (FR-002/007/008).
- **Currency consistency (FR-008)**: a top-level `Itinerary` refinement asserts
  every nested `Money.currency` equals `Itinerary.currency`. Cross-currency is a
  booking-layer, explicitly-logged conversion (INV-009), not stored implicitly.

## MediaRef (reference only — INV-025, Constitution Compliance)

```ts
export const MediaSourceSchema = z.enum([
  "licensed-stock",   // Google Places Photos / Unsplash / Pexels class
  "official-embed",   // official social embed
  "agent-upload",     // authentic agent-provided asset
  "traveler-ugc",     // authentic traveler UGC
]);                    // NO member for scraped or AI-fabricated-as-real imagery
export const MediaRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "video", "embed"]),
  storageKey: z.string().min(1).optional(), // derived-table/CDN key (db materializes)
  url: z.string().url().optional(),          // for official embeds
  source: MediaSourceSchema,
  alt: z.string().min(1),                     // accessibility + provenance discipline
  attribution: z.string().optional(),
}).strict().refine(m => m.storageKey || m.url, "media ref needs storageKey or url");
```

- Stores **references**, never binaries; static content is materialized into
  Postgres derived tables by `packages/db` (INV-025). Live content is never here.

## Item (discriminated union on `kind`)

Common base + per-kind fields. `supplyRef` is supplier-**agnostic** (INV-005): an
opaque id + a port/component discriminator, never a supplier API shape.

```ts
const ItemBase = {
  id: z.string().min(1),
  title: z.string().min(1),
  supplyRef: z.object({
    port: z.enum(["hotel", "activity", "transfer", "car"]),
    externalId: z.string().min(1),          // opaque to everyone outside the adapter
  }).strict().optional(),
  media: z.array(MediaRefSchema).default([]),
  pricing: ItemPricingSchema.optional(),     // Money snapshot (see below)
};

export const StayItemSchema     = z.object({ kind: z.literal("stay"),     ...ItemBase, checkIn: z.string(), checkOut: z.string(), occupancy: z.object({ adults: z.number().int().min(1), children: z.number().int().min(0).default(0) }).strict() }).strict();
export const ActivityItemSchema = z.object({ kind: z.literal("activity"), ...ItemBase, startsAt: z.string().optional(), durationMinutes: z.number().int().positive().optional() }).strict();
export const TransferItemSchema = z.object({ kind: z.literal("transfer"), ...ItemBase, from: z.string().min(1), to: z.string().min(1), mode: z.enum(["private","shared","rail","other"]) }).strict();
// OPEN (D-006.b): carRental kind
export const CarRentalItemSchema= z.object({ kind: z.literal("carRental"),...ItemBase, pickUp: z.string().min(1), dropOff: z.string().min(1) }).strict();

export const ItemSchema = z.discriminatedUnion("kind", [
  StayItemSchema, ActivityItemSchema, TransferItemSchema, /* CarRentalItemSchema (D-006.b) */
]);
```

**ItemPricing snapshot** — the *values* the booking layer settles on; the *math*
(markup, take-rate) stays pure in `packages/domain` (INV-010). No live-cached rate
lives here (INV-025/026); `supplyRef` links to the port that re-quotes.

```ts
export const ItemPricingSchema = z.object({
  netRate: MoneySchema,       // supplier net (what the agency pays)
  sellPrice: MoneySchema,     // client-facing (net + agency markup; markup computed in domain)
}).strict();
```

## Day

```ts
export const DaySchema = z.object({
  dayNumber: z.number().int().min(1),
  date: z.string().optional(),        // ISO date; optional (unscheduled draft)
  subtotal: MoneySchema.optional(),
  items: z.array(ItemSchema).default([]),
}).strict();
```

## PricingBlock (budget breakdown — Constitution III, INV-015)

```ts
export const BudgetCategorySchema = z.enum([
  "flightsTransport",   // budget anchor in P0 (reserve/manual estimate, no live flights — INV-008/022)
  "accommodation",
  "activities",
  "localTransport",
  "buffer",
]);
export const PricingBlockSchema = z.object({
  budgetMode: z.enum(["hardCap", "target"]),
  total: MoneySchema,
  categories: z.array(z.object({
    category: BudgetCategorySchema,
    allocated: MoneySchema,
    // `spent` (assembled cost) is filled by the allocator (seed-0005); optional at v0
    spent: MoneySchema.optional(),
  }).strict()).default([]),
}).strict();
```

- Persists with the itinerary (INV-015). The allocator (seed-0005) fills
  `categories`/`spent`; v0 only defines the shape.
- Flights/transport is a **reserve/manual estimate** in P0 (no live flight
  lookup, INV-008/022) — the schema carries the category but the allocator treats
  it as the budget anchor, not a profit line.

## Provenance (INV-002) + ListedItinerary refinement

Base `Provenance` keeps the existing stub fields (so `packages/domain`'s
`stampProvenance` is unaffected — FR-010):

```ts
export const ProvenanceSchema = z.object({
  originalAuthorAgencyId: z.string().min(1).optional(),
  licenseTerms: z.string().optional(),
  revenueShareBps: z.number().int().min(0).max(10_000).optional(),
  rebrandLineage: z.array(z.string()).default([]),
}).strict();
```

**ListedItinerary** — the marketplace requirement (INV-002/012), enforced by
seed-0006 at listing time:

```ts
export const ListedItinerarySchema = ItinerarySchema.extend({
  provenance: ProvenanceSchema.required({
    originalAuthorAgencyId: true, licenseTerms: true, revenueShareBps: true,
  }),
});
export type ListedItinerary = z.infer<typeof ListedItinerarySchema>;
```

## Itinerary root

```ts
export const SCHEMA_VERSION = "0.1.0" as const;   // OPEN: D-006.a — operator confirms
export const ItinerarySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().min(1),
  agencyId: z.string().min(1),
  title: z.string().min(1),
  currency: z.string().length(3),
  days: z.array(DaySchema).default([]),
  media: z.array(MediaRefSchema).default([]),
  pricing: PricingBlockSchema,
  provenance: ProvenanceSchema.default({ rebrandLineage: [] }),
}).strict().superRefine(assertSingleCurrency);   // FR-008
export type Itinerary = z.infer<typeof ItinerarySchema>;
```

## Migration convention (FR-002)

```ts
type Migrator = (input: unknown) => unknown;      // pure old→new upgrade
const MIGRATORS: Record<string, Migrator> = {
  "0.0.0": upgradeFrom000,                         // worked example (see plan From→To)
};
export function parseItinerary(input: unknown): Itinerary {
  const version = (input as { schemaVersion?: string })?.schemaVersion;
  if (version && version !== SCHEMA_VERSION) {
    const up = MIGRATORS[version];
    if (!up) throw new Error(`unknown itinerary schemaVersion: ${version}`);
    input = up(input);
  }
  return ItinerarySchema.parse(input);             // strict; unknown fields rejected
}
```

- One `SCHEMA_VERSION`; a registry of pure migrators; unknown versions rejected
  (no silent accept). Any future shape change bumps the version, adds a migrator,
  writes a From→To note — and is **operator-gated** (ALWAYS-HALT).

## Validation rules summary

| Rule | Where | Invariant / FR |
|------|-------|----------------|
| Itinerary type declared only here | package boundary | INV-001 / FR-001 |
| All money = integer-minor + currency | `MoneySchema` | INV-009 / FR-002 |
| Single currency per itinerary | `assertSingleCurrency` | FR-008 |
| No supplier API shape on items | `supplyRef` (opaque) | INV-005 / FR-005 |
| Media source is a licensed enum | `MediaSourceSchema` | Compliance / FR-006 |
| Listed itinerary needs full provenance | `ListedItinerarySchema` | INV-002/012 / FR-009 |
| Unknown schemaVersion rejected | `parseItinerary` | FR-002 |
| Package stays a leaf (zod only) | no workspace imports | INV-017 / FR-011 |
