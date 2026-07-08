// Supplier-agnostic ACTIVITY/TICKETS port (Constitution V, INV-005) — the
// Viator/GetYourGuide/Tiqets/Klook class of the P0 component map (PRD §9.3),
// behind OUR contract shapes only.
import type { OfferBase, QuoteBase, SupplyPort } from "./common.js";

export interface ActivitySearchCriteria {
  destination: string;
  /** ISO date the activity should take place; omit for date-flexible search. */
  date?: string;
  participants: number;
}

export type ActivityOffer = OfferBase & {
  durationMinutes?: number;
};

export type ActivityQuote = QuoteBase;

export type ActivityPort = SupplyPort<ActivitySearchCriteria, ActivityOffer, ActivityQuote>;
