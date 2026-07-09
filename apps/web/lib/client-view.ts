// Pure view logic for the traveler client-view page (spec 010 contract §3):
// per-kind schedule lines and kind labels. DOM-free so it runs under the root
// Vitest node environment; the page may only display strings that come from
// here or from formatMinorAmount (the one money rendering path — FR-008).
// White-label discipline (INV-020): nothing here may name the platform.
import type { ClientViewItem } from "@tripforge/api";

/** Traveler-friendly item-kind label. */
export function itemKindLabel(kind: ClientViewItem["kind"]): string {
  switch (kind) {
    case "stay":
      return "Stay";
    case "activity":
      return "Activity";
    case "transfer":
      return "Transfer";
  }
}

function occupancyLine(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? "adult" : "adults"}`];
  if (children > 0) {
    parts.push(`${children} ${children === 1 ? "child" : "children"}`);
  }
  return parts.join(", ");
}

/**
 * One schedule line per item from the redacted view's kind-specific facts
 * (data-model §5). Returns null when an item carries no schedule facts to
 * show (e.g. an activity without a start time or duration).
 */
export function scheduleLine(item: ClientViewItem): string | null {
  switch (item.kind) {
    case "stay":
      return `Check-in ${item.checkIn} · check-out ${item.checkOut} · ${occupancyLine(item.adults, item.children)}`;
    case "activity": {
      const parts: string[] = [];
      if (item.startsAt !== undefined) parts.push(`Starts ${item.startsAt}`);
      if (item.durationMinutes !== undefined) parts.push(`${item.durationMinutes} min`);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "transfer":
      return `${item.from} → ${item.to} · ${item.mode}`;
  }
}
