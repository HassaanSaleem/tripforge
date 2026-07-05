// Supplier-agnostic HOTEL port (Constitution V, INV-005). These are OUR contract
// shapes — NO bedbank/aggregator (RateHawk/Hotelbeds/TBO/WebBeds) API shapes appear
// here or anywhere outside a concrete adapter. seed-0003 adds the full port family
// (activities/transfers/car) + the quote-then-book realities (hold/expiry, re-quote,
// multi-currency, partial-failure, merchant-of-record); seed-0001 establishes the
// boundary with the hotel port's four verbs.
import type { Money } from "@tripforge/domain";

export interface HotelSearchCriteria {
  destination: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  guests: number;
}

export interface HotelOffer {
  offerId: string;
  name: string;
  /** Net rate from the aggregator — money is integer minor units (INV-009). */
  netRate: Money;
}

export interface HotelQuote {
  quoteId: string;
  offerId: string;
  netRate: Money;
  /** Quote-then-book: a quote is only valid until it expires (INV-006). */
  expiresAt: string; // ISO datetime
}

export interface HotelBooking {
  bookingId: string;
  quoteId: string;
  status: "confirmed" | "failed";
}

/**
 * The hotel supply port. Handlers depend on THIS type, never a concrete adapter
 * class (clean-arch: "handlers depend on the port type").
 */
export interface HotelPort {
  search(criteria: HotelSearchCriteria): Promise<HotelOffer[]>;
  quote(offerId: string): Promise<HotelQuote>;
  book(quoteId: string): Promise<HotelBooking>;
  cancel(bookingId: string): Promise<void>;
}
