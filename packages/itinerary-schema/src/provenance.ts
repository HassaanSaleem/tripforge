// Provenance travels WITH the itinerary (INV-002): who authored it, the license
// terms it is offered under, the revenue-share obligation it carries (basis points),
// and its rebrand lineage when white-labeled. On the base itinerary these are
// optional (a freshly-built, unlisted trip need not declare license terms yet); the
// marketplace LISTING path makes author + license + revenue-share mandatory via the
// ListedItinerary refinement (defined in itinerary.ts to avoid a circular import).
//
// NOTE: the field names/shape here are preserved from the seed-0001 stub so
// packages/domain's `stampProvenance` keeps compiling unchanged (FR-010, SC-004).
import { z } from "zod";

export const ProvenanceSchema = z
  .object({
    originalAuthorAgencyId: z.string().min(1).optional(),
    licenseTerms: z.string().optional(),
    revenueShareBps: z.number().int().min(0).max(10_000).optional(),
    rebrandLineage: z.array(z.string()).default([]),
  })
  .strict();
export type Provenance = z.infer<typeof ProvenanceSchema>;
