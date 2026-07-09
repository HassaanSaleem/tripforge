import { describe, it, expect } from "vitest";
import {
  money,
  addMoney,
  subtractMoney,
  splitEvenMinorUnits,
  splitByWeightsMinorUnits,
  applyMarkupBps,
  markupOf,
  splitTakeRate,
  convertMoney,
  MoneyError,
} from "../money.js";

describe("money constructor (INV-009 integer minor units)", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(10.5, "USD")).toThrow(MoneyError);
  });
  it("rejects empty currency", () => {
    expect(() => money(100, "")).toThrow(MoneyError);
  });
  it("builds a valid Money", () => {
    expect(money(100, "USD")).toEqual({ amountMinor: 100, currency: "USD" });
  });
});

describe("add/subtract enforce same currency", () => {
  it("adds within a currency", () => {
    expect(addMoney(money(100, "USD"), money(250, "USD"))).toEqual({ amountMinor: 350, currency: "USD" });
  });
  it("subtracts within a currency", () => {
    expect(subtractMoney(money(300, "USD"), money(100, "USD"))).toEqual({ amountMinor: 200, currency: "USD" });
  });
  it("throws on currency mismatch", () => {
    expect(() => addMoney(money(100, "USD"), money(100, "EUR"))).toThrow(MoneyError);
  });
});

