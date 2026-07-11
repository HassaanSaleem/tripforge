// L1 — day-coverage derivation for the shared itinerary rendering (seed-0019
// demo-realism fix). A stay item is priced/dated ONCE for its whole span
// (packages/domain/assemble.ts), so these tests pin that every night of the
// span is DISCOVERABLE per-day without a second (double-priced) item.
import { describe, it, expect } from "vitest";
import { stayCoveringDay, type Day } from "../itinerary-days.js";

const stay: Day["items"][number] = {
  kind: "stay",
  id: "d1-i1",
  title: "Paris Grand",
  media: [],
  checkIn: "2026-09-01",
  checkOut: "2026-09-04",
  occupancy: { adults: 2, children: 0 },
};

const activity = (id: string): Day["items"][number] => ({
  kind: "activity",
  id,
  title: "Louvre",
  media: [],
});

const THREE_NIGHT_TRIP: Day[] = [
  { dayNumber: 1, date: "2026-09-01", items: [stay, activity("d1-i2")] },
  { dayNumber: 2, date: "2026-09-02", items: [activity("d2-i1")] },
  { dayNumber: 3, date: "2026-09-03", items: [activity("d3-i1")] },
];

describe("stayCoveringDay", () => {
  it("does not re-surface the stay on its OWN day (already listed there normally)", () => {
    expect(stayCoveringDay(THREE_NIGHT_TRIP, THREE_NIGHT_TRIP[0]!)).toBeUndefined();
  });

  it("finds the covering stay for every OTHER night inside its checkIn/checkOut span", () => {
    expect(stayCoveringDay(THREE_NIGHT_TRIP, THREE_NIGHT_TRIP[1]!)).toEqual(stay);
    expect(stayCoveringDay(THREE_NIGHT_TRIP, THREE_NIGHT_TRIP[2]!)).toEqual(stay);
  });

  it("is undefined for a day outside the stay's span", () => {
    const dayAfterCheckout: Day = { dayNumber: 4, date: "2026-09-04", items: [] };
    expect(stayCoveringDay(THREE_NIGHT_TRIP, dayAfterCheckout)).toBeUndefined();
  });

  it("is undefined when the day has no date (nothing to compare against)", () => {
    const undated: Day = { dayNumber: 2, date: undefined, items: [] };
    expect(stayCoveringDay(THREE_NIGHT_TRIP, undated)).toBeUndefined();
  });

  it("is undefined with no stay item anywhere in the trip", () => {
    const noStay: Day[] = [{ dayNumber: 1, date: "2026-09-01", items: [activity("d1-i1")] }];
    expect(stayCoveringDay(noStay, noStay[0]!)).toBeUndefined();
  });
});
