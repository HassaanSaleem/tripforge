// L1 — the pure white-label transform (spec 006 FR-009, T012): provenance
// travels, the ORIGINAL author survives chains of resale, lineage extends,
// and the source document is never mutated.
import { describe, expect, it } from "vitest";
import { ItinerarySchema, ListedItinerarySchema, type Itinerary } from "@tripforge/itinerary-schema";
import { whiteLabelCopy } from "../white-label.js";

function baseItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return ItinerarySchema.parse({
    id: "itin-source",
    agencyId: "agency-seller",
    title: "Lisbon long weekend",
    currency: "USD",
    days: [],
    media: [],
    pricing: { budgetMode: "target", total: { amountMinor: 250_000, currency: "USD" } },
    provenance: {
      originalAuthorAgencyId: "agency-seller",
      licenseTerms: "White-label allowed, no sublicensing",
      revenueShareBps: 750,
      rebrandLineage: [],
    },
    ...overrides,
  });
}

describe("whiteLabelCopy (pure)", () => {
  it("re-homes the copy to the reseller and stamps the listing terms", () => {
    const source = baseItinerary();
    const copy = whiteLabelCopy(source, {
      copyId: "itin-copy",
      resellerAgencyId: "agency-reseller",
      licenseTerms: "Listing terms v1",
      revenueShareBps: 500,
      sourceItineraryId: "row-source-1",
    });
    expect(copy.id).toBe("itin-copy");
    expect(copy.agencyId).toBe("agency-reseller");
    expect(copy.provenance).toEqual({
      originalAuthorAgencyId: "agency-seller",
      licenseTerms: "Listing terms v1",
      revenueShareBps: 500,
      rebrandLineage: ["row-source-1"],
    });
    // The copy satisfies BOTH the canonical schema and the listed refinement.
    expect(() => ItinerarySchema.parse(copy)).not.toThrow();
    expect(() => ListedItinerarySchema.parse(copy)).not.toThrow();
  });

  it("preserves the ORIGINAL author across a two-hop resale chain", () => {
    const source = baseItinerary();
    const hop1 = whiteLabelCopy(source, {
      copyId: "itin-hop1",
      resellerAgencyId: "agency-b",
      licenseTerms: "terms-1",
      revenueShareBps: 400,
      sourceItineraryId: "row-source-1",
    });
    const hop2 = whiteLabelCopy(hop1, {
      copyId: "itin-hop2",
      resellerAgencyId: "agency-c",
      licenseTerms: "terms-2",
      revenueShareBps: 300,
      sourceItineraryId: "row-hop1",
    });
    expect(hop2.provenance.originalAuthorAgencyId).toBe("agency-seller"); // first author wins
    expect(hop2.provenance.rebrandLineage).toEqual(["row-source-1", "row-hop1"]);
    expect(hop2.agencyId).toBe("agency-c");
  });

  it("falls back to the source's agency when the author field was never stamped", () => {
    const source = baseItinerary({
      provenance: { rebrandLineage: [] },
    });
    const copy = whiteLabelCopy(source, {
      copyId: "itin-copy",
      resellerAgencyId: "agency-reseller",
      licenseTerms: "terms",
      revenueShareBps: 0,
      sourceItineraryId: "row-source-1",
    });
    expect(copy.provenance.originalAuthorAgencyId).toBe("agency-seller");
  });

  it("does not mutate the source document", () => {
    const source = baseItinerary();
    const frozen = JSON.parse(JSON.stringify(source));
    whiteLabelCopy(source, {
      copyId: "itin-copy",
      resellerAgencyId: "agency-reseller",
      licenseTerms: "terms",
      revenueShareBps: 100,
      sourceItineraryId: "row-source-1",
    });
    expect(source).toEqual(frozen);
  });
});
