// Supplier-agnostic HOTEL port (Constitution V, INV-005) — bedbank net rates,
// the primary margin driver (PRD §9.3). Shapes are OUR contract, never a
// bedbank's (RateHawk/Hotelbeds/TBO/WebBeds class). Quotes expose NET rates
// only: markup/sell-price math is pure domain code (INV-010), applied by the
// booking flow (seed-0005), never by a port.
import type { OfferBase, QuoteBase, SupplyPort } from "./common.js";

export interface HotelSearchCriteria {
  destination: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  guests: number;
}

/** Hotel inventory result — descriptive content separated from the net rate (INV-025/026). */
export type HotelOffer = OfferBase;

/** Firm hotel price hold (INV-006). */
export type HotelQuote = QuoteBase;

/**
 * The hotel supply port. Handlers depend on THIS type, never a concrete adapter
 * class (clean-arch: "handlers depend on the port type").
 */
export type HotelPort = SupplyPort<HotelSearchCriteria, HotelOffer, HotelQuote>;
