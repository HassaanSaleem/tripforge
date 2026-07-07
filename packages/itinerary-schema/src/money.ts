// Money as carried BY the canonical itinerary (INV-009): integer MINOR units
// (e.g. cents) + explicit ISO-4217 currency. The schema stores money *values*;
// money *math* (markup, take-rate, revenue-share splits) lives in packages/domain
// (INV-010). This is declared structurally here — NOT imported from domain — so the
// schema package stays a leaf (INV-017). It is structurally identical to domain's Money.
import { z } from "zod";

export const MoneySchema = z
  .object({
    amountMinor: z.number().int(), // integer minor units — never a float / bare number
    currency: z.string().length(3), // ISO-4217, e.g. "USD"
  })
  .strict();

export type Money = z.infer<typeof MoneySchema>;
