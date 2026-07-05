// Public surface of @tripforge/domain — pure business logic. Depends only on
// @tripforge/itinerary-schema (INV-017); imports no adapters, db, or apps.
export { money, addMoney, subtractMoney, splitEvenMinorUnits, MoneyError } from "./money.js";
export type { Money, CurrencyCode } from "./money.js";
export { stampProvenance } from "./provenance.js";
