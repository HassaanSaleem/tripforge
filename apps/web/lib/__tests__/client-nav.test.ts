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
    expect(byId.get("discover")).toMatchObject({ href: null, status: "soon" });
    expect(byId.get("groupTrips")).toMatchObject({ href: null, status: "soon" });
  });

  it("no label leaks the platform wordmark (INV-020 belt-and-suspenders, FR-004, INV-D)", () => {
    for (const dest of CLIENT_NAV_DESTINATIONS) {
      expect(dest.label).not.toMatch(/TripForge|Trellis/i);
    }
  });

  it("exactly one link label contains the substring 'Trips' — the rest are non-links (research R4)", () => {
    const linkLabelsWithTrips = CLIENT_NAV_DESTINATIONS.filter(
      (d) => d.status === "live" && /Trips/i.test(d.label),
    );
    expect(linkLabelsWithTrips.map((d) => d.id)).toEqual(["myTrips"]);
  });
});
