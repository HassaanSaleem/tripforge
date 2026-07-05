// THE canonical itinerary schema (Constitution IV, INV-001). This is the ONLY
// place an itinerary-shaped type may be declared; every layer imports from here.
//
// seed-0001 scope: a VERSIONED STUB. The full entity graph (day/item/media/pricing)
// is seed-0002 and lands with a migration note + a schema version bump (ALWAYS-HALT
// operator gate). Do not fork or privately extend this type elsewhere.
import { z } from "zod";

/**
 * Schema version. seed-0001 establishes the initial version; any change to the
 * shape below is a versioned migration (seed-0002+). A version BUMP is an
 * operator-gated event per the constitution — never done autonomously by the loop.
 */
export const SCHEMA_VERSION = "0.0.0" as const;

/**
 * Provenance travels WITH the itinerary (INV-002): who authored it, the license
 * terms it is offered under, the revenue-share obligation it carries, and its
 * rebrand lineage when white-labeled. Marketplace listing (seed-0006) makes these
 * mandatory; at v0 they are optional placeholders so the shape is reserved.
 */
export const ProvenanceSchema = z.object({
  originalAuthorAgencyId: z.string().min(1).optional(),
  licenseTerms: z.string().optional(),
  revenueShareBps: z.number().int().min(0).max(10_000).optional(),
  rebrandLineage: z.array(z.string()).default([]),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Itinerary (v0 stub). Deliberately minimal — enough to be persisted, referenced,
 * and version-checked. seed-0002 expands `days`/`items`/`pricing` under this same
 * schema package.
 */
export const ItinerarySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().min(1),
  agencyId: z.string().min(1),
  title: z.string().min(1),
  provenance: ProvenanceSchema.default({ rebrandLineage: [] }),
});
export type Itinerary = z.infer<typeof ItinerarySchema>;

/** Parse-and-validate an unknown value into a canonical Itinerary. */
export function parseItinerary(input: unknown): Itinerary {
  return ItinerarySchema.parse(input);
}
