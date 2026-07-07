// THE canonical itinerary schema (Constitution IV, INV-001). This package is the
// ONLY place an itinerary-, day-, item-, media-ref-, or pricing-shaped type may be
// declared; every layer imports the type from here and no layer forks or privately
// extends it. The package is a leaf (INV-017): it imports only `zod`. Money is
// carried structurally (`{ amountMinor, currency }`), matching packages/domain's
// Money shape WITHOUT importing it, so the leaf boundary holds.
//
// v0 (SCHEMA_VERSION "0.1.0") — the full entity graph, landed under operator gate
// D-006 (a canonical-schema version bump is ALWAYS-HALT). Any future shape change
// bumps the version, adds a migrator (see migrate.ts), and is operator-gated.

// Money (structural — INV-009)
export { MoneySchema, type Money } from "./money.js";

// MediaRef + the closed, licensed-only source enum (Constitution Compliance)
export { MediaSourceSchema, MediaRefSchema, type MediaSource, type MediaRef } from "./media.js";

// Item discriminated union (stay | activity | transfer) + per-item pricing snapshot
export {
  ItemSchema,
  StayItemSchema,
  ActivityItemSchema,
  TransferItemSchema,
  ItemPricingSchema,
  type Item,
  type StayItem,
  type ActivityItem,
  type TransferItem,
  type ItemPricing,
} from "./item.js";

// Day
export { DaySchema, type Day } from "./day.js";

// PricingBlock / budget breakdown (Constitution III categories, INV-015)
export {
  PricingBlockSchema,
  BudgetCategorySchema,
  BudgetAllocationSchema,
  type PricingBlock,
  type BudgetCategory,
  type BudgetAllocation,
} from "./pricing.js";

// Provenance (INV-002)
export { ProvenanceSchema, type Provenance } from "./provenance.js";

// Itinerary root + the ListedItinerary marketplace refinement + SCHEMA_VERSION
export {
  ItinerarySchema,
  ListedItinerarySchema,
  SCHEMA_VERSION,
  type Itinerary,
  type ListedItinerary,
} from "./itinerary.js";

// parseItinerary (migrate-then-validate) + the worked-example migrator
export { parseItinerary, upgradeFrom000 } from "./migrate.js";
