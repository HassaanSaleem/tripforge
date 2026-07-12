// Deterministic supplier-lifecycle engine shared by the four sandbox adapters.
// It simulates the SUPPLIER's memory — issued quotes, recorded bookings — so it
// is stateful per instance and per process by design: its consumers are tests
// and the single-process compose stack (INV-019). Production booking topology
// (INV-028 serverless constraints) is seed-0005 scope.
//
// Deterministic = same call sequence + same clock → same ids and outcomes: ids
// are counter-derived, prices fixture-derived; no network, no randomness. This
// module is INTERNAL to the package — only the adapters and the fail-book
// fixture constant are exported through index.ts.
import type {
  BookingOutcome,
  CancelOutcome,
  MerchantOfRecord,
  OfferBase,
  QuoteBase,
  QuoteOutcome,
} from "../ports/common.js";

/**
 * Well-known fixture offer pre-seeded in every sandbox: it quotes normally but
 * always books to failed(supplier_rejected). Lets cart-level tests exercise
 * partial failure (INV-007) deterministically, with no mutable test-only API.
 */
export const SANDBOX_FAIL_BOOK_OFFER_ID = "sandbox-fail-book";

interface SandboxEngineOptions {
  /** Component tag baked into generated ids so cross-port ids never collide. */
  component: string;
  /** Hold window for quotes issued by this supplier (per-quote expiry, INV-006). */
  holdMs: number;
  merchantOfRecord: MerchantOfRecord;
  now: () => number;
}

/** Process-global engine-instance sequence, baked into quote ids. A real
 * supplier never re-mints ANOTHER hold's quote id after losing its quote
 * store, so ids must be unique across engine instances too (seed-0015
 * witness: a per-instance counter let a re-established quote id collide with
 * a sibling hold's persisted id, and the book-idempotency replay then backed
 * two booking components with ONE live supplier booking). Counter-derived —
 * same construction + call sequence per run still yields the same ids. */
let engineInstanceSeq = 0;

export class SandboxSupplyEngine<TOffer extends OfferBase> {
  private readonly offers = new Map<string, TOffer>();
  private readonly quotes = new Map<string, QuoteBase>();
  private readonly bookings = new Map<string, { quoteId: string; cancelled: boolean }>();
  /** First book outcome per quote, replayed verbatim on re-book (idempotency). */
  private readonly bookOutcomeByQuote = new Map<string, BookingOutcome>();
  private readonly instance: number;
  private quoteSeq = 0;

  constructor(private readonly opts: SandboxEngineOptions) {
    engineInstanceSeq += 1;
    this.instance = engineInstanceSeq;
  }

  /** Register offers the supplier "has" (search results and seeded fixtures). */
  register(offers: TOffer[]): TOffer[] {
    for (const offer of offers) {
      this.offers.set(offer.offerId, offer);
    }
    return offers;
  }

  quote(offerId: string): QuoteOutcome<QuoteBase> {
    const offer = this.offers.get(offerId);
    if (!offer) {
      return { status: "failed", reason: "unknown_offer" };
    }
    this.quoteSeq += 1;
    const quote: QuoteBase = {
      quoteId: `q-${this.opts.component}-i${this.instance}-${offerId}-${this.quoteSeq}`,
      offerId,
      netRate: offer.netRate,
      expiresAt: new Date(this.opts.now() + this.opts.holdMs).toISOString(),
      merchantOfRecord: this.opts.merchantOfRecord,
    };
    this.quotes.set(quote.quoteId, quote);
    return { status: "quoted", quote };
  }

  book(quoteId: string): BookingOutcome {
    const recorded = this.bookOutcomeByQuote.get(quoteId);
    if (recorded) {
      return recorded;
    }
    const quote = this.quotes.get(quoteId);
    if (!quote) {
      return { status: "failed", quoteId, reason: "unknown_quote" };
    }
    // Boundary is exclusive: at the expiry instant the hold is gone (INV-006).
    // Not recorded — the quote stays unconsumed and the caller re-quotes.
    if (this.opts.now() >= Date.parse(quote.expiresAt)) {
      return { status: "failed", quoteId, reason: "quote_expired" };
    }
    let outcome: BookingOutcome;
    if (quote.offerId === SANDBOX_FAIL_BOOK_OFFER_ID) {
      outcome = { status: "failed", quoteId, reason: "supplier_rejected" };
    } else {
      const bookingId = `b-${quoteId}`;
      this.bookings.set(bookingId, { quoteId, cancelled: false });
      outcome = { status: "confirmed", booking: { bookingId, quoteId } };
    }
    this.bookOutcomeByQuote.set(quoteId, outcome);
    return outcome;
  }

  cancel(bookingId: string): CancelOutcome {
    const booking = this.bookings.get(bookingId);
    if (!booking) {
      return { status: "failed", bookingId, reason: "unknown_booking" };
    }
    if (booking.cancelled) {
      return { status: "failed", bookingId, reason: "already_cancelled" };
    }
    booking.cancelled = true;
    return { status: "cancelled", bookingId };
  }

  /**
   * Read-only inspection of the bookings this supplier currently holds live
   * (booked, not cancelled). Conservation tests (FR-011, seed-0005d) assert
   * that after any interleaving the supplier's live bookings equal the
   * bookings our ledger recorded — this is the supplier-side witness. Not a
   * SupplyPort verb; it mutates nothing.
   */
  liveBookingIds(): string[] {
    return [...this.bookings].filter(([, b]) => !b.cancelled).map(([id]) => id);
  }
}

/**
 * Shared quote/book/cancel delegation for the sandbox adapters (QS3-2,
 * quality-sweep-iter-3.md finding 2) — every port speaks the same three verbs
 * against its own engine instance; only `search` (the fixture shape) differs
 * per component. Concrete adapters build their engine, register fixtures, then
 * call `super(engine)`.
 */
export abstract class SandboxPortAdapter<TOffer extends OfferBase> {
  protected constructor(protected readonly engine: SandboxSupplyEngine<TOffer>) {}

  quote(offerId: string): Promise<QuoteOutcome<QuoteBase>> {
    return Promise.resolve(this.engine.quote(offerId));
  }

  book(quoteId: string): Promise<BookingOutcome> {
    return Promise.resolve(this.engine.book(quoteId));
  }

  cancel(bookingId: string): Promise<CancelOutcome> {
    return Promise.resolve(this.engine.cancel(bookingId));
  }

  /** Read-only supplier-state witness for conservation tests — see engine. */
  liveBookingIds(): string[] {
    return this.engine.liveBookingIds();
  }
}
