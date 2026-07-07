// Itinerary root — THE canonical object every layer speaks (Constitution IV,
// INV-001): the builder writes it, the allocator prices it, booking books against
// it, and the marketplace lists/licenses/white-labels it. It ties days + media +
// pricing + provenance under one versioned shape and enforces single-currency
// consistency across every nested Money (FR-008, INV-009).
import { z } from "zod";
import type { Money } from "./money.js";
import { DaySchema } from "./day.js";
import { MediaRefSchema } from "./media.js";
import { PricingBlockSchema } from "./pricing.js";
import { ProvenanceSchema } from "./provenance.js";

/** Single source of truth for the current schema version (FR-002, D-006.a). */
export const SCHEMA_VERSION = "0.1.0" as const;

// Structural view of the money-bearing fields, consumed by the currency-consistency
// refinement. Both the base Itinerary output and the ListedItinerary output satisfy
// it, so one function serves both schemas without an `any`.
interface CurrencyScoped {
  currency: string;
  days: ReadonlyArray<{
    subtotal?: Money;
    items: ReadonlyArray<{ pricing?: { netRate: Money; sellPrice: Money } }>;
  }>;
  pricing: {
    total: Money;
    categories: ReadonlyArray<{ allocated: Money; spent?: Money }>;
  };
}

// FR-008 / INV-009: every Money on one itinerary shares the itinerary currency.
// Cross-currency conversion is an explicit, logged booking-layer operation — never
// stored implicitly here — so a foreign-currency amount is a validation error.
function assertSingleCurrency(itin: CurrencyScoped, ctx: z.RefinementCtx): void {
  const base = itin.currency;
  const check = (m: Money | undefined, path: Array<string | number>): void => {
    if (m && m.currency !== base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `currency mismatch: ${m.currency} vs itinerary ${base}`,
      });
    }
  };
  check(itin.pricing.total, ["pricing", "total", "currency"]);
  itin.pricing.categories.forEach((c, i) => {
    check(c.allocated, ["pricing", "categories", i, "allocated", "currency"]);
    check(c.spent, ["pricing", "categories", i, "spent", "currency"]);
  });
  itin.days.forEach((d, di) => {
    check(d.subtotal, ["days", di, "subtotal", "currency"]);
    d.items.forEach((it, ii) => {
      if (it.pricing) {
        check(it.pricing.netRate, ["days", di, "items", ii, "pricing", "netRate", "currency"]);
        check(it.pricing.sellPrice, ["days", di, "items", ii, "pricing", "sellPrice", "currency"]);
      }
    });
  });
}

// Base object as a plain ZodObject (strict) so it can be `.extend()`ed for
// ListedItinerary BEFORE the refinement is applied — `superRefine` returns a
// ZodEffects, which has no `.extend`.
const itineraryObject = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
    id: z.string().min(1),
    agencyId: z.string().min(1), // tenant scope (INV-004)
    title: z.string().min(1),
    currency: z.string().length(3), // the ONE settled currency (ISO-4217)
    days: z.array(DaySchema).default([]),
    media: z.array(MediaRefSchema).default([]), // itinerary-level gallery
    pricing: PricingBlockSchema,
    provenance: ProvenanceSchema.default({ rebrandLineage: [] }),
  })
  .strict(); // reject unknown top-level fields — no layer smuggles an unversioned extension

export const ItinerarySchema = itineraryObject.superRefine(assertSingleCurrency);
export type Itinerary = z.infer<typeof ItinerarySchema>;

// INV-002/012: a LISTED itinerary MUST carry complete provenance (author + license
// + revenue-share). seed-0006 enforces this inside the marketplace transaction path;
// the schema defines the requirement here so it cannot be bolted on later.
export const ListedItinerarySchema = itineraryObject
  .extend({
    provenance: ProvenanceSchema.required({
      originalAuthorAgencyId: true,
      licenseTerms: true,
      revenueShareBps: true,
    }),
  })
  .superRefine(assertSingleCurrency);
export type ListedItinerary = z.infer<typeof ListedItinerarySchema>;
