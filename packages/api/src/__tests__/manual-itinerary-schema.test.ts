// L1 — createManualItineraryInputSchema pure validation (spec 029
// contracts/manual-itinerary.md). No DB, no container — every rejectable
// condition (malformed dates, checkOut <= checkIn, non-positive party
// counts, an item missing its kind-specific required field) must be a zod
// parse failure at the input boundary, matching the groupTravel.post
// precedent cited in the contract (no runtime "invalid" status needed).
import { describe, it, expect } from "vitest";
import { createManualItineraryInputSchema } from "../services/itineraries.js";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Lisbon long weekend",
    currency: "usd",
    destination: "Lisbon",
    checkIn: "2026-09-01",
    checkOut: "2026-09-04",
    party: { adults: 2, children: 0 },
    days: [
      {
        dayNumber: 1,
        date: "2026-09-01",
        items: [
          {
            kind: "stay",
            title: "Hand-picked boutique hotel",
            checkIn: "2026-09-01",
            checkOut: "2026-09-04",
            occupancy: { adults: 2, children: 0 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("createManualItineraryInputSchema", () => {
  it("accepts a well-formed manual itinerary and uppercases the currency", () => {
    const parsed = createManualItineraryInputSchema.parse(validInput());
    expect(parsed.currency).toBe("USD");
    expect(parsed.days[0]?.items[0]).toMatchObject({ kind: "stay", title: "Hand-picked boutique hotel" });
  });

  it("accepts zero days (a sparse draft is valid — spec Edge Cases)", () => {
    const parsed = createManualItineraryInputSchema.parse(validInput({ days: [] }));
    expect(parsed.days).toEqual([]);
  });

  it("never accepts a client-supplied supplyRef or pricing on an item", () => {
    const withPricing = validInput();
    (withPricing.days[0] as { items: Record<string, unknown>[] }).items[0] = {
      kind: "activity",
      title: "Fado evening",
      pricing: { netRate: { amountMinor: 1000, currency: "USD" }, sellPrice: { amountMinor: 1500, currency: "USD" } },
    };
    expect(() => createManualItineraryInputSchema.parse(withPricing)).toThrow();
  });

  it("rejects checkOut on/before checkIn", () => {
    expect(() => createManualItineraryInputSchema.parse(validInput({ checkOut: "2026-09-01" }))).toThrow();
    expect(() => createManualItineraryInputSchema.parse(validInput({ checkOut: "2026-08-30" }))).toThrow();
  });

  it("rejects a malformed date", () => {
    expect(() => createManualItineraryInputSchema.parse(validInput({ checkIn: "Sept 1" }))).toThrow();
  });

  it("rejects a non-3-letter currency", () => {
    expect(() => createManualItineraryInputSchema.parse(validInput({ currency: "US" }))).toThrow();
  });

  it("rejects zero or negative adults", () => {
    expect(() => createManualItineraryInputSchema.parse(validInput({ party: { adults: 0, children: 0 } }))).toThrow();
  });

  it("rejects a stay item missing its required checkIn/checkOut", () => {
    const input = validInput();
    (input.days[0] as { items: Record<string, unknown>[] }).items[0] = { kind: "stay", title: "No dates" };
    expect(() => createManualItineraryInputSchema.parse(input)).toThrow();
  });

  it("accepts an activity item with no startsAt/durationMinutes (both optional)", () => {
    const input = validInput({
      days: [{ dayNumber: 1, items: [{ kind: "activity", title: "Wander the old town" }] }],
    });
    const parsed = createManualItineraryInputSchema.parse(input);
    expect(parsed.days[0]?.items[0]).toEqual({ kind: "activity", title: "Wander the old town" });
  });

  it("accepts a transfer item with a valid mode", () => {
    const input = validInput({
      days: [{ dayNumber: 1, items: [{ kind: "transfer", title: "Airport pickup", from: "LIS", to: "Hotel", mode: "private" }] }],
    });
    expect(() => createManualItineraryInputSchema.parse(input)).not.toThrow();
  });

  it("rejects an unknown item kind", () => {
    const input = validInput({
      days: [{ dayNumber: 1, items: [{ kind: "flight", title: "Not a real kind" }] }],
    });
    expect(() => createManualItineraryInputSchema.parse(input)).toThrow();
  });

  it("rejects an unknown top-level field (strict boundary)", () => {
    expect(() => createManualItineraryInputSchema.parse(validInput({ budget: { mode: "target", amountMinor: 1, currency: "USD" } }))).toThrow();
  });
});
