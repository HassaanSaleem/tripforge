// L1 — chat-driven itinerary editing (spec 020 FR-001..FR-010; research.md
// D1/D6). Builds a base itinerary via assembleItinerary (the same construction
// path production code uses), then exercises applyItineraryEdit against it.
import { describe, it, expect } from "vitest";
import { money } from "../money.js";
import { allocateBudget } from "../budget.js";
import { assembleItinerary, type AssembleRequest, type VerifiedOffer } from "../assemble.js";
import { applyItineraryEdit, type ItineraryEditProposal } from "../edit.js";

const RATES = [{ from: "EUR", to: "USD", numerator: 108, denominator: 100 }];

const OFFERS: VerifiedOffer[] = [
  { port: "hotel", offerId: "paris-001", title: "Paris Grand", netRate: money(18_000, "USD") },
  { port: "hotel", offerId: "paris-002", title: "Paris Boutique", netRate: money(12_500, "USD") },
  { port: "activity", offerId: "act-001", title: "Louvre", netRate: money(3_300, "EUR"), durationMinutes: 180 },
  { port: "activity", offerId: "act-002", title: "Food tour", netRate: money(4_000, "USD"), durationMinutes: 120 },
  { port: "transfer", offerId: "tx-001", title: "Private car", netRate: money(1_900, "USD"), mode: "private" },
];

function request(overrides: Partial<AssembleRequest> = {}): AssembleRequest {
  return {
    id: "0f4f6f6a-6a51-4c7e-9d43-000000000001",
    agencyId: "org-1",
    currency: "USD",
    destination: "Paris",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    mode: "hardCap",
    ...overrides,
  };
}

function allocationsFor(totalMinor: number, mode: "hardCap" | "target" = "hardCap") {
  const res = allocateBudget({ totalMinor, currency: "USD", mode, days: 2 });
  if (res.status !== "allocated") throw new Error("test allocation infeasible");
  return res.allocations;
}

function baseItinerary(totalMinor = 100_000, mode: "hardCap" | "target" = "hardCap") {
  const result = assembleItinerary({
    request: request({ mode }),
    title: "Paris trip",
    draftDays: [
      { items: [{ port: "transfer", offerId: "tx-001" }, { port: "hotel", offerId: "paris-002" }, { port: "activity", offerId: "act-001" }] },
      { items: [] },
    ],
    offers: OFFERS,
    allocations: allocationsFor(totalMinor, mode),
    rates: RATES,
  });
  return result.itinerary;
}

function applyEdit(itinerary: ReturnType<typeof baseItinerary>, edit: ItineraryEditProposal, overrides: { offers?: VerifiedOffer[] } = {}) {
  return applyItineraryEdit({
    itinerary,
    edit,
    offers: overrides.offers ?? OFFERS,
    rates: RATES,
    mode: itinerary.pricing.budgetMode,
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    destination: "Paris",
  });
}

describe("applyItineraryEdit — removeItem", () => {
  it("removes the correct item and reduces its category's spend, conserving the total", () => {
    const itinerary = baseItinerary();
    const activityItem = itinerary.days[0]?.items.find((i) => i.kind === "activity");
    expect(activityItem).toBeDefined();
    const result = applyEdit(itinerary, { type: "removeItem", itemId: activityItem!.id });

    expect(result.outcome).toBe("applied");
    expect(result.itinerary.days[0]?.items.some((i) => i.id === activityItem!.id)).toBe(false);
    const activitiesCategory = result.itinerary.pricing.categories.find((c) => c.category === "activities");
    expect(activitiesCategory?.spent?.amountMinor).toBe(0);
    const total = result.itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);
    expect(total).toBe(itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0));
  });

  it("refuses an unknown item id with item_not_found, itinerary unchanged", () => {
    const itinerary = baseItinerary();
    const result = applyEdit(itinerary, { type: "removeItem", itemId: "does-not-exist" });
    expect(result.outcome).toBe("item_not_found");
    expect(result.itinerary).toBe(itinerary);
  });

  it("refuses to empty the trip entirely — empty_result", () => {
    // Single-item itinerary: removing it would leave zero items anywhere.
    const result = assembleItinerary({
      request: request(),
      title: "Solo item trip",
      draftDays: [{ items: [{ port: "activity", offerId: "act-001" }] }],
      offers: OFFERS,
      allocations: allocationsFor(100_000),
      rates: RATES,
    });
    const onlyItem = result.itinerary.days[0]?.items[0];
    expect(onlyItem).toBeDefined();
    const edited = applyEdit(result.itinerary, { type: "removeItem", itemId: onlyItem!.id });
    expect(edited.outcome).toBe("empty_result");
    expect(edited.itinerary).toBe(result.itinerary);
  });
});

