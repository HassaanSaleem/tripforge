// L1 data-shape tests for the Discover / "What's Hot" feed's static curated
// content (spec 023 data-model.md validation rules) — this is compile-time
// authored content, not user input, so these tests exist to lock in the
// content-sourcing invariants (SC-003/SC-004, FR-007) rather than to validate
// runtime parsing.
import { describe, it, expect } from "vitest";
import { HERO_DESTINATIONS } from "../planner-form.js";
import { feedItemsForDestination, WHATS_HOT_FEED } from "../discover-feed.js";

describe("WHATS_HOT_FEED", () => {
  it("gives every HERO_DESTINATIONS entry at least 3 feed items (SC-004)", () => {
    for (const hero of HERO_DESTINATIONS) {
      const items = feedItemsForDestination(hero.id);
      expect(items.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("has no items for a destination outside HERO_DESTINATIONS", () => {
    const knownIds = new Set(HERO_DESTINATIONS.map((hero) => hero.id));
    for (const item of WHATS_HOT_FEED) {
      expect(knownIds.has(item.destinationId)).toBe(true);
    }
  });

  it("gives every item non-empty title/blurb/hotel/planDestination text", () => {
    for (const item of WHATS_HOT_FEED) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.blurb.trim().length).toBeGreaterThan(0);
      expect(item.hotelHighlight.name.trim().length).toBeGreaterThan(0);
      expect(item.hotelHighlight.description.trim().length).toBeGreaterThan(0);
      expect(item.planDestination.trim().length).toBeGreaterThan(0);
    }
  });

  it("has a unique id per item", () => {
    const ids = WHATS_HOT_FEED.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sets planDestination to the exact '${city}, ${country}' value for its destinationId (contracts/discover-to-builder-handoff.md)", () => {
    const byId = new Map(HERO_DESTINATIONS.map((hero) => [hero.id, hero]));
    for (const item of WHATS_HOT_FEED) {
      const hero = byId.get(item.destinationId);
      expect(hero).toBeDefined();
      expect(item.planDestination).toBe(`${hero!.city}, ${hero!.country}`);
    }
  });

  it("sources every image from a licensed Unsplash CDN host with a non-empty attribution (SC-003, FR-007)", () => {
    for (const item of WHATS_HOT_FEED) {
      expect(item.image.source).toBe("licensed-stock");
      expect(item.image.url).toMatch(/^https:\/\/(images|plus)\.unsplash\.com\//);
      expect(item.image.alt.trim().length).toBeGreaterThan(0);
      expect(item.image.attribution.trim()).toMatch(/^Photo by .+ on Unsplash$/);
    }
  });
});
