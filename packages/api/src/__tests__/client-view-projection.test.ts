// L1 — the traveler-facing allowlist projection (spec 010 FR-007/FR-008/SC-003).
// The redaction contract is CONFIDENTIALITY BY CONSTRUCTION: these tests scan the
// full serialized payload for forbidden keys AND forbidden values (the exact net
// amounts, budget totals, supplier refs, tenant/document ids planted in the
// fixture), so a projection that leaks any agent-confidential field goes red
// regardless of what the page later renders.
import { describe, it, expect } from "vitest";
import { parseItinerary } from "@tripforge/itinerary-schema";
import { toClientItineraryView } from "../services/client-view.js";

/** Fully-populated canonical input: every confidential field carries a unique
 * sentinel value the payload scan can hunt for. */
function fullDocumentInput(): Record<string, unknown> {
  return {
    schemaVersion: "0.1.0",
    id: "itin-doc-sentinel",
    agencyId: "agency-tenant-sentinel",
    title: "5 Nights in Lisbon",
    currency: "USD",
    days: [
      // Deliberately out of order — the projection must sort by dayNumber.
      {
        dayNumber: 2,
        items: [
          {
            kind: "transfer",
            id: "item-transfer-sentinel",
            title: "Airport transfer",
            from: "LIS Airport",
            to: "Hotel Baixa",
            mode: "private",
            pricing: {
              netRate: { amountMinor: 3111, currency: "USD" },
              sellPrice: { amountMinor: 4000, currency: "USD" },
            },
          },
        ],
      },
      {
        dayNumber: 1,
        date: "2026-09-01",
        items: [
          {
            kind: "stay",
            id: "item-stay-sentinel",
            title: "Hotel Baixa",
            supplyRef: { port: "hotel", externalId: "supplier-ref-sentinel" },
            pricing: {
              netRate: { amountMinor: 42111, currency: "USD" },
              sellPrice: { amountMinor: 52000, currency: "USD" },
            },
            checkIn: "2026-09-01",
            checkOut: "2026-09-03",
            occupancy: { adults: 2, children: 1 },
          },
          {
            kind: "activity",
            id: "item-activity-sentinel",
            title: "Fado evening",
            startsAt: "2026-09-01T20:00:00Z",
            durationMinutes: 120,
          },
        ],
      },
      { dayNumber: 3, items: [] },
    ],
    media: [],
    pricing: {
      budgetMode: "hardCap",
      total: { amountMinor: 300111, currency: "USD" },
      categories: [
        {
          category: "accommodation",
          allocated: { amountMinor: 120111, currency: "USD" },
          spent: { amountMinor: 52000, currency: "USD" },
        },
      ],
    },
    provenance: {
      originalAuthorAgencyId: "provenance-author-sentinel",
      rebrandLineage: ["provenance-lineage-sentinel"],
    },
  };
}

const AGENCY_NAME = "Wanderlust Travel Co";

function project(bookedItemIds: ReadonlySet<string> = new Set()) {
  return toClientItineraryView(parseItinerary(fullDocumentInput()), AGENCY_NAME, bookedItemIds);
}

describe("toClientItineraryView — allowlist projection (FR-007)", () => {
  it("serialized payload contains NO confidential keys", () => {
    const payload = JSON.stringify(project());
    for (const forbiddenKey of [
      "netRate",
      "netMinor",
      "markup",
      "supplyRef",
      "externalId",
      "provenance",
      "budgetMode",
      "allocated",
      "tripRequest",
      "agencyId",
      "schemaVersion",
      "media",
    ]) {
      expect(payload).not.toContain(forbiddenKey);
    }
  });

  it("serialized payload contains NO confidential VALUES (net amounts, budget totals, refs, ids)", () => {
    const payload = JSON.stringify(project());
    for (const forbiddenValue of [
      "42111", // stay net rate
      "3111", // transfer net rate
      "300111", // budget total
      "120111", // category allocation
      "supplier-ref-sentinel",
      "provenance-author-sentinel",
      "provenance-lineage-sentinel",
      "agency-tenant-sentinel",
      "itin-doc-sentinel",
      "item-stay-sentinel", // item ids are server-side join keys, never payload
    ]) {
      expect(payload).not.toContain(forbiddenValue);
    }
  });

  it("carries the allowlisted view: title, agency brand, currency, days in order", () => {
    const view = project();
    expect(view.title).toBe("5 Nights in Lisbon");
    expect(view.agencyName).toBe(AGENCY_NAME);
    expect(view.currency).toBe("USD");
    expect(view.days.map((d) => d.dayNumber)).toEqual([1, 2, 3]);
    expect(view.days[0]?.date).toBe("2026-09-01");
    expect(view.days[1]?.date).toBeUndefined();
  });

  it("projects per-kind schedule facts and sell prices only (FR-008)", () => {
    const view = project();
    const [stay, activity] = view.days[0]!.items;
    const [transfer] = view.days[1]!.items;

    expect(stay).toMatchObject({
      kind: "stay",
      title: "Hotel Baixa",
      sellMinor: 52000,
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      adults: 2,
      children: 1,
    });
    expect(activity).toMatchObject({
      kind: "activity",
      title: "Fado evening",
      startsAt: "2026-09-01T20:00:00Z",
      durationMinutes: 120,
      sellMinor: null, // unpriced item shows no price (US1/AS4)
    });
    expect(transfer).toMatchObject({
      kind: "transfer",
      from: "LIS Airport",
      to: "Hotel Baixa",
      mode: "private",
      sellMinor: 4000,
    });
  });

  it("computes the trip total server-side as the addMoney fold of priced items (D8)", () => {
    expect(project().totalSellMinor).toBe(52000 + 4000);
  });

  it("total is null when nothing is priced — an unpriced proposal states no total", () => {
    const input = fullDocumentInput();
    const days = input.days as Array<{ items: Array<{ pricing?: unknown }> }>;
    for (const day of days) for (const item of day.items) delete item.pricing;
    const view = toClientItineraryView(parseItinerary(input), AGENCY_NAME, new Set());
    expect(view.totalSellMinor).toBeNull();
    expect(view.days.flatMap((d) => d.items).every((i) => i.sellMinor === null)).toBe(true);
  });

  it("marks exactly the items whose ids are in the booked set (FR-009)", () => {
    const view = project(new Set(["item-stay-sentinel"]));
    const flags = view.days.flatMap((d) => d.items).map((i) => [i.title, i.booked]);
    expect(flags).toEqual([
      ["Hotel Baixa", true],
      ["Fado evening", false],
      ["Airport transfer", false],
    ]);
  });

  it("no bookings ⇒ no booked marks (US3/AS2)", () => {
    expect(project().days.flatMap((d) => d.items).some((i) => i.booked)).toBe(false);
  });

  it("renders empty days and empty itineraries gracefully (edge cases)", () => {
    const emptyDay = project().days[2]!;
    expect(emptyDay.items).toEqual([]);

    const input = fullDocumentInput();
    input.days = [];
    const view = toClientItineraryView(parseItinerary(input), AGENCY_NAME, new Set());
    expect(view.days).toEqual([]);
    expect(view.totalSellMinor).toBeNull();
  });
});
