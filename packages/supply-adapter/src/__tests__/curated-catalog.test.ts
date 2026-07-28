// L1 — curated hero-city catalog lookup (demo-01-seed, spec 017): a pure
// function, no I/O. Every curated offer must carry BOTH an image and its
// attribution together (Compliance & Content Sourcing — never an
// unattributed licensed photo).
import { describe, expect, it } from "vitest";
import { hasCatalog, lookupCuratedCity, registerDynamicCatalog, type CuratedCityCatalog } from "../sandbox/curated-catalog.js";
import { SandboxHotelAdapter } from "../sandbox/hotel.js";

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
      // Static hero cities always carry licensed imagery + attribution (only
      // dynamically-grounded catalogs omit them — asserted separately).
      expect(offer.imageUrl).toMatch(/^https:\/\/(images|plus)\.unsplash\.com\//);
      expect(offer.attribution ?? "").not.toBe("");
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

// L1 — dynamic (web-search-grounded) catalog registry (grounding stopgap).
// Unique destination names per test avoid cross-test pollution of the
// process-global registry.
describe("registerDynamicCatalog / dynamic lookup", () => {
  function dynamicCatalog(prefix: string): CuratedCityCatalog {
    return {
      hotels: [{ title: `${prefix} Riverside Inn`, description: "A real place.", netRateMinor: 12_000, currency: "USD" }],
      activities: [{ title: `${prefix} Valley Trek`, description: "A real hike.", netRateMinor: 4_000, currency: "USD", durationMinutes: 180 }],
      transfers: [{ title: "Airport transfer", netRateMinor: 3_000, currency: "USD", mode: "private" }],
    };
  }

  it("registers a non-hero destination so lookup + hasCatalog resolve it", () => {
    const dest = "Zzz-Dynatown";
    expect(hasCatalog(dest)).toBe(false);
    registerDynamicCatalog(dest, dynamicCatalog("Dynatown"));
    expect(hasCatalog(dest)).toBe(true);
    expect(lookupCuratedCity(`  ${dest.toUpperCase()}  `)?.hotels[0]?.title).toBe("Dynatown Riverside Inn");
  });

  it("never overwrites a static hero city", () => {
    registerDynamicCatalog("Lisbon", dynamicCatalog("Fake"));
    // The static Lisbon catalog still wins.
    expect(lookupCuratedCity("lisbon")?.hotels[0]?.title).toBe("Palácio da Baixa");
  });

  it("flows real names through the sandbox hotel adapter (no offerId/booking change)", async () => {
    const dest = "Zzz-Groundville";
    registerDynamicCatalog(dest, dynamicCatalog("Groundville"));
    const offers = await new SandboxHotelAdapter().search({ destination: dest, checkIn: "2026-09-01", checkOut: "2026-09-04", guests: 2 });
    expect(offers.map((o) => o.content.title)).toContain("Groundville Riverside Inn");
    // Grounded hotels carry a real name but no licensed imagery.
    expect(offers[0]?.content.imageUrl).toBeUndefined();
    // Still a normal, quotable sandbox offer (booking path unchanged).
    expect(offers[0]?.offerId).toMatch(/curated-hotel/);
  });
});
