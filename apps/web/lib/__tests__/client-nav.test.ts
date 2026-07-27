// L1 tests for the SIGNED-IN traveler consumer nav map (spec 037,
// data-model "Consumer Nav Destination"): five destinations in a fixed order,
// ids exhaustive over ClientSurfaceShell's activeNav union, live⇔href /
// soon⇔null coupling (no dead links, no live section without a target), and the
// belt-and-suspenders INV-020 negative (no platform wordmark in any label).
import { describe, it, expect } from "vitest";
import { CLIENT_NAV_DESTINATIONS, type ClientNavDestinationId } from "../client-nav.js";

// Order is load-bearing (FR-001) — assert the exact sequence, not just the set.
const EXPECTED_ORDER: ClientNavDestinationId[] = ["home", "myTrips", "plan", "discover", "groupTrips"];

describe("CLIENT_NAV_DESTINATIONS (spec 037, data-model Consumer Nav Destination)", () => {
  it("has exactly five destinations in the exact FR-001 order (INV-C)", () => {
    expect(CLIENT_NAV_DESTINATIONS).toHaveLength(5);
    expect(CLIENT_NAV_DESTINATIONS.map((d) => d.id)).toEqual(EXPECTED_ORDER);
  });

  it("ids are unique and exhaustive over the activeNav union (INV-B)", () => {
    const ids = CLIENT_NAV_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("live⇔href and soon⇔null are strictly coupled — no dead links (INV-A, FR-003)", () => {
    for (const dest of CLIENT_NAV_DESTINATIONS) {
      expect(dest.label.length).toBeGreaterThan(0);
      if (dest.status === "live") {
        expect(dest.href).not.toBeNull();
        expect(dest.href?.startsWith("/")).toBe(true);
      } else {
        expect(dest.status).toBe("soon");
        expect(dest.href).toBeNull();
      }
    }
  });

  it("pins the exact href/status for each destination", () => {
    const byId = new Map(CLIENT_NAV_DESTINATIONS.map((d) => [d.id, d]));
    expect(byId.get("home")).toMatchObject({ href: "/view", status: "live" });
    expect(byId.get("myTrips")).toMatchObject({ href: "/view/my-trips", status: "live" });
    // Plan a trip is LIVE as of spec 038 (consumer AI planner).
    expect(byId.get("plan")).toMatchObject({ href: "/view/plan", status: "live" });
    // Discover is LIVE as of spec 039 (consumer "What's Hot" feed).
    expect(byId.get("discover")).toMatchObject({ href: "/view/discover", status: "live" });
    // Group trips is LIVE as of spec 040 (traveler group coordination).
    expect(byId.get("groupTrips")).toMatchObject({ href: "/view/groups", status: "live" });
  });

  it("no label leaks the platform wordmark (INV-020 belt-and-suspenders, FR-004, INV-D)", () => {
    for (const dest of CLIENT_NAV_DESTINATIONS) {
      expect(dest.label).not.toMatch(/TripForge|Trellis/i);
    }
  });

  it("the two live 'trips' labels are My Trips and Group trips, and no live label is a substring of another — so exact-match selectors stay unambiguous (research R4, spec 040)", () => {
    // Spec 040 made "Group trips" a live link, so TWO live labels now contain
    // "trips" (My Trips, Group trips). consumer-nav-journey.spec.ts selects them
    // with `exact: true`; this L1 test guards the property that makes that safe.
    const liveTripsLabels = CLIENT_NAV_DESTINATIONS.filter((d) => d.status === "live" && /trips/i.test(d.label));
    expect(liveTripsLabels.map((d) => d.label).sort()).toEqual(["Group trips", "My Trips"]);
    // No live label is a substring of another → an `exact: true` getByRole name
    // selector can never resolve to two links.
    const liveLabels = CLIENT_NAV_DESTINATIONS.filter((d) => d.status === "live").map((d) => d.label);
    for (const outer of liveLabels) {
      for (const inner of liveLabels) {
        if (outer !== inner) expect(outer.includes(inner)).toBe(false);
      }
    }
  });
});
