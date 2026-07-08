// Public surface of @tripforge/domain — pure business logic. Depends only on
// @tripforge/itinerary-schema (INV-017); imports no adapters, db, or apps.
export {
  money,
  addMoney,
  subtractMoney,
  splitEvenMinorUnits,
  splitByWeightsMinorUnits,
  applyMarkupBps,
  markupOf,
  convertMoney,
  MoneyError,
} from "./money.js";
export type { Money, CurrencyCode, ExchangeRate } from "./money.js";
export {
  BUDGET_CATEGORIES,
  allocateBudget,
  rebalanceAllocations,
  allocationsTotalMinor,
  categoryForPort,
} from "./budget.js";
export type {
  TripStyle,
  BudgetRequest,
  AllocateBudgetResult,
  RebalanceMove,
  RebalanceResult,
} from "./budget.js";
export { assembleItinerary } from "./assemble.js";
export type {
  AssembleRequest,
  AssembleResult,
  CategoryFit,
  DraftPort,
  DraftItemProposal,
  DraftDayProposal,
  DroppedProposal,
  VerifiedOffer,
} from "./assemble.js";
export { stampProvenance } from "./provenance.js";
