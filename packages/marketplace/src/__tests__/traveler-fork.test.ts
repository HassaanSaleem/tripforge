// L1 — the pure traveler-fork transform (spec 041 FR-004/005; bound a): a fork
// keeps the copy owned by the ORIGINATING (seller) agency and leaves provenance
// untouched (it is NOT a resale), changing only the id. Contrast with
// whiteLabelCopy, which re-homes to a reseller and stamps revenue-share.
import { describe, expect, it } from "vitest";
import { ItinerarySchema, type Itinerary } from "@tripforge/itinerary-schema";
import { travelerForkCopy } from "../traveler-fork.js";

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

describe("travelerForkCopy (pure)", () => {
  it("replaces only the id — agency ownership and provenance are UNCHANGED (a fork is not a resale)", () => {
    const source = baseItinerary();
    const copy = travelerForkCopy(source, { copyId: "itin-fork" });
    expect(copy.id).toBe("itin-fork");
    // Ownership stays with the seller (bound a) — never re-homed to a traveler.
    expect(copy.agencyId).toBe("agency-seller");
    // Provenance is byte-identical — no license/rebrand stamp (Constitution VI).
    expect(copy.provenance).toEqual(source.provenance);
    // Content copied verbatim so the copy is quotable/bookable like the source.
    expect(copy.days).toEqual(source.days);
    expect(copy.title).toBe(source.title);
    expect(copy.currency).toBe(source.currency);
    // The copy is a valid canonical itinerary (re-validated on write, INV-001).
    expect(() => ItinerarySchema.parse(copy)).not.toThrow();
  });

  it("does not mutate the source document", () => {
    const source = baseItinerary();
    const before = structuredClone(source);
    travelerForkCopy(source, { copyId: "itin-fork" });
    expect(source).toEqual(before);
  });

  it("gives each fork its own id (independent copies, SC-004)", () => {
    const source = baseItinerary();
    const a = travelerForkCopy(source, { copyId: "fork-a" });
    const b = travelerForkCopy(source, { copyId: "fork-b" });
    expect(a.id).toBe("fork-a");
    expect(b.id).toBe("fork-b");
    expect(a.id).not.toBe(b.id);
  });
});
