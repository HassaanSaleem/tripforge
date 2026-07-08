// Deterministic sandbox activity/tickets adapter (Constitution V / INV-019).
// Prices in EUR on purpose: multi-currency is a port-family property (INV-009,
// research D11). MoR placeholder: commission-model aggregators collect from the
// traveler, so the supplier side is merchant of record (research D7).
import { money } from "@tripforge/domain";
import type {
  ActivityOffer,
  ActivityPort,
  ActivityQuote,
  ActivitySearchCriteria,
} from "../ports/activity.js";
import type { BookingOutcome, CancelOutcome, QuoteOutcome } from "../ports/common.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxSupplyEngine } from "./engine.js";

const QUOTE_HOLD_MS = 30 * 60 * 1000;

export class SandboxActivityAdapter implements ActivityPort {
  private readonly engine: SandboxSupplyEngine<ActivityOffer>;

  constructor(now: () => number = () => Date.now()) {
    this.engine = new SandboxSupplyEngine<ActivityOffer>({
      component: "activity",
      holdMs: QUOTE_HOLD_MS,
      merchantOfRecord: "supplier",
      now,
    });
    this.engine.register([
      {
        offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
        content: { title: "Sandbox Always-Fails Activity" },
        netRate: money(3_300, "EUR"),
      },
    ]);
  }

  async search(criteria: ActivitySearchCriteria): Promise<ActivityOffer[]> {
    if (criteria.destination.trim() === "") {
      return [];
    }
    const base = criteria.destination.toLowerCase();
    return this.engine.register([
      {
        offerId: `${base}-act-001`,
        content: { title: `${criteria.destination} Old Town Walking Tour`, features: ["guide"] },
        netRate: money(4_500, "EUR"),
        durationMinutes: 90,
      },
      {
        offerId: `${base}-act-002`,
        content: { title: `${criteria.destination} River Cruise`, features: ["audio-guide"] },
        netRate: money(7_000, "EUR"),
        durationMinutes: 120,
      },
    ]);
  }

  async quote(offerId: string): Promise<QuoteOutcome<ActivityQuote>> {
    return this.engine.quote(offerId);
  }

  async book(quoteId: string): Promise<BookingOutcome> {
    return this.engine.book(quoteId);
  }

  async cancel(bookingId: string): Promise<CancelOutcome> {
    return this.engine.cancel(bookingId);
  }

  /** Read-only supplier-state witness for conservation tests — see engine. */
  liveBookingIds(): string[] {
    return this.engine.liveBookingIds();
  }
}
