// Deterministic sandbox hotel adapter (Constitution V / INV-019: tests + local boot
// use sandbox mocks, zero paid services). Deterministic = same input → same output,
// no network, no randomness — so L2/L3 tests are reproducible. This is the ONLY
// place supplier-specific behavior would live; the shapes it returns are OUR port
// shapes, not any aggregator's.
import { money } from "@tripforge/domain";
import type {
  HotelPort,
  HotelSearchCriteria,
  HotelOffer,
  HotelQuote,
  HotelBooking,
} from "../ports/hotel.js";

// A quote holds for this long before it must be re-quoted (INV-006). Sandbox uses a
// fixed short window; real adapters read it from the aggregator response (seed-0003).
const QUOTE_HOLD_MS = 15 * 60 * 1000;

export class SandboxHotelAdapter implements HotelPort {
  constructor(private readonly now: () => number = () => Date.now()) {}

  async search(criteria: HotelSearchCriteria): Promise<HotelOffer[]> {
    // Deterministic fixtures keyed off the destination so tests can assert exact rows.
    const base = criteria.destination.toLowerCase();
    return [
      { offerId: `${base}-001`, name: `${criteria.destination} Grand`, netRate: money(18_000, "USD") },
      { offerId: `${base}-002`, name: `${criteria.destination} Boutique`, netRate: money(12_500, "USD") },
    ];
  }

  async quote(offerId: string): Promise<HotelQuote> {
    return {
      quoteId: `q-${offerId}`,
      offerId,
      netRate: money(offerId.endsWith("001") ? 18_000 : 12_500, "USD"),
      expiresAt: new Date(this.now() + QUOTE_HOLD_MS).toISOString(),
    };
  }

  async book(quoteId: string): Promise<HotelBooking> {
    return { bookingId: `b-${quoteId}`, quoteId, status: "confirmed" };
  }

  async cancel(_bookingId: string): Promise<void> {
    // no-op in the sandbox
  }
}
