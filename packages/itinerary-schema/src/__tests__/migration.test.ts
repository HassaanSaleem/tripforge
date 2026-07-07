// T013 / US1 (SC-006, FR-002): the migration convention upgrades a known older
// ("0.0.0") stub to the current version, and rejects an unknown version — no silent
// accept.
import { describe, it, expect } from "vitest";
import { parseItinerary, upgradeFrom000, SCHEMA_VERSION } from "../index.js";

const stub000 = {
  schemaVersion: "0.0.0",
  id: "itin_legacy",
  agencyId: "ag_legacy",
  title: "Legacy stub trip",
  provenance: { originalAuthorAgencyId: "ag_legacy", rebrandLineage: [] },
};

describe("migration convention (US1)", () => {
  it("upgrades a 0.0.0 stub to the current schema version via parseItinerary", () => {
    const upgraded = parseItinerary(stub000);
    expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.id).toBe("itin_legacy");
    expect(upgraded.title).toBe("Legacy stub trip");
    expect(upgraded.days).toEqual([]); // stub carried no days
    expect(upgraded.pricing.total.amountMinor).toBe(0); // zero-total, currency-consistent
    expect(upgraded.provenance.originalAuthorAgencyId).toBe("ag_legacy");
  });

  it("produces a currency-consistent upgrade (migrated value survives strict validation)", () => {
    const upgraded = upgradeFrom000(stub000) as { currency: string; pricing: { total: { currency: string } } };
    expect(upgraded.pricing.total.currency).toBe(upgraded.currency);
    // and the migrated shape must itself parse cleanly
    expect(() => parseItinerary(upgraded)).not.toThrow();
  });

  it("rejects an unknown schemaVersion (no silent accept)", () => {
    const future = { schemaVersion: "9.9.9", id: "x", agencyId: "y", title: "z" };
    expect(() => parseItinerary(future)).toThrow(/unknown itinerary schemaVersion/);
  });

  it("parses a current-version value unchanged (no migrator invoked)", () => {
    const current = {
      schemaVersion: SCHEMA_VERSION,
      id: "itin_now",
      agencyId: "ag_now",
      title: "Current trip",
      currency: "USD",
      pricing: { budgetMode: "target", total: { amountMinor: 0, currency: "USD" }, categories: [] },
    };
    const parsed = parseItinerary(current);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.days).toEqual([]); // defaulted
  });
});