describe("splitEvenMinorUnits — conservation (no lost/created cents)", () => {
  it("splits evenly when divisible", () => {
    const parts = splitEvenMinorUnits(money(900, "USD"), 3);
    expect(parts.map((p) => p.amountMinor)).toEqual([300, 300, 300]);
  });

  it("distributes the remainder to leading parts", () => {
    const parts = splitEvenMinorUnits(money(1000, "USD"), 3);
    expect(parts.map((p) => p.amountMinor)).toEqual([334, 333, 333]);
  });

  it("conserves the total for many (amount, parts) combinations", () => {
    for (let total = 0; total <= 200; total += 7) {
      for (let parts = 1; parts <= 9; parts++) {
        const split = splitEvenMinorUnits(money(total, "USD"), parts);
        const sum = split.reduce((acc, p) => acc + p.amountMinor, 0);
        expect(sum).toBe(total); // conservation
        expect(split).toHaveLength(parts);
        // parts differ by at most 1 minor unit
        const amounts = split.map((p) => p.amountMinor);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("conserves for negative totals (e.g. refunds)", () => {
    const split = splitEvenMinorUnits(money(-1000, "USD"), 3);
    const sum = split.reduce((acc, p) => acc + p.amountMinor, 0);
    expect(sum).toBe(-1000);
    expect(split.map((p) => p.amountMinor)).toEqual([-334, -333, -333]);
  });

  it("rejects non-positive parts", () => {
    expect(() => splitEvenMinorUnits(money(100, "USD"), 0)).toThrow(MoneyError);
    expect(() => splitEvenMinorUnits(money(100, "USD"), -2)).toThrow(MoneyError);
  });
});

describe("splitByWeightsMinorUnits — weighted conservation (spec 005 FR-001)", () => {
  it("splits exactly by weights when divisible", () => {
    const parts = splitByWeightsMinorUnits(money(1000, "USD"), [40, 35, 12, 7, 6]);
    expect(parts.map((p) => p.amountMinor)).toEqual([400, 350, 120, 70, 60]);
  });

  it("distributes leftover cents by largest remainder, deterministically", () => {
    // 100 over weights [1,1,1] → 34/33/33 (ties broken by position).
    const parts = splitByWeightsMinorUnits(money(100, "USD"), [1, 1, 1]);
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
  });

  it("gives zero-weight categories exactly zero", () => {
    const parts = splitByWeightsMinorUnits(money(999, "USD"), [0, 1, 0]);
    expect(parts.map((p) => p.amountMinor)).toEqual([0, 999, 0]);
  });

  it("conserves the total across many (amount, weight-profile) combinations", () => {
    const profiles = [
      [40, 35, 12, 7, 6],
      [1, 2, 3],
      [7, 11],
      [3, 0, 5, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ];
    for (let total = 0; total <= 500; total += 13) {
      for (const weights of profiles) {
        const split = splitByWeightsMinorUnits(money(total, "USD"), weights);
        const sum = split.reduce((acc, p) => acc + p.amountMinor, 0);
        expect(sum).toBe(total); // conservation — no lost/created minor units
        expect(split).toHaveLength(weights.length);
      }
    }
  });

  it("conserves for negative totals", () => {
    const split = splitByWeightsMinorUnits(money(-100, "USD"), [1, 1, 1]);
    expect(split.reduce((acc, p) => acc + p.amountMinor, 0)).toBe(-100);
  });

  it("rejects empty, negative, non-integer, and all-zero weights", () => {
    expect(() => splitByWeightsMinorUnits(money(100, "USD"), [])).toThrow(MoneyError);
    expect(() => splitByWeightsMinorUnits(money(100, "USD"), [1, -1])).toThrow(MoneyError);
    expect(() => splitByWeightsMinorUnits(money(100, "USD"), [1.5, 1])).toThrow(MoneyError);
    expect(() => splitByWeightsMinorUnits(money(100, "USD"), [0, 0])).toThrow(MoneyError);
  });
});

describe("applyMarkupBps — sell = net + markup exactly (INV-010)", () => {
  it("applies a plain percentage markup", () => {
    // 12500 net + 15% = 14375
    expect(applyMarkupBps(money(12_500, "USD"), 1500)).toEqual({ amountMinor: 14_375, currency: "USD" });
  });

  it("rounds the markup component half-up", () => {
    // 333 × 1500bps = 49.95 → 50
    expect(applyMarkupBps(money(333, "USD"), 1500).amountMinor).toBe(383);
    // 333 × 100bps = 3.33 → 3
    expect(applyMarkupBps(money(333, "USD"), 100).amountMinor).toBe(336);
    // 50 × 100bps = 0.5 → 1 (half rounds up)
    expect(applyMarkupBps(money(50, "USD"), 100).amountMinor).toBe(51);
  });

  it("zero bps is the identity", () => {
    expect(applyMarkupBps(money(9_900, "EUR"), 0)).toEqual({ amountMinor: 9_900, currency: "EUR" });
  });

  it("the ledger identity holds: (sell − net) is an exact integer markup", () => {
    for (let net = 1; net < 2_000; net += 37) {
      for (const bps of [0, 1, 250, 1500, 10_000]) {
        const sell = applyMarkupBps(money(net, "USD"), bps);
        const markup = sell.amountMinor - net;
        expect(Number.isInteger(markup)).toBe(true);
        expect(markup).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejects negative or fractional bps", () => {
    expect(() => applyMarkupBps(money(100, "USD"), -1)).toThrow(MoneyError);
    expect(() => applyMarkupBps(money(100, "USD"), 12.5)).toThrow(MoneyError);
  });
});

describe("markupOf — the ledger margin, sell − net exactly (INV-010)", () => {
  it("returns sell − net in the shared currency", () => {
    expect(markupOf(money(14_375, "USD"), money(12_500, "USD"))).toEqual({ amountMinor: 1_875, currency: "USD" });
  });

  it("zero markup is legal (0 bps quotes)", () => {
    expect(markupOf(money(9_900, "EUR"), money(9_900, "EUR")).amountMinor).toBe(0);
  });

  it("closes the loop with applyMarkupBps: markupOf(applyMarkupBps(net, bps), net) is the exact markup", () => {
    for (let net = 1; net < 2_000; net += 37) {
      for (const bps of [0, 1, 250, 1500, 10_000]) {
        const sell = applyMarkupBps(money(net, "USD"), bps);
        expect(markupOf(sell, money(net, "USD")).amountMinor).toBe(sell.amountMinor - net);
      }
    }
  });

  it("rejects cross-currency margins", () => {
    expect(() => markupOf(money(100, "USD"), money(100, "EUR"))).toThrow(MoneyError);
  });

  it("rejects a sell below net (corrupted quote data, never a valid ledger row)", () => {
    expect(() => markupOf(money(99, "USD"), money(100, "USD"))).toThrow(MoneyError);
  });
});

describe("convertMoney — explicit integer-ratio conversion (INV-009)", () => {
  const eurToUsd = { from: "EUR", to: "USD", numerator: 108, denominator: 100 };

  it("converts with the declared ratio, rounding half-up", () => {
    expect(convertMoney(money(10_000, "EUR"), eurToUsd)).toEqual({ amountMinor: 10_800, currency: "USD" });
    // 3300 × 108/100 = 3564
    expect(convertMoney(money(3_300, "EUR"), eurToUsd).amountMinor).toBe(3_564);
    // 55 × 108/100 = 59.4 → 59 ; 50 × 108/100 = 54 ; half-up case: 25 × 110/100 = 27.5 → 28
    expect(convertMoney(money(55, "EUR"), eurToUsd).amountMinor).toBe(59);
    expect(convertMoney(money(25, "EUR"), { from: "EUR", to: "USD", numerator: 110, denominator: 100 }).amountMinor).toBe(28);
  });

  it("is reproducible from the recorded numerator/denominator (FR-008)", () => {
    const amount = money(4_500, "EUR");
    const first = convertMoney(amount, eurToUsd);
    expect(convertMoney(amount, eurToUsd)).toEqual(first);
  });

  it("throws on currency mismatch with the rate", () => {
    expect(() => convertMoney(money(100, "USD"), eurToUsd)).toThrow(MoneyError);
  });

  it("rejects non-positive or fractional ratios and negative amounts", () => {
    expect(() => convertMoney(money(100, "EUR"), { ...eurToUsd, numerator: 0 })).toThrow(MoneyError);
    expect(() => convertMoney(money(100, "EUR"), { ...eurToUsd, denominator: -5 })).toThrow(MoneyError);
    expect(() => convertMoney(money(100, "EUR"), { ...eurToUsd, numerator: 1.5 })).toThrow(MoneyError);
    expect(() => convertMoney(money(-100, "EUR"), eurToUsd)).toThrow(MoneyError);
  });
});

describe("splitTakeRate — marketplace license-fee split (spec 006 D5, SC-002)", () => {
  it("splits a divisible price exactly", () => {
    const { platformTake, sellerCredit } = splitTakeRate(money(10_000, "USD"), 1_000);
    expect(platformTake).toEqual({ amountMinor: 1_000, currency: "USD" });
    expect(sellerCredit).toEqual({ amountMinor: 9_000, currency: "USD" });
  });
  it("floors the PLATFORM take — sub-minor-unit remainder goes to the seller", () => {
    // 999 × 10% = 99.9 → take 99, seller 900 (never take 100)
    const { platformTake, sellerCredit } = splitTakeRate(money(999, "USD"), 1_000);
    expect(platformTake.amountMinor).toBe(99);
    expect(sellerCredit.amountMinor).toBe(900);
  });
  it("conserves price = take + credit across many (price, bps) combinations", () => {
    for (const price of [0, 1, 7, 99, 100, 999, 12_345, 1_000_000, 987_654_321]) {
      for (const bps of [0, 1, 250, 999, 1_000, 3_333, 9_999, 10_000]) {
        const { platformTake, sellerCredit } = splitTakeRate(money(price, "EUR"), bps);
        expect(platformTake.amountMinor + sellerCredit.amountMinor).toBe(price);
        expect(Number.isInteger(platformTake.amountMinor)).toBe(true);
        expect(platformTake.amountMinor).toBeGreaterThanOrEqual(0);
        expect(platformTake.currency).toBe("EUR");
        expect(sellerCredit.currency).toBe("EUR");
      }
    }
  });
  it("handles the bps extremes: 0 bps → all seller; 10000 bps → all platform", () => {
    expect(splitTakeRate(money(555, "USD"), 0)).toEqual({
      platformTake: { amountMinor: 0, currency: "USD" },
      sellerCredit: { amountMinor: 555, currency: "USD" },
    });
    expect(splitTakeRate(money(555, "USD"), 10_000)).toEqual({
      platformTake: { amountMinor: 555, currency: "USD" },
      sellerCredit: { amountMinor: 0, currency: "USD" },
    });
  });
  it("a zero price splits to zero/zero (free listings still record a split)", () => {
    expect(splitTakeRate(money(0, "USD"), 1_000)).toEqual({
      platformTake: { amountMinor: 0, currency: "USD" },
      sellerCredit: { amountMinor: 0, currency: "USD" },
    });
  });
  it("rejects out-of-range or non-integer bps and negative prices", () => {
    expect(() => splitTakeRate(money(100, "USD"), -1)).toThrow(MoneyError);
    expect(() => splitTakeRate(money(100, "USD"), 10_001)).toThrow(MoneyError);
    expect(() => splitTakeRate(money(100, "USD"), 12.5)).toThrow(MoneyError);
    expect(() => splitTakeRate({ amountMinor: -100, currency: "USD" }, 1_000)).toThrow(MoneyError);
  });
});
