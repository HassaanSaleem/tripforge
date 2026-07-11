// L1 — classification of what parseItinerary (INV-001) can throw (seed-0021).
// Pins the duck-typed check works across BOTH failure modes parseItinerary
// produces (zod ItinerarySchema.parse ZodError, and the explicit
// unknown-schemaVersion Error) and rejects unrelated errors, since those must
// still surface as a genuine server fault, not a masked typed refusal.
import { describe, it, expect } from "vitest";
import { parseItinerary } from "@tripforge/itinerary-schema";
import { isItineraryValidationError, summarizeItineraryValidationError } from "../services/itinerary-read-guard.js";

describe("isItineraryValidationError", () => {
  it("recognizes a REAL ZodError thrown by parseItinerary's own zod (v3) instance", () => {
    let caught: unknown;
    try {
      parseItinerary({ schemaVersion: "0.1.0", days: "not-an-array" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(isItineraryValidationError(caught)).toBe(true);
  });

  it("recognizes the explicit unknown-schemaVersion Error", () => {
    let caught: unknown;
    try {
      parseItinerary({ schemaVersion: "9.9.9" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isItineraryValidationError(caught)).toBe(true);
  });

  it("accepts ANY error shaped like a ZodError (name + issues array), not just instanceof", () => {
    // packages/api pins zod v4 while @tripforge/itinerary-schema pins zod v3 —
    // two distinct installed packages in the pnpm workspace, so `instanceof`
    // against api's own "zod" import would NOT match a ZodError thrown by
    // ItinerarySchema.parse. The guard must accept either by shape
    // (`.name === "ZodError"` + `.issues` array), never by `instanceof`.
    class FakeZodError extends Error {
      issues = [{ path: [], message: "x" }];
      constructor() {
        super("fake validation error");
        this.name = "ZodError";
      }
    }
    expect(isItineraryValidationError(new FakeZodError())).toBe(true);
  });

  it("rejects an unrelated error (genuine server/infra fault must still surface as a 500)", () => {
    expect(isItineraryValidationError(new Error("ECONNREFUSED"))).toBe(false);
    expect(isItineraryValidationError("not an error")).toBe(false);
    expect(isItineraryValidationError(null)).toBe(false);
    expect(isItineraryValidationError(undefined)).toBe(false);
  });
});

describe("summarizeItineraryValidationError", () => {
  it("summarizes a real parseItinerary ZodError with issue count + first path — never the raw document", () => {
    let caught: unknown;
    try {
      parseItinerary({
        schemaVersion: "0.1.0",
        id: "x",
        agencyId: "a",
        title: "t",
        currency: "USD",
        days: [],
        media: [{ id: "m", kind: "image", url: "u", alt: "a", source: "scraped-web" }],
        pricing: { budgetMode: "target", total: { amountMinor: 0, currency: "USD" }, categories: [] },
        provenance: { rebrandLineage: [] },
      });
    } catch (err) {
      caught = err;
    }
    const summary = summarizeItineraryValidationError(caught);
    expect(summary).toMatch(/^\d+ issue\(s\), first at /);
  });

  it("falls back to the message for a non-Zod Error", () => {
    expect(summarizeItineraryValidationError(new Error("unknown itinerary schemaVersion: 9.9.9"))).toBe(
      "unknown itinerary schemaVersion: 9.9.9",
    );
  });
});
