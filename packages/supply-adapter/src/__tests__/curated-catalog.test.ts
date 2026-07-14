// L1 — curated hero-city catalog lookup (demo-01-seed, spec 017): a pure
// function, no I/O. Every curated offer must carry BOTH an image and its
// attribution together (Compliance & Content Sourcing — never an
// unattributed licensed photo).
import { describe, expect, it } from "vitest";
import { lookupCuratedCity } from "../sandbox/curated-catalog.js";

const HERO_CITIES = ["lisbon", "tokyo", "marrakech", "reykjavik"];

describe("lookupCuratedCity", () => {
  it.each(HERO_CITIES)("resolves %s regardless of casing/whitespace", (city) => {
    const exact = lookupCuratedCity(city);
    const messy = lookupCuratedCity(`  ${city.toUpperCase()}  `);
    expect(exact).toBeDefined();
    expect(messy).toEqual(exact);
  });

  it("returns undefined for a non-curated destination", () => {
    expect(lookupCuratedCity("Paris")).toBeUndefined();
    expect(lookupCuratedCity("")).toBeUndefined();
  });

  it.each(HERO_CITIES)("every %s hotel/activity carries both imageUrl and attribution", (city) => {
    const catalog = lookupCuratedCity(city);
    expect(catalog).toBeDefined();
    if (!catalog) return;
    expect(catalog.hotels.length).toBeGreaterThanOrEqual(3);
    expect(catalog.activities.length).toBeGreaterThanOrEqual(4);
    expect(catalog.transfers.length).toBeGreaterThanOrEqual(2);
    for (const offer of [...catalog.hotels, ...catalog.activities]) {
      expect(offer.imageUrl).toMatch(/^https:\/\/(images|plus)\.unsplash\.com\//);
      expect(offer.attribution.length).toBeGreaterThan(0);
      expect(Number.isInteger(offer.netRateMinor)).toBe(true);
      expect(offer.netRateMinor).toBeGreaterThan(0);
      expect(offer.currency).not.toBe("");
    }
    for (const transfer of catalog.transfers) {
      expect(Number.isInteger(transfer.netRateMinor)).toBe(true);
      expect(["private", "shared"]).toContain(transfer.mode);
    }
  });
});
