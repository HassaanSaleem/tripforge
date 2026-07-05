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
