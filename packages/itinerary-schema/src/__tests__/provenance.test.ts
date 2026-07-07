// T012 / US3 (SC-005): the base itinerary accepts partial/empty provenance (build
// time); the ListedItinerary refinement requires author + license + revenue-share
// (marketplace listing path, INV-002/012); rebrand lineage round-trips.
import { describe, it, expect } from "vitest";
import { ItinerarySchema, ListedItinerarySchema, parseItinerary } from "../index.js";
import { baseItineraryInput } from "./fixtures.js";

describe("provenance on the base itinerary (US3, build time)", () => {
  it("accepts an itinerary with empty provenance (defaults rebrandLineage to [])", () => {
    const input = { ...baseItineraryInput(), provenance: {} };
    const parsed = ItinerarySchema.parse(input);
    expect(parsed.provenance.rebrandLineage).toEqual([]);
    expect(parsed.provenance.originalAuthorAgencyId).toBeUndefined();
  });

  it("preserves rebrand lineage through parse → serialize → parse", () => {
    const input = baseItineraryInput();
    (input.provenance as { rebrandLineage: string[] }).rebrandLineage = ["listing_777"];
    const parsed = parseItinerary(input);
    expect(parsed.provenance.rebrandLineage).toEqual(["listing_777"]);
    const reparsed = parseItinerary(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed.provenance.rebrandLineage).toEqual(["listing_777"]);
  });
});

describe("ListedItinerary refinement (marketplace listing path, INV-002/012)", () => {
  it("accepts an itinerary that carries complete provenance", () => {
    expect(() => ListedItinerarySchema.parse(baseItineraryInput())).not.toThrow();
  });

  it("rejects a listing missing originalAuthorAgencyId", () => {
    const input = baseItineraryInput();
    delete (input.provenance as Record<string, unknown>).originalAuthorAgencyId;
    expect(ListedItinerarySchema.safeParse(input).success).toBe(false);
  });

  it("rejects a listing missing licenseTerms", () => {
    const input = baseItineraryInput();
    delete (input.provenance as Record<string, unknown>).licenseTerms;
    expect(ListedItinerarySchema.safeParse(input).success).toBe(false);
  });

  it("rejects a listing missing revenueShareBps", () => {
    const input = baseItineraryInput();
    delete (input.provenance as Record<string, unknown>).revenueShareBps;
    expect(ListedItinerarySchema.safeParse(input).success).toBe(false);
  });

  it("still accepts the SAME incomplete provenance as a BASE itinerary", () => {
    const input = baseItineraryInput();
    delete (input.provenance as Record<string, unknown>).licenseTerms;
    expect(() => ItinerarySchema.parse(input)).not.toThrow();
  });
});
