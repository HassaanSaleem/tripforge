// Supplier-agnostic TRANSFER / private-driver port (Constitution V, INV-005) —
// the Mozio/Jayride/HolidayTaxis class of the P0 component map (PRD §9.3),
// behind OUR contract shapes only. NOT ride-hailing: licensed third-party
// transfer providers (PRD non-goal boundary).
import type { OfferBase, QuoteBase, SupplyPort } from "./common.js";

export interface TransferSearchCriteria {
  from: string;
  to: string;
  /** ISO datetime of the pickup. */
  at: string;
  passengers: number;
}

export type TransferOffer = OfferBase & {
  /**
   * What suppliers sell at P0 — a subset of the canonical TransferItemSchema
   * mode enum (private | shared | rail | other); the schema stays authoritative
   * for itinerary items and is not imported here (leaf discipline).
   */
  mode: "private" | "shared";
};

export type TransferQuote = QuoteBase;

export type TransferPort = SupplyPort<TransferSearchCriteria, TransferOffer, TransferQuote>;
