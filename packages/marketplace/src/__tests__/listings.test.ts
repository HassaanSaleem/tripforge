// L1 — input-schema bounds and the pure classification pieces of the listing
// flows (spec 006 T009). The db-dependent branches (vetting, tenancy, races,
// atomicity) are covered by the L3 suite in packages/api (l3-marketplace).
import { describe, expect, it } from "vitest";
import { createListingInputSchema, deactivateListingInputSchema } from "../listings.js";
import { licenseListingInputSchema } from "../licensing.js";
import { rateListingInputSchema } from "../ratings.js";
import { isUniqueViolation } from "../pg-errors.js";
import { DEFAULT_PLATFORM_TAKE_RATE_BPS } from "../config.js";

const UUID = "3f1e9a52-7c44-4b8e-9a3e-2f60d1a0b9c1";

describe("createListing input bounds (contracts §1)", () => {
  const valid = {
    itineraryId: UUID,
    title: "Lisbon long weekend",
    priceMinor: 25_000,
    licenseTerms: "White-label allowed",
    revenueShareBps: 750,
  };
  it("accepts a valid input", () => {
    expect(createListingInputSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    ["non-uuid itinerary", { ...valid, itineraryId: "nope" }],
    ["empty title", { ...valid, title: "" }],
    ["title over 200", { ...valid, title: "x".repeat(201) }],
    ["negative price", { ...valid, priceMinor: -1 }],
    ["float price", { ...valid, priceMinor: 10.5 }],
    ["empty terms", { ...valid, licenseTerms: "" }],
    ["terms over 2000", { ...valid, licenseTerms: "x".repeat(2001) }],
    ["bps below 0", { ...valid, revenueShareBps: -1 }],
    ["bps above 10000", { ...valid, revenueShareBps: 10_001 }],
    ["float bps", { ...valid, revenueShareBps: 99.5 }],
    ["unknown field", { ...valid, resale: true }],
  ])("rejects %s", (_name, input) => {
    expect(() => createListingInputSchema.parse(input)).toThrow();
  });
  it("a zero price is a valid seller choice (free listing)", () => {
    expect(createListingInputSchema.parse({ ...valid, priceMinor: 0 }).priceMinor).toBe(0);
  });
});

describe("license / deactivate / rate input bounds (contracts §3–5)", () => {
  it("licence + deactivate take a uuid listing id only", () => {
    expect(licenseListingInputSchema.parse({ listingId: UUID })).toEqual({ listingId: UUID });
    expect(deactivateListingInputSchema.parse({ listingId: UUID })).toEqual({ listingId: UUID });
    expect(() => licenseListingInputSchema.parse({ listingId: "nope" })).toThrow();
    expect(() => deactivateListingInputSchema.parse({ listingId: UUID, force: true })).toThrow();
  });
  it("stars are an integer 1..5; comment capped at 1000", () => {
    expect(rateListingInputSchema.parse({ listingId: UUID, stars: 5 }).stars).toBe(5);
    expect(rateListingInputSchema.parse({ listingId: UUID, stars: 1, comment: "ok" }).comment).toBe("ok");
    for (const stars of [0, 6, 3.5, -1]) {
      expect(() => rateListingInputSchema.parse({ listingId: UUID, stars })).toThrow();
    }
    expect(() => rateListingInputSchema.parse({ listingId: UUID, stars: 3, comment: "x".repeat(1001) })).toThrow();
  });
});

describe("isUniqueViolation — pg 23505 detection through cause chains", () => {
  it("matches a direct pg error and a wrapped one", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("wrapped", { cause: { code: "23505" } }))).toBe(true);
    expect(isUniqueViolation(new Error("deep", { cause: new Error("mid", { cause: { code: "23505" } }) }))).toBe(true);
  });
  it("rejects everything else (other codes, non-objects, cycles bounded)", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    const cyclic: { code: string; cause?: unknown } = { code: "0" };
    cyclic.cause = cyclic;
    expect(isUniqueViolation(cyclic)).toBe(false);
  });
});

describe("platform take-rate default (D-0006.b)", () => {
  it("is 1000 bps (10%) pending the operator pricing decision", () => {
    expect(DEFAULT_PLATFORM_TAKE_RATE_BPS).toBe(1000);
  });
});