describe("applyItineraryEdit — addItem", () => {
  it("adds an activity, converting currency like assembleItinerary does, and conserves the allocation total", () => {
    const itinerary = baseItinerary();
    const totalBefore = itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);
    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 2, port: "activity", offerId: "act-002" });

    expect(result.outcome).toBe("applied");
    const added = result.itinerary.days[1]?.items.find((i) => i.kind === "activity");
    expect(added?.pricing?.sellPrice).toEqual({ amountMinor: 4_000, currency: "USD" });
    const totalAfter = result.itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it("rebalances from buffer when the add pushes a category over its allocation", () => {
    // Balanced split of 60000: [24000, 21000, 7200, 4200, 3600]. After the base
    // items (transfer 1900, hotel 12500, act-001 3564), activities has 3636
    // headroom; act-002 (4000) overruns it by 364 — buffer (3600 headroom)
    // covers it without hitting the hard cap.
    const itinerary = baseItinerary(60_000);
    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 1, port: "activity", offerId: "act-002" });
    expect(result.outcome).toBe("applied");
    expect(result.fit.rebalances).toEqual([{ from: "buffer", to: "activities", amountMinor: 364 }]);
    expect(result.fit.rebalances.every((m) => m.from !== "flightsTransport")).toBe(true);
  });

  it("hardCap: refuses over_budget when no donor has enough headroom, itinerary unchanged", () => {
    const itinerary = baseItinerary(15_000); // very tight hardCap budget
    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 1, port: "hotel", offerId: "paris-001" });
    expect(result.outcome).toBe("over_budget");
    expect(result.itinerary).toBe(itinerary);
  });

  it("refuses an unknown offerId — unknown_offer", () => {
    const itinerary = baseItinerary();
    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 1, port: "activity", offerId: "made-up" });
    expect(result.outcome).toBe("unknown_offer");
    expect(result.itinerary).toBe(itinerary);
  });

  it("refuses a day number that doesn't exist in the trip — invalid_day", () => {
    const itinerary = baseItinerary();
    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 99, port: "activity", offerId: "act-002" });
    expect(result.outcome).toBe("invalid_day");
    expect(result.itinerary).toBe(itinerary);
  });

  it("a hotel add when a stay already exists replaces it (research.md D6), conserving the total", () => {
    const itinerary = baseItinerary();
    const existingStay = itinerary.days.flatMap((d) => d.items).find((i) => i.kind === "stay");
    expect(existingStay).toBeDefined();
    const totalBefore = itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);

    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 1, port: "hotel", offerId: "paris-001" });
    expect(result.outcome).toBe("applied");
    const stays = result.itinerary.days.flatMap((d) => d.items).filter((i) => i.kind === "stay");
    expect(stays).toHaveLength(1);
    expect(stays[0]?.supplyRef?.externalId).toBe("paris-001");
    expect(stays[0]?.id).not.toBe(existingStay!.id);
    const totalAfter = result.itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);
    expect(totalAfter).toBe(totalBefore);
    // Accommodation spend reflects ONLY the new hotel's price, not both.
    const accommodation = result.itinerary.pricing.categories.find((c) => c.category === "accommodation");
    expect(accommodation?.spent?.amountMinor).toBe(18_000);
  });

  it("a hotel add when NO stay exists yet simply adds it", () => {
    const result = assembleItinerary({
      request: request(),
      title: "No hotel yet",
      draftDays: [{ items: [{ port: "activity", offerId: "act-001" }] }, { items: [] }],
      offers: OFFERS,
      allocations: allocationsFor(100_000),
      rates: RATES,
    });
    const edited = applyEdit(result.itinerary, { type: "addItem", dayNumber: 1, port: "hotel", offerId: "paris-002" });
    expect(edited.outcome).toBe("applied");
    const stays = edited.itinerary.days.flatMap((d) => d.items).filter((i) => i.kind === "stay");
    expect(stays).toHaveLength(1);
  });
});

describe("applyItineraryEdit — budget fit accuracy (US3)", () => {
  it("flags a category overTarget in target mode without refusing the add", () => {
    const itinerary = baseItinerary(20_000, "target");
    const result = applyEdit(itinerary, { type: "addItem", dayNumber: 1, port: "hotel", offerId: "paris-001" });
    expect(result.outcome).toBe("applied");
    const accommodation = result.fit.categories.find((c) => c.category === "accommodation");
    expect(accommodation?.state).toBe("overTarget");
    expect(accommodation?.spentMinor).toBeGreaterThan(accommodation?.allocatedMinor ?? 0);
  });

  it("removeItem reduces spentMinor without changing allocatedMinor for that category", () => {
    const itinerary = baseItinerary();
    const activityItem = itinerary.days[0]?.items.find((i) => i.kind === "activity");
    const before = itinerary.pricing.categories.find((c) => c.category === "activities");
    const result = applyEdit(itinerary, { type: "removeItem", itemId: activityItem!.id });
    const after = result.fit.categories.find((c) => c.category === "activities");
    expect(after?.allocatedMinor).toBe(before?.allocated.amountMinor);
    expect(after?.spentMinor).toBe(0);
  });
});
