// Fixed deterministic exchange-rate table (spec 005 research D8; INV-009/019).
// Rates are SUPPLIED to the pure domain conversion math and recorded per use —
// a live rate source lands later as an adapter behind this same container seam,
// without touching domain code. P0 covers the sandbox's two currencies.
import type { ExchangeRate } from "@tripforge/domain";

export const STATIC_RATES: readonly ExchangeRate[] = [
  { from: "EUR", to: "USD", numerator: 108, denominator: 100 },
  { from: "USD", to: "EUR", numerator: 93, denominator: 100 },
];

export function findRate(
  rates: readonly ExchangeRate[],
  from: string,
  to: string,
): ExchangeRate | undefined {
  return rates.find((r) => r.from === from && r.to === to);
}
