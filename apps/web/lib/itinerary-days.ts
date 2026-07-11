// Pure day-coverage logic for the shared day-by-day itinerary rendering
// (itinerary-days.tsx). DOM-free so it runs under the root Vitest node
// environment (same convention as client-view.ts/itinerary-list.ts).
import type { DraftedItinerary } from "./booking-flow.js";

export type Day = DraftedItinerary["days"][number];
export type StayItem = Extract<Day["items"][number], { kind: "stay" }>;

/**
 * A stay elsewhere in the trip whose checkIn/checkOut span already covers
 * this day (seed-0019 demo-realism fix). A stay item is priced and dated
 * ONCE for its whole span (packages/domain/assemble.ts sets checkIn/checkOut
 * to the full trip range regardless of which day it's attached to) — so a
 * day inside that span legitimately has no item of its own; rendering
 * nothing there reads as "no lodging" instead of "already covered". This is
 * a REFERENCE, never a second charge — no pricing is attached to it.
 */
export function stayCoveringDay(days: readonly Day[], day: Day): StayItem | undefined {
  if (!day.date) return undefined;
  const ownStayIds = new Set(day.items.filter((i): i is StayItem => i.kind === "stay").map((i) => i.id));
  for (const d of days) {
    for (const item of d.items) {
      if (item.kind === "stay" && !ownStayIds.has(item.id) && item.checkIn <= day.date && day.date < item.checkOut) {
        return item;
      }
    }
  }
  return undefined;
}
