// Pure domain operation over the canonical itinerary (INV-010: business logic
// lives here, not in handlers). Stamps authorship/revenue-share provenance onto an
// itinerary — the primitive the marketplace list/license flow (seed-0006) uses so
// provenance travels with the trip (INV-002). Pure: no I/O, returns a new value.
import type { Itinerary, Provenance } from "@tripforge/itinerary-schema";

export function stampProvenance(
  itinerary: Itinerary,
  authorAgencyId: string,
  terms: Pick<Provenance, "licenseTerms" | "revenueShareBps"> = {},
): Itinerary {
  return {
    ...itinerary,
    provenance: {
      ...itinerary.provenance,
      originalAuthorAgencyId: itinerary.provenance.originalAuthorAgencyId ?? authorAgencyId,
      licenseTerms: terms.licenseTerms ?? itinerary.provenance.licenseTerms,
      revenueShareBps: terms.revenueShareBps ?? itinerary.provenance.revenueShareBps,
    },
  };
}
