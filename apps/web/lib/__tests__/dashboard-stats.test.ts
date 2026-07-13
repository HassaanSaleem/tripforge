// L1 tests for the Agent Home dashboard's pure display helpers (spec 017
// contract §4): per-currency formatting never sums across currencies, and
// the transport-error mapping carries dashboard wording.
import { describe, it, expect } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { formatCurrencyTotals, dashboardStatsErrorMessage } from "../dashboard-stats.js";

function trpcError(code: string) {
  return new TRPCClientError("boom", {
    result: { error: { data: { code } } },
  } as unknown as ConstructorParameters<typeof TRPCClientError>[1]);
}

describe("formatCurrencyTotals (research D5)", () => {
  it("renders a single currency total through the existing money formatter", () => {
    expect(formatCurrencyTotals([{ currency: "USD", totalMinor: 124000 }])).toBe("1,240.00 USD");
  });

  it("renders multiple currencies as separate entries, never summed", () => {
    const rendered = formatCurrencyTotals([
      { currency: "USD", totalMinor: 100000 },
      { currency: "EUR", totalMinor: 50000 },
    ]);
    expect(rendered).toBe("1,000.00 USD, 500.00 EUR");
  });

  it("renders a placeholder for an empty (zero-state) agency", () => {
    expect(formatCurrencyTotals([])).toBe("—");
  });
});

describe("dashboardStatsErrorMessage", () => {
  it("maps FORBIDDEN to dashboard-specific wording", () => {
    expect(dashboardStatsErrorMessage(trpcError("FORBIDDEN"))).toMatch(/agency membership/);
  });

  it("maps UNAUTHORIZED to the shared session-expired wording", () => {
    expect(dashboardStatsErrorMessage(trpcError("UNAUTHORIZED"))).toMatch(/session has expired/);
  });
});
