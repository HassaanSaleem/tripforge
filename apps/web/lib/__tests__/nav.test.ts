// L1 tests for the sidebar nav map (spec 017 T002, contract §6): exactly six
// destinations, ids exhaustive over WorkspacePageShell's activeNav union,
// href/label pairs stable.
import { describe, it, expect } from "vitest";
import { NAV_DESTINATIONS, type NavDestinationId } from "../nav.js";

const EXPECTED_IDS: NavDestinationId[] = ["dashboard", "builder", "trips", "marketplace", "media", "discover"];

describe("NAV_DESTINATIONS (research D8, data-model Nav Destination)", () => {
  it("has exactly six destinations", () => {
    expect(NAV_DESTINATIONS).toHaveLength(6);
  });

  it("ids match the expected set exactly (no drift, no duplicates)", () => {
    const ids = NAV_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("every destination has a stable, non-empty label and href", () => {
    for (const dest of NAV_DESTINATIONS) {
      expect(dest.label.length).toBeGreaterThan(0);
      expect(dest.href.startsWith("/")).toBe(true);
    }
  });

  it("pins the exact href for each destination", () => {
    const byId = new Map(NAV_DESTINATIONS.map((d) => [d.id, d.href]));
    expect(byId.get("dashboard")).toBe("/dashboard");
    expect(byId.get("builder")).toBe("/workspace");
    expect(byId.get("trips")).toBe("/trips");
    expect(byId.get("marketplace")).toBe("/marketplace");
    expect(byId.get("media")).toBe("/media");
    expect(byId.get("discover")).toBe("/discover");
  });
});
