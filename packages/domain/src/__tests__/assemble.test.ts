// L1 — deterministic assembly (spec 005 FR-003/004/005; INV-001/014). The
// output must parse against the canonical schema, trace every price to a
// verified offer, and never exceed a hard cap.
import { describe, it, expect } from "vitest";
import { money } from "../money.js";
import { allocateBudget } from "../budget.js";
import { assembleItinerary, type AssembleRequest, type VerifiedOffer } from "../assemble.js";

const RATES = [{ from: "EUR", to: "USD", numerator: 108, denominator: 100 }];

const OFFERS: VerifiedOffer[] = [
  { port: "hotel", offerId: "paris-001", title: "Paris Grand", netRate: money(18_000, "USD") },
  { port: "hotel", offerId: "paris-002", title: "Paris Boutique", netRate: money(12_500, "USD") },
  { port: "activity", offerId: "act-001", title: "Louvre", netRate: money(3_300, "EUR"), durationMinutes: 180 },
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

describe("assembleItinerary — canonical output (FR-004, SC-001)", () => {
  it("produces a schema-valid itinerary with per-day subtotals and spent per category", () => {
    const result = assembleItinerary({
      request: request(),
      title: "Paris trip",
      draftDays: [
        { items: [{ port: "transfer", offerId: "tx-001" }, { port: "hotel", offerId: "paris-002" }, { port: "activity", offerId: "act-001" }] },
        { items: [{ port: "activity", offerId: "act-001" }] },
      ],
      offers: OFFERS,
      allocations: allocationsFor(100_000),
      rates: RATES,
    });

    expect(result.dropped).toEqual([]);
    const itin = result.itinerary;
    expect(itin.schemaVersion).toBe("0.1.0");
    expect(itin.currency).toBe("USD");
    expect(itin.days).toHaveLength(2);
    // EUR activity converted explicitly: 3300 × 108/100 = 3564.
    expect(itin.days[1]?.subtotal).toEqual({ amountMinor: 3_564, currency: "USD" });
    // Every priced item traces to a verified offer (SC-002).
    for (const day of itin.days) {
      for (const item of day.items) {
        expect(item.supplyRef).toBeDefined();
        expect(OFFERS.some((o) => o.offerId === item.supplyRef?.externalId)).toBe(true);
      }
    }
    // Allocation conservation: categories still sum to the total budget.
    const sum = itin.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);
    expect(sum).toBe(100_000);
    // Spent is recorded per category: 12500 stay + 2×3564 activities + 1900 transfer.
    const spent = Object.fromEntries(itin.pricing.categories.map((c) => [c.category, c.spent?.amountMinor]));
    expect(spent.accommodation).toBe(12_500);
    expect(spent.activities).toBe(7_128);
    expect(spent.localTransport).toBe(1_900);
    expect(spent.flightsTransport).toBe(0);
  });

  it("drops proposals for unknown offers (hallucinations) — FR-003/SC-002", () => {
    const result = assembleItinerary({
      request: request(),
      title: "Paris trip",
      draftDays: [{ items: [{ port: "hotel", offerId: "made-up-hotel" }, { port: "hotel", offerId: "paris-002" }] }],
      offers: OFFERS,
      allocations: allocationsFor(100_000),
      rates: RATES,
    });
    expect(result.dropped).toEqual([{ port: "hotel", offerId: "made-up-hotel", reason: "unknown_offer" }]);
    expect(result.itinerary.days[0]?.items).toHaveLength(1);
  });

  it("drops items priced in a currency with no known rate", () => {
    const offers: VerifiedOffer[] = [
      { port: "activity", offerId: "act-gbp", title: "Tour", netRate: money(5_000, "GBP") },
    ];
    const result = assembleItinerary({
      request: request(),
      title: "Paris trip",
      draftDays: [{ items: [{ port: "activity", offerId: "act-gbp" }] }],
      offers,
      allocations: allocationsFor(100_000),
      rates: RATES,
    });
    expect(result.dropped).toEqual([{ port: "activity", offerId: "act-gbp", reason: "no_rate" }]);
  });
});

describe("assembleItinerary — budget fit (FR-005, US4)", () => {
  it("re-balances from buffer when a category runs over, visibly", () => {
    // Balanced split of 32000: [12800, 11200, 3840, 2240, 1920]. The cheapest
    // hotel (12500) exceeds accommodation (11200) by 1300 — buffer covers it.
    const result = assembleItinerary({
      request: request(),
      title: "Paris trip",
      draftDays: [{ items: [{ port: "hotel", offerId: "paris-002" }] }],
      offers: OFFERS,
      allocations: allocationsFor(32_000),
      rates: RATES,
    });
    expect(result.dropped).toEqual([]);
    expect(result.fit.rebalances).toEqual([{ from: "buffer", to: "accommodation", amountMinor: 1_300 }]);
    const accommodation = result.fit.categories.find((c) => c.category === "accommodation");
    expect(accommodation?.state).toBe("fits");
    expect(accommodation?.allocatedMinor).toBe(12_500);
    // Conservation after rebalance.
    const sum = result.itinerary.pricing.categories.reduce((acc, c) => acc + c.allocated.amountMinor, 0);
    expect(sum).toBe(32_000);
    // The flights reserve was never a donor (FR-002).
    expect(result.fit.rebalances.every((m) => m.from !== "flightsTransport")).toBe(true);
    expect(result.itinerary.pricing.categories.find((c) => c.category === "flightsTransport")?.allocated.amountMinor).toBe(
      12_800,
    );
  });

  it("hard cap: leaves the category under-filled rather than exceeding (US1 AC-3)", () => {
    // Total 20000 → accommodation 7000; donors (activities 2400 + local 1400 +
    // buffer 1200) cannot cover 12500. Item must be dropped, cap never exceeded.
    const result = assembleItinerary({
      request: request(),
      title: "Paris trip",
      draftDays: [{ items: [{ port: "hotel", offerId: "paris-002" }] }],
      offers: OFFERS,
      allocations: allocationsFor(20_000),
      rates: RATES,
    });
    expect(result.dropped).toEqual([{ port: "hotel", offerId: "paris-002", reason: "over_budget" }]);
    const accommodation = result.fit.categories.find((c) => c.category === "accommodation");
    expect(accommodation?.state).toBe("underFilled");
    expect(accommodation?.spentMinor).toBe(0);
  });

  it("target mode: includes the item and shows the overshoot honestly (US4 AC)", () => {
    const result = assembleItinerary({
      request: request({ mode: "target" }),
      title: "Paris trip",
      draftDays: [{ items: [{ port: "hotel", offerId: "paris-002" }] }],
      offers: OFFERS,
      allocations: allocationsFor(20_000, "target"),
      rates: RATES,
    });
    expect(result.dropped).toEqual([]);
    const accommodation = result.fit.categories.find((c) => c.category === "accommodation");
    expect(accommodation?.state).toBe("overTarget");
    expect(accommodation?.spentMinor).toBe(12_500);
    expect(accommodation?.spentMinor).toBeGreaterThan(accommodation?.allocatedMinor ?? 0);
  });
});
