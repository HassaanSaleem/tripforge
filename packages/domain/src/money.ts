// Money — the platform's monetary value type (INV-009): integer MINOR units
// (e.g. cents) + explicit currency. Never floats, never bare numbers. All markup /
// take-rate / revenue-share arithmetic (seed-0005/0006) builds on these pure
// functions and lives only here (INV-010).

export type CurrencyCode = string; // ISO-4217 (e.g. "USD"); validated at boundaries via zod.

export interface Money {
  /** Integer amount in the currency's minor unit (cents for USD). */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new MoneyError(`amountMinor must be an integer, got ${amountMinor}`);
  }
  if (currency.length === 0) {
    throw new MoneyError("currency is required");
  }
  return { amountMinor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

/**
 * Split a Money amount by integer weights with NO lost or created minor units
 * (largest-remainder method): each part gets floor(total·w/Σw); the leftover
 * minor units go one-per-part in descending fractional-remainder order (ties
 * broken by position, so the result is deterministic). Conservation guarantee:
 * sum(result) === total. This is the weighted generalization of
 * splitEvenMinorUnits and the primitive the budget allocator is built on.
 */
export function splitByWeightsMinorUnits(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) {
    throw new MoneyError("weights must be non-empty");
  }
  for (const w of weights) {
    if (!Number.isInteger(w) || w < 0) {
      throw new MoneyError(`weights must be non-negative integers, got ${w}`);
    }
  }
  const weightSum = weights.reduce((acc, w) => acc + w, 0);
  if (weightSum === 0) {
    throw new MoneyError("at least one weight must be positive");
  }
  const sign = total.amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(total.amountMinor);
  const shares = weights.map((w) => ({ base: Math.floor((abs * w) / weightSum), rem: (abs * w) % weightSum }));
  let leftover = abs - shares.reduce((acc, s) => acc + s.base, 0);
  const order = shares
    .map((s, i) => ({ i, rem: s.rem }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (leftover === 0) break;
    const share = shares[i];
    if (!share) {
      throw new MoneyError("weighted split index out of range");
    }
    share.base += 1;
    leftover -= 1;
  }
  return shares.map((s) => ({ amountMinor: sign * s.base, currency: total.currency }));
}

/**
 * Apply an agency markup in basis points to a supplier NET rate, returning the
 * client-facing SELL price (INV-010: this math lives only here). The markup
 * component rounds half-up so `sell − net` is exactly the recorded markup —
 * the ledger identity the Money-Safe bar asserts.
 */
export function applyMarkupBps(net: Money, bps: number): Money {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new MoneyError(`markup bps must be a non-negative integer, got ${bps}`);
  }
  const markupMinor = Math.floor((net.amountMinor * bps + 5_000) / 10_000);
  return { amountMinor: net.amountMinor + markupMinor, currency: net.currency };
}

/**
 * The agency margin on a booked component: `sell − net` exactly — the ledger
 * identity every markup_ledger row records (INV-010: this math lives only
 * here). Same-currency is enforced (a cross-currency margin is meaningless);
 * a negative result is a MoneyError, because a sell below net can only mean
 * corrupted quote data — applyMarkupBps never produces one.
 */
export function markupOf(sell: Money, net: Money): Money {
  const markup = subtractMoney(sell, net);
  if (markup.amountMinor < 0) {
    throw new MoneyError(`markup must be non-negative: sell ${sell.amountMinor} < net ${net.amountMinor}`);
  }
  return markup;
}

/**
 * An exchange rate as an exact integer ratio (e.g. EUR→USD 108/100). Rates are
 * SUPPLIED to this math (fixed table at P0, a live source later) — never
 * fetched inside it, so conversion stays pure and reproducible from the
 * recorded numerator/denominator (INV-009 transparency).
 */
export interface ExchangeRate {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly numerator: number;
  readonly denominator: number;
}

/**
 * Convert a Money amount with an explicit rate (round half-up on the scaled
 * value). Conversion is an explicit, recorded operation (INV-009) — callers
 * log it and persist the rate alongside the converted amount.
 */
export function convertMoney(m: Money, rate: ExchangeRate): Money {
  if (m.currency !== rate.from) {
    throw new MoneyError(`rate is ${rate.from}→${rate.to} but amount is ${m.currency}`);
  }
  if (
    !Number.isInteger(rate.numerator) ||
    !Number.isInteger(rate.denominator) ||
    rate.numerator <= 0 ||
    rate.denominator <= 0
  ) {
    throw new MoneyError("exchange rate must be a positive integer ratio");
  }
  if (m.amountMinor < 0) {
    throw new MoneyError("conversion of negative amounts is not defined at P0 (no refund flow)");
  }
  const converted = Math.floor((m.amountMinor * rate.numerator + Math.floor(rate.denominator / 2)) / rate.denominator);
  return { amountMinor: converted, currency: rate.to };
}

/**
 * Split a Money amount into `parts` as evenly as possible with NO lost or created
 * minor units — the remainder cents are distributed one-per-part to the leading
 * parts. Conservation guarantee: sum(result) === total (asserted in tests). This
 * is the primitive every future revenue-share / markup split relies on.
 */
export function splitEvenMinorUnits(total: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`parts must be a positive integer, got ${parts}`);
  }
  const sign = total.amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(total.amountMinor);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  const result: Money[] = [];
  for (let i = 0; i < parts; i++) {
    const extra = i < remainder ? 1 : 0;
    result.push({ amountMinor: sign * (base + extra), currency: total.currency });
  }
  return result;
}

/**
 * The marketplace license-fee split (Constitution VI / INV-012 plumbing):
 * platform take = floor(price × takeRateBps / 10000), seller credit = the
 * remainder. Floor on the PLATFORM's side resolves sub-minor-unit remainders
 * in the seller's favor — the platform never rounds its own revenue up
 * (spec 006 research D5). Conservation holds by construction:
 * `platformTake + sellerCredit === price`, asserted in tests (SC-002).
 */
export function splitTakeRate(price: Money, takeRateBps: number): { platformTake: Money; sellerCredit: Money } {
  if (!Number.isInteger(takeRateBps) || takeRateBps < 0 || takeRateBps > 10_000) {
    throw new MoneyError(`take rate bps must be an integer in 0..10000, got ${takeRateBps}`);
  }
  if (price.amountMinor < 0) {
    throw new MoneyError(`license price must be non-negative, got ${price.amountMinor}`);
  }
  const takeMinor = Math.floor((price.amountMinor * takeRateBps) / 10_000);
  return {
    platformTake: { amountMinor: takeMinor, currency: price.currency },
    sellerCredit: { amountMinor: price.amountMinor - takeMinor, currency: price.currency },
  };
}
