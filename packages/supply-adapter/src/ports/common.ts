// Shared vocabulary of the supply port family (Constitution V, INV-005). These are
// OUR contract shapes — no aggregator API shape (RateHawk/Viator/Mozio/CarTrawler
// class) appears here or anywhere outside a concrete adapter. Money is integer
// minor units + explicit currency (INV-009); conversion is an explicit, logged
// operation elsewhere — never implicit inside a port.
//
// Business failures are VALUES (status-discriminated outcomes with closed reason
// sets) so multi-supplier carts can branch on them (INV-007); thrown exceptions
// are reserved for programmer/infra faults.
import type { Money } from "@tripforge/domain";

/**
 * Who is merchant of record for a component (PRD §9.2) — drives payments,
 * refunds, and liability design. P0 ships the declaration only; real adapters
 * supply the true value from aggregator terms.
 */
export type MerchantOfRecord = "platform" | "agency" | "supplier";

/**
 * Long-lived descriptive supply content, structurally separate from live price
 * data (INV-025/026): content may later be materialized into Postgres derived
 * tables with semantic keys; net rates and quotes are NEVER cached beyond their
 * hold expiry. Media refs join with the materialization follow-up — the only
 * legal media-ref type is itinerary-schema's MediaRef (INV-001).
 */
export interface SupplyContent {
  title: string;
  description?: string;
  features?: string[];
}

export type QuoteFailureReason = "unknown_offer";
export type BookFailureReason = "quote_expired" | "supplier_rejected" | "unknown_quote";
export type CancelFailureReason = "unknown_booking" | "already_cancelled";

export type QuoteOutcome<TQuote extends QuoteBase> =
  | { status: "quoted"; quote: TQuote }
  | { status: "failed"; reason: QuoteFailureReason };

/** Identity of a confirmed booking — always traceable to the quote it consumed. */
export interface SupplyBooking {
  bookingId: string;
  quoteId: string;
}

export type BookingOutcome =
  | { status: "confirmed"; booking: SupplyBooking }
  | { status: "failed"; quoteId: string; reason: BookFailureReason };

export type CancelOutcome =
  | { status: "cancelled"; bookingId: string }
  | { status: "failed"; bookingId: string; reason: CancelFailureReason };

export interface OfferBase {
  offerId: string;
  content: SupplyContent;
  /** Net rate from the supplier — what the agency pays (INV-009). */
  netRate: Money;
}

export interface QuoteBase {
  quoteId: string;
  offerId: string;
  netRate: Money;
  /**
   * Quote-then-book: a firm price only while `now < expiresAt`; booking at or
   * after this instant fails and the caller re-quotes (INV-006). Never persist
   * a quote beyond it (INV-026 carve-out).
   */
  expiresAt: string; // ISO datetime
  merchantOfRecord: MerchantOfRecord;
}

/**
 * The four verbs every supply component speaks (PRD §9.3/9.4). Handlers depend
 * on a port type, never a concrete adapter class (clean-arch DI rule).
 */
export interface SupplyPort<TCriteria, TOffer extends OfferBase, TQuote extends QuoteBase> {
  search(criteria: TCriteria): Promise<TOffer[]>;
  quote(offerId: string): Promise<QuoteOutcome<TQuote>>;
  book(quoteId: string): Promise<BookingOutcome>;
  cancel(bookingId: string): Promise<CancelOutcome>;
}
