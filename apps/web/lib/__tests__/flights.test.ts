// L1 tests for the flights card's pure logic (spec 026): determinism, the
// 2-3-option invariant, per-destination variation, no-throw on unusual input,
// and the deep-link URL shape (no origin parameter, FR-011).
import { describe, it, expect } from "vitest";
import { buildFlightSearchUrl, indicativeFlightOptions } from "../flights.js";

describe("indicativeFlightOptions", () => {
  it("returns 2 or 3 options", () => {
    const options = indicativeFlightOptions("Lisbon", "2026-09-07", "2026-09-10", "EUR");
    expect(options.length === 2 || options.length === 3).toBe(true);
  });

  it("is deterministic for the same trip", () => {
    const first = indicativeFlightOptions("Lisbon", "2026-09-07", "2026-09-10", "EUR");
    const second = indicativeFlightOptions("Lisbon", "2026-09-07", "2026-09-10", "EUR");
    expect(second).toEqual(first);
  });

  it("is stable across many calls (no per-call randomness)", () => {
    const calls = Array.from({ length: 5 }, () =>
      indicativeFlightOptions("Tokyo", "2026-11-01", "2026-11-08", "USD"),
    );
    for (const call of calls.slice(1)) {
      expect(call).toEqual(calls[0]);
    }
  });

  it("differs across distinct destinations", () => {
    const lisbon = indicativeFlightOptions("Lisbon", "2026-09-07", "2026-09-10", "EUR");
    const tokyo = indicativeFlightOptions("Tokyo", "2026-09-07", "2026-09-10", "EUR");
    expect(lisbon).not.toEqual(tokyo);
  });

  it("differs across distinct date ranges for the same destination", () => {
    const early = indicativeFlightOptions("Lisbon", "2026-09-07", "2026-09-10", "EUR");
    const later = indicativeFlightOptions("Lisbon", "2026-12-01", "2026-12-05", "EUR");
    expect(early).not.toEqual(later);
  });

  it("never throws on an empty destination", () => {
    expect(() => indicativeFlightOptions("", "2026-09-07", "2026-09-10", "EUR")).not.toThrow();
    const options = indicativeFlightOptions("", "2026-09-07", "2026-09-10", "EUR");
    expect(options.length).toBeGreaterThan(0);
  });

  it("never throws on an unusual destination string", () => {
    const weird = "  Reykjavík / Höfn — 'the North' 北 ";
    expect(() => indicativeFlightOptions(weird, "2026-09-07", "2026-09-10", "EUR")).not.toThrow();
    const options = indicativeFlightOptions(weird, "2026-09-07", "2026-09-10", "EUR");
    expect(options.length === 2 || options.length === 3).toBe(true);
  });

  it("every option carries a positive integer price in the requested currency", () => {
    const options = indicativeFlightOptions("Marrakech", "2026-05-01", "2026-05-06", "USD");
    for (const option of options) {
      expect(Number.isInteger(option.priceMinor)).toBe(true);
      expect(option.priceMinor).toBeGreaterThan(0);
      expect(option.currency).toBe("USD");
      expect(option.airline.length).toBeGreaterThan(0);
    }
  });

  it("embeds the check-in/check-out dates in the departure/return labels", () => {
    const [option] = indicativeFlightOptions("Lisbon", "2026-09-07", "2026-09-10", "EUR");
    if (!option) throw new Error("expected at least one indicative flight option");
    expect(option.departureLabel).toContain("2026-09-07");
    expect(option.returnLabel).toContain("2026-09-10");
  });
});

describe("buildFlightSearchUrl", () => {
  it("returns a well-formed https URL", () => {
    const url = buildFlightSearchUrl("Lisbon", "2026-09-07", "2026-09-10");
    expect(() => new URL(url)).not.toThrow();
    expect(url.startsWith("https://")).toBe(true);
  });

  it("encodes the destination and both dates into the URL", () => {
    const url = buildFlightSearchUrl("Lisbon", "2026-09-07", "2026-09-10");
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("Lisbon");
    expect(decoded).toContain("2026-09-07");
    expect(decoded).toContain("2026-09-10");
  });

  it("never includes an origin parameter (FR-011 — origin is unmodeled product-wide)", () => {
    const url = buildFlightSearchUrl("Lisbon", "2026-09-07", "2026-09-10");
    expect(url.toLowerCase()).not.toContain("origin");
    expect(url.toLowerCase()).not.toContain("from=");
  });

  it("never throws on an empty destination", () => {
    expect(() => buildFlightSearchUrl("", "2026-09-07", "2026-09-10")).not.toThrow();
  });
});
