// T010 / US1 (SC-001, SC-003): a fully-populated itinerary parses; parse → serialize
// → parse is lossless; an unknown top-level field is rejected (strict).
import { describe, it, expect } from "vitest";
import { parseItinerary, SCHEMA_VERSION } from "../index.js";
import { baseItineraryInput } from "./fixtures.js";

describe("itinerary round-trip (US1)", () => {
  it("parses a fully-populated multi-day itinerary with all three item kinds", () => {
    const parsed = parseItinerary(baseItineraryInput());
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.days).toHaveLength(2);
    const kinds = parsed.days.flatMap((d) => d.items.map((i) => i.kind));
    expect(kinds).toEqual(["stay", "activity", "transfer"]);
  });

  it("round-trips losslessly: parse → JSON serialize → parse deep-equals", () => {
    const parsed = parseItinerary(baseItineraryInput());
    const reparsed = parseItinerary(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it("fills schema defaults (item media defaults to []) and preserves them across a round-trip", () => {
    const parsed = parseItinerary(baseItineraryInput());
    const activity = parsed.days[0]!.items.find((i) => i.kind === "activity")!;
    expect(activity.media).toEqual([]); // default applied
    const reparsed = parseItinerary(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it("rejects an unknown top-level field (strict — no unversioned extension smuggled in)", () => {
    const sneaky = { ...baseItineraryInput(), rogueField: "nope" };
    expect(() => parseItinerary(sneaky)).toThrow();
  });

  it("accepts an empty draft shell (zero days) and a day with zero items", () => {
    const draft = { ...baseItineraryInput(), days: [] };
    expect(() => parseItinerary(draft)).not.toThrow();
    const emptyDay = {
      ...baseItineraryInput(),
      days: [{ dayNumber: 1, items: [] }],
    };
    expect(() => parseItinerary(emptyDay)).not.toThrow();
  });
});
