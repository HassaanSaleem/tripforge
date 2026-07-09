// The pure white-label transform (spec 006 FR-009, data-model.md "Canonical
// itinerary schema"): re-home a listed itinerary to the reseller's agency with
// provenance that travels (INV-002). Pure — no I/O, no randomness; the caller
// supplies the copy's id. The ORIGINAL author is preserved across chains of
// resale (first author wins), and the rebrand lineage is extended with the
// SOURCE itinerary row id so the chain is reconstructable end-to-end.
import type { Itinerary } from "@tripforge/itinerary-schema";

export interface WhiteLabelOptions {
  /** App-generated uuid — becomes both the copy's document id and its row id. */
  readonly copyId: string;
  readonly resellerAgencyId: string;
  /** License terms from the listing — stamped into the copy's provenance. */
  readonly licenseTerms: string;
  /** Revenue-share obligation (bps) from the listing — travels with the copy. */
  readonly revenueShareBps: number;
  /** The listed source itinerary's row id — appended to the rebrand lineage. */
  readonly sourceItineraryId: string;
}

export function whiteLabelCopy(source: Itinerary, opts: WhiteLabelOptions): Itinerary {
  return {
    ...source,
    id: opts.copyId,
    agencyId: opts.resellerAgencyId,
    provenance: {
      originalAuthorAgencyId: source.provenance.originalAuthorAgencyId ?? source.agencyId,
      licenseTerms: opts.licenseTerms,
      revenueShareBps: opts.revenueShareBps,
      rebrandLineage: [...source.provenance.rebrandLineage, opts.sourceItineraryId],
    },
  };
}
