// L1 — budget allocator (spec 005 FR-001/002/005; INV-015). Money functions get
// exhaustive branch coverage (quality bar, Money-Safe).
import { describe, it, expect } from "vitest";
import type { BudgetAllocation } from "@tripforge/itinerary-schema";
import { MoneyError, money } from "../money.js";
import {
  BUDGET_CATEGORIES,
  allocateBudget,
  allocationsTotalMinor,
  categoryForPort,
  rebalanceAllocations,
} from "../budget.js";

describe("allocateBudget — conservation + bands (FR-001, SC-001)", () => {
  it("splits by the balanced profile and conserves the total exactly", () => {
    const result = allocateBudget({ totalMinor: 100_000, currency: "USD", mode: "hardCap", days: 4 });
    expect(result.status).toBe("allocated");
    if (result.status !== "allocated") return;
    expect(result.allocations.map((a) => a.category)).toEqual([...BUDGET_CATEGORIES]);
    expect(result.allocations.map((a) => a.allocated.amountMinor)).toEqual([40_000, 35_000, 12_000, 7_000, 6_000]);
    expect(allocationsTotalMinor(result.allocations)).toBe(100_000);
  });

  it("conserves the total across styles and awkward amounts (property)", () => {
    for (const tripStyle of ["balanced", "budget", "premium"] as const) {
      for (const totalMinor of [1, 99, 1_000, 33_333, 99_999, 1_234_567]) {
        const result = allocateBudget({ totalMinor, currency: "USD", mode: "target", tripStyle, days: 3 });
        expect(result.status).toBe("allocated");
        if (result.status !== "allocated") return;
        expect(allocationsTotalMinor(result.allocations)).toBe(totalMinor);
      }
    }
  });

  it("honors a manual flights reserve exactly and splits the rest (FR-002)", () => {
    const result = allocateBudget({
      totalMinor: 100_000,
      currency: "USD",
      mode: "hardCap",
      days: 4,
      flightsReserveMinor: 55_000,
    });
    expect(result.status).toBe("allocated");
    if (result.status !== "allocated") return;
    const flights = result.allocations.find((a) => a.category === "flightsTransport");
    expect(flights?.allocated.amountMinor).toBe(55_000);
    expect(allocationsTotalMinor(result.allocations)).toBe(100_000);
  });

  it("is infeasible when the budget cannot cover the flights reserve", () => {
    const result = allocateBudget({
      totalMinor: 40_000,
      currency: "USD",
      mode: "hardCap",
      days: 4,
      flightsReserveMinor: 50_000,
    });
    expect(result).toEqual({ status: "infeasible", reason: "budget_below_reserve" });
  });

  it("is infeasible with zero days", () => {
    expect(allocateBudget({ totalMinor: 100, currency: "USD", mode: "hardCap", days: 0 })).toEqual({
      status: "infeasible",
      reason: "no_days",
    });
  });

  it("rejects non-positive totals and negative reserves loudly", () => {
    expect(() => allocateBudget({ totalMinor: 0, currency: "USD", mode: "hardCap", days: 2 })).toThrow(MoneyError);
    expect(() =>
      allocateBudget({ totalMinor: 100, currency: "USD", mode: "hardCap", days: 2, flightsReserveMinor: -1 }),
    ).toThrow(MoneyError);
  });
});

function allocationsOf(amounts: Partial<Record<BudgetAllocation["category"], number>>): BudgetAllocation[] {
  return BUDGET_CATEGORIES.map((category) => ({
    category,
    allocated: money(amounts[category] ?? 0, "USD"),
  }));
}

describe("rebalanceAllocations — buffer first, reserve protected (FR-005, US4)", () => {
  it("moves exactly the deficit from buffer when buffer covers it", () => {
    const result = rebalanceAllocations(
      allocationsOf({ flightsTransport: 40_000, accommodation: 35_000, activities: 12_000, localTransport: 7_000, buffer: 6_000 }),
      {},
      "accommodation",
      4_000,
    );
    expect(result.remainingDeficitMinor).toBe(0);
    expect(result.moves).toEqual([{ from: "buffer", to: "accommodation", amountMinor: 4_000 }]);
    expect(allocationsTotalMinor(result.allocations)).toBe(100_000);
    expect(result.allocations.find((a) => a.category === "buffer")?.allocated.amountMinor).toBe(2_000);
    expect(result.allocations.find((a) => a.category === "accommodation")?.allocated.amountMinor).toBe(39_000);
  });

  it("drains donors in fixed order (buffer → localTransport → activities) past buffer", () => {
    const result = rebalanceAllocations(
      allocationsOf({ flightsTransport: 40_000, accommodation: 35_000, activities: 12_000, localTransport: 7_000, buffer: 6_000 }),
      {},
      "accommodation",
      14_000,
    );
    expect(result.remainingDeficitMinor).toBe(0);
    expect(result.moves).toEqual([
      { from: "buffer", to: "accommodation", amountMinor: 6_000 },
      { from: "localTransport", to: "accommodation", amountMinor: 7_000 },
      { from: "activities", to: "accommodation", amountMinor: 1_000 },
    ]);
    expect(allocationsTotalMinor(result.allocations)).toBe(100_000);
  });

  it("never drains below a donor's already-spent amount", () => {
    const result = rebalanceAllocations(
      allocationsOf({ flightsTransport: 0, accommodation: 100, activities: 500, localTransport: 0, buffer: 0 }),
      { activities: 400 },
      "accommodation",
      500,
    );
    // Only 100 of activities' 500 is headroom (400 already spent).
    expect(result.moves).toEqual([{ from: "activities", to: "accommodation", amountMinor: 100 }]);
    expect(result.remainingDeficitMinor).toBe(400);
  });

  it("NEVER uses the flights/transport reserve as a donor (FR-002)", () => {
    const result = rebalanceAllocations(
      allocationsOf({ flightsTransport: 50_000, accommodation: 100, activities: 0, localTransport: 0, buffer: 0 }),
      {},
      "accommodation",
      10_000,
    );
    expect(result.moves).toEqual([]);
    expect(result.remainingDeficitMinor).toBe(10_000);
    expect(result.allocations.find((a) => a.category === "flightsTransport")?.allocated.amountMinor).toBe(50_000);
  });

  it("rejects a flights-reserve deficit target and negative deficits", () => {
    const allocations = allocationsOf({ flightsTransport: 10, buffer: 10 });
    expect(() => rebalanceAllocations(allocations, {}, "flightsTransport", 5)).toThrow(MoneyError);
    expect(() => rebalanceAllocations(allocations, {}, "accommodation", -5)).toThrow(MoneyError);
  });
});

describe("categoryForPort — the spend mapping (FR-004)", () => {
  it("maps each bookable port to its budget category", () => {
    expect(categoryForPort("hotel")).toBe("accommodation");
    expect(categoryForPort("activity")).toBe("activities");
    expect(categoryForPort("transfer")).toBe("localTransport");
  });
});
