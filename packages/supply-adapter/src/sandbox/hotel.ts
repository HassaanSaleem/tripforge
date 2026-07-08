// Deterministic sandbox hotel adapter (Constitution V / INV-019: tests + local
// boot use sandbox mocks, zero paid services). Fixtures keyed off the criteria
// so tests can assert exact rows; lifecycle (holds, expiry, idempotent booking,
// cancels) lives in the shared engine. MoR placeholder: bedbank net-rate model —
// the agency collects from the client and pays net, so the agency is merchant
// of record (research D7; real adapters supply the true value).
import { money } from "@tripforge/domain";
import type { BookingOutcome, CancelOutcome, QuoteOutcome } from "../ports/common.js";
import type { HotelOffer, HotelPort, HotelQuote, HotelSearchCriteria } from "../ports/hotel.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxSupplyEngine } from "./engine.js";

// A hotel quote holds for this long before it must be re-quoted (INV-006).
// Windows differ per component so nothing can assume a global TTL (research D6).
const QUOTE_HOLD_MS = 15 * 60 * 1000;

export class SandboxHotelAdapter implements HotelPort {
  private readonly engine: SandboxSupplyEngine<HotelOffer>;

  constructor(now: () => number = () => Date.now()) {
    this.engine = new SandboxSupplyEngine<HotelOffer>({
      component: "hotel",
      holdMs: QUOTE_HOLD_MS,
      merchantOfRecord: "agency",
      now,
    });
    this.engine.register([
      {
        offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
        content: { title: "Sandbox Always-Fails Hotel" },
        netRate: money(9_900, "USD"),
      },
    ]);
  }

  async search(criteria: HotelSearchCriteria): Promise<HotelOffer[]> {
    if (criteria.destination.trim() === "") {
      return []; // no inventory: empty list, never a throw
    }
    const base = criteria.destination.toLowerCase();
    return this.engine.register([
      {
        offerId: `${base}-001`,
        content: { title: `${criteria.destination} Grand`, features: ["wifi", "breakfast"] },
        netRate: money(18_000, "USD"),
      },
      {
        offerId: `${base}-002`,
        content: { title: `${criteria.destination} Boutique`, features: ["wifi"] },
        netRate: money(12_500, "USD"),
      },
    ]);
  }

  async quote(offerId: string): Promise<QuoteOutcome<HotelQuote>> {
    return this.engine.quote(offerId);
  }

  async book(quoteId: string): Promise<BookingOutcome> {
    return this.engine.book(quoteId);
  }

  async cancel(bookingId: string): Promise<CancelOutcome> {
    return this.engine.cancel(bookingId);
  }
}
