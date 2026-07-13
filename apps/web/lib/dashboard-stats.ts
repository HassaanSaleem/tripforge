// Pure display helpers for the Agent Home dashboard (spec 017 contract §4).
// DOM-free so the exact strings are pinned by L1 tests. No money arithmetic
// here — currency totals pass through formatMinorAmount unchanged (FR-011).
import { formatMinorAmount } from "./planner-form.js";
import { transportErrorMessage } from "./transport-error.js";

/** "1,240.00 USD, 300.00 EUR" style summary — each currency shown separately, never summed (research D5). */
export function formatCurrencyTotals(totals: ReadonlyArray<{ currency: string; totalMinor: number }>): string {
  if (totals.length === 0) return "—";
  return totals.map((t) => formatMinorAmount(t.totalMinor, t.currency)).join(", ");
}

export function dashboardStatsErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Your dashboard requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Reload the page and try again.",
  });
}
