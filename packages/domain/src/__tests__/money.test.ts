import { describe, it, expect } from "vitest";
import { money, addMoney, subtractMoney, splitEvenMinorUnits, MoneyError } from "../money.js";

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
