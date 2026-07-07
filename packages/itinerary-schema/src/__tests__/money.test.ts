// T011 / US2 (SC-002, FR-008): every Money on the schema is integer-minor + currency;
// a fractional or currency-less amount fails; and all Money on one itinerary must
// share the itinerary currency (single-currency refinement).
import { describe, it, expect } from "vitest";
import { MoneySchema, parseItinerary } from "../index.js";
import { baseItineraryInput } from "./fixtures.js";

describe("Money value safety (US2, INV-009)", () => {
  it("accepts an integer minor amount + 3-letter currency", () => {
    expect(MoneySchema.parse({ amountMinor: 19999, currency: "USD" })).toEqual({
      amountMinor: 19999,
      currency: "USD",
    });
  });

  it("rejects a fractional amountMinor", () => {
    expect(MoneySchema.safeParse({ amountMinor: 12.5, currency: "USD" }).success).toBe(false);
  });

  it("rejects a missing currency", () => {
    expect(MoneySchema.safeParse({ amountMinor: 100 }).success).toBe(false);
  });

  it("rejects a malformed (non-3-letter) currency", () => {
    expect(MoneySchema.safeParse({ amountMinor: 100, currency: "US" }).success).toBe(false);
  });

  it("rejects unknown keys on a Money (strict)", () => {
    expect(
      MoneySchema.safeParse({ amountMinor: 100, currency: "USD", fx: 1.1 }).success,
    ).toBe(false);
  });
});

describe("single-currency consistency across the itinerary (FR-008)", () => {
  it("accepts an itinerary whose every Money matches the itinerary currency", () => {
    expect(() => parseItinerary(baseItineraryInput())).not.toThrow();
  });

  it("rejects a nested item Money in a foreign currency", () => {
    const bad = baseItineraryInput();
    // Poke a foreign currency onto the first stay item's sell price.
    const days = bad.days as Array<{ items: Array<Record<string, unknown>> }>;
    (days[0]!.items[0]!.pricing as { sellPrice: { currency: string } }).sellPrice.currency = "EUR";
    expect(() => parseItinerary(bad)).toThrow(/currency mismatch/);
  });

  it("rejects a budget category allocation in a foreign currency", () => {
    const bad = baseItineraryInput();
    const pricing = bad.pricing as { categories: Array<{ allocated: { currency: string } }> };
    pricing.categories[0]!.allocated.currency = "GBP";
    expect(() => parseItinerary(bad)).toThrow(/currency mismatch/);
  });
});
