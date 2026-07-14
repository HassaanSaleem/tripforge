// L1 — input-schema bounds for the group-departure flows (spec 021 T008/T013/
// T018). The db-dependent branches (tenancy, capacity-conservation races,
// atomicity) are covered by the L3 suite in packages/api (l3-group-travel),
// mirroring the listings.test.ts precedent.
import { describe, expect, it } from "vitest";
import {
  postGroupDepartureInputSchema,
  cancelGroupDepartureInputSchema,
  joinGroupDepartureInputSchema,
} from "../group-departures.js";

const UUID = "3f1e9a52-7c44-4b8e-9a3e-2f60d1a0b9c1";

describe("postGroupDeparture input bounds (contracts §1)", () => {
  const valid = {
    itineraryId: UUID,
    departureDate: "2026-09-01",
    capacity: 12,
    pricePerSeatMinor: 45_000,
  };
  it("accepts a valid input", () => {
    expect(postGroupDepartureInputSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    ["non-uuid itinerary", { ...valid, itineraryId: "nope" }],
    ["non-iso departure date", { ...valid, departureDate: "09/01/2026" }],
    ["zero capacity", { ...valid, capacity: 0 }],
    ["negative capacity", { ...valid, capacity: -1 }],
    ["float capacity", { ...valid, capacity: 2.5 }],
    ["negative price", { ...valid, pricePerSeatMinor: -1 }],
    ["float price", { ...valid, pricePerSeatMinor: 10.5 }],
    ["unknown field", { ...valid, resale: true }],
  ])("rejects %s", (_name, input) => {
    expect(() => postGroupDepartureInputSchema.parse(input)).toThrow();
  });
  it("a zero price is a valid seller choice (free seats)", () => {
    expect(postGroupDepartureInputSchema.parse({ ...valid, pricePerSeatMinor: 0 }).pricePerSeatMinor).toBe(0);
  });
});

describe("cancelGroupDeparture input bounds (contracts §2)", () => {
  it("takes a uuid departure id only", () => {
    expect(cancelGroupDepartureInputSchema.parse({ departureId: UUID })).toEqual({ departureId: UUID });
    expect(() => cancelGroupDepartureInputSchema.parse({ departureId: "nope" })).toThrow();
    expect(() => cancelGroupDepartureInputSchema.parse({ departureId: UUID, force: true })).toThrow();
  });
});

describe("joinGroupDeparture input bounds (contracts §4)", () => {
  const valid = { departureId: UUID, travelerName: "Alex Rivera" };
  it("accepts a valid input with and without an email", () => {
    expect(joinGroupDepartureInputSchema.parse(valid)).toEqual(valid);
    expect(
      joinGroupDepartureInputSchema.parse({ ...valid, travelerEmail: "alex@example.test" }).travelerEmail,
    ).toBe("alex@example.test");
  });
  it.each([
    ["non-uuid departure", { ...valid, departureId: "nope" }],
    ["empty traveler name", { ...valid, travelerName: "" }],
    ["traveler name over 200", { ...valid, travelerName: "x".repeat(201) }],
    ["malformed email", { ...valid, travelerEmail: "not-an-email" }],
    ["unknown field", { ...valid, seats: 2 }],
  ])("rejects %s", (_name, input) => {
    expect(() => joinGroupDepartureInputSchema.parse(input)).toThrow();
  });
});
