// discoverDestinationCatalog output vocabulary (web-search grounding stopgap).
// A set of REAL, named inventory for a destination — the value the web search
// adds is authentic place names + descriptions (real hotels, attractions,
// airport transfers), so the AI builder stops emitting generic "<City> Grand"
// placeholders for anywhere outside the four static hero cities.
//
// Prices are INDICATIVE demo bands in the itinerary currency, NOT live net
// rates — real, bookable pricing arrives with the booking.com/sastaticket
// adapters. This shape carries no offerId, no provenance, no version: it is a
// discovery vocabulary that the composition root maps onto the sandbox
// adapter's existing curated-catalog shape (INV-001/INV-005 unaffected).
//
// Validated with zod at the submit-tool boundary (same guarantee as
// submit_itinerary_drafts): a malformed catalog is fed back to the model for
// retry, never accepted.
import { z } from "zod";

export const DestinationCatalogSchema = z.strictObject({
  hotels: z
    .array(
      z.strictObject({
        name: z.string().min(1).describe("Real hotel/guesthouse name at this destination"),
        description: z.string().min(1).describe("One factual sentence — location/character"),
        nightlyRateMinor: z.number().int().positive().describe("Indicative per-night price in minor units of the itinerary currency"),
      }),
    )
    .min(1)
    .max(4)
    .describe("2-4 real, distinct places to stay, cheaper to pricier"),
  activities: z
    .array(
      z.strictObject({
        name: z.string().min(1).describe("Real attraction, tour, or experience at this destination"),
        description: z.string().min(1).describe("One factual sentence about it"),
        priceMinor: z.number().int().positive().describe("Indicative price in minor units of the itinerary currency"),
        durationMinutes: z.number().int().positive().max(1440),
      }),
    )
    .min(1)
    .max(6)
    .describe("3-6 real things to do — named landmarks/tours, not generic 'city tour'"),
  transfers: z
    .array(
      z.strictObject({
        name: z.string().min(1).describe("Airport/ground transfer description"),
        priceMinor: z.number().int().positive().describe("Indicative price in minor units of the itinerary currency"),
        mode: z.enum(["private", "shared"]),
      }),
    )
    .min(1)
    .max(3)
    .describe("1-3 airport transfer options"),
});

export type DestinationCatalog = z.infer<typeof DestinationCatalogSchema>;
