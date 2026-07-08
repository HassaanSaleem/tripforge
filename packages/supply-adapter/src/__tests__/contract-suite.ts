// The reusable behavioral contract for ANY SupplyPort implementation (FR-008).
// The four sandbox *.contract.test.ts files instantiate it today; a future real
// aggregator adapter must pass the SAME suite unchanged — that is the machine
// proof that swapping suppliers touches nothing outside the adapter package
// (Constitution V). Assertions map 1:1 to contracts/supply-ports.md items 1–8/10.
// NOT a *.test.ts file: vitest runs it only through its instantiations.
import { describe, expect, it } from "vitest";
import type { OfferBase, QuoteBase, SupplyPort } from "../ports/common.js";

const MERCHANTS_OF_RECORD = ["platform", "agency", "supplier"];

export interface FakeClock {
  now: () => number;
  advance: (ms: number) => void;
}

export function makeFakeClock(startMs: number = Date.parse("2026-01-01T00:00:00Z")): FakeClock {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export interface SupplyPortContractHarness<TCriteria> {
  /** Fresh implementation on the given clock — no state may leak between calls. */
  makePort: (now: () => number) => SupplyPort<TCriteria, OfferBase, QuoteBase>;
  /** Criteria the implementation has inventory for. */
  searchCriteria: TCriteria;
  /** Criteria with no inventory (must yield an empty list, never a throw). */
  emptySearchCriteria: TCriteria;
  /**
   * Offer id that quotes normally but always fails to book with
   * supplier_rejected — each implementation supplies its own deterministic
   * rejection fixture (contract item 7, INV-007), so the suite itself stays
   * implementation-agnostic (FR-008).
   */
  failBookOfferId: string;
}

/** Search, take the first offer, and hold a quote for it — the common preamble. */
async function searchAndQuote<TCriteria>(
  port: SupplyPort<TCriteria, OfferBase, QuoteBase>,
  criteria: TCriteria,
): Promise<{ offer: OfferBase; quote: QuoteBase }> {
  const offers = await port.search(criteria);
  const offer = offers[0];
  if (!offer) {
    throw new Error("expected at least one offer for the harness searchCriteria");
  }
  const outcome = await port.quote(offer.offerId);
  if (outcome.status !== "quoted") {
    throw new Error(`expected quoted, got ${outcome.reason}`);
  }
  return { offer, quote: outcome.quote };
}

export function describeSupplyPortContract<TCriteria>(
  name: string,
  harness: SupplyPortContractHarness<TCriteria>,
): void {
  describe(`supply port contract: ${name}`, () => {
    // Item 1 — search is deterministic; every offer prices in exact minor units.
    it("search returns deterministic offers with content and exact money", async () => {
      const clock = makeFakeClock();
      const port = harness.makePort(clock.now);
      const first = await port.search(harness.searchCriteria);
      const second = await port.search(harness.searchCriteria);
      expect(first.length).toBeGreaterThan(0);
      expect(second).toEqual(first);
      for (const offer of first) {
        expect(offer.offerId).not.toBe("");
        expect(offer.content.title).not.toBe("");
        expect(Number.isInteger(offer.netRate.amountMinor)).toBe(true);
        expect(offer.netRate.currency).not.toBe("");
      }
    });

    it("search with no matching inventory returns an empty list, not an error", async () => {
      const port = harness.makePort(makeFakeClock().now);
      await expect(port.search(harness.emptySearchCriteria)).resolves.toEqual([]);
    });

    // Item 2 — a quote is a firm price with an explicit hold and merchant of record.
    it("quote carries the offer's net rate, a future expiry, and a merchant of record", async () => {
      const clock = makeFakeClock();
      const port = harness.makePort(clock.now);
      const { offer, quote } = await searchAndQuote(port, harness.searchCriteria);
      expect(quote.offerId).toBe(offer.offerId);
      expect(quote.netRate).toEqual(offer.netRate);
      expect(Date.parse(quote.expiresAt)).toBeGreaterThan(clock.now());
      expect(MERCHANTS_OF_RECORD).toContain(quote.merchantOfRecord);
    });

    it("quote of an unknown offer fails typed", async () => {
      const port = harness.makePort(makeFakeClock().now);
      await expect(port.quote("no-such-offer")).resolves.toEqual({
        status: "failed",
        reason: "unknown_offer",
      });
    });

    // Item 3 — book before expiry confirms against exactly that quote.
    it("book before expiry confirms a booking referencing the quote", async () => {
      const clock = makeFakeClock();
      const port = harness.makePort(clock.now);
      const { quote } = await searchAndQuote(port, harness.searchCriteria);
      const outcome = await port.book(quote.quoteId);
      expect(outcome.status).toBe("confirmed");
      if (outcome.status === "confirmed") {
        expect(outcome.booking.quoteId).toBe(quote.quoteId);
        expect(outcome.booking.bookingId).not.toBe("");
      }
    });

    // Item 4 — the hold boundary is exclusive; an expired quote re-quotes, never
    // books silently at a changed price (INV-006).
    it("book at/after expiry fails quote_expired, creates nothing, and re-quote issues a fresh hold", async () => {
      const clock = makeFakeClock();
      const port = harness.makePort(clock.now);
      const { offer, quote } = await searchAndQuote(port, harness.searchCriteria);
      clock.advance(Date.parse(quote.expiresAt) - clock.now()); // exactly the expiry instant
      const expired = await port.book(quote.quoteId);
      expect(expired).toEqual({
        status: "failed",
        quoteId: quote.quoteId,
        reason: "quote_expired",
      });
      // Nothing was created: the booking id a confirmation would have minted is unknown.
      const phantomCancel = await port.cancel(`b-${quote.quoteId}`);
      expect(phantomCancel.status).toBe("failed");
      // Re-quote path: same offer, fresh hold strictly beyond the old one.
      const requote = await port.quote(offer.offerId);
      expect(requote.status).toBe("quoted");
      if (requote.status === "quoted") {
        expect(requote.quote.quoteId).not.toBe(quote.quoteId);
        expect(Date.parse(requote.quote.expiresAt)).toBeGreaterThan(Date.parse(quote.expiresAt));
        await expect(port.book(requote.quote.quoteId)).resolves.toMatchObject({
          status: "confirmed",
        });
      }
    });

    // Item 5 — booking is idempotent per quote: one quote, at most one booking.
    it("booking the same quote twice replays the recorded outcome and never double-books", async () => {
      const clock = makeFakeClock();
      const port = harness.makePort(clock.now);
      const { quote } = await searchAndQuote(port, harness.searchCriteria);
      const first = await port.book(quote.quoteId);
      const second = await port.book(quote.quoteId);
      expect(second).toEqual(first);
      expect(first.status).toBe("confirmed");
      if (first.status === "confirmed") {
        // Exactly one booking exists: it cancels once, then reports already_cancelled.
        await expect(port.cancel(first.booking.bookingId)).resolves.toEqual({
          status: "cancelled",
          bookingId: first.booking.bookingId,
        });
        await expect(port.cancel(first.booking.bookingId)).resolves.toEqual({
          status: "failed",
          bookingId: first.booking.bookingId,
          reason: "already_cancelled",
        });
      }
    });

    // Item 6 — unknown quote fails typed.
    it("book of an unknown quote fails typed", async () => {
      const port = harness.makePort(makeFakeClock().now);
      await expect(port.book("no-such-quote")).resolves.toEqual({
        status: "failed",
        quoteId: "no-such-quote",
        reason: "unknown_quote",
      });
    });

    // Item 7 — deterministic partial-failure fixture (INV-007 building block).
    it("the fail-book fixture quotes normally but always books to supplier_rejected", async () => {
      const port = harness.makePort(makeFakeClock().now);
      const quoted = await port.quote(harness.failBookOfferId);
      expect(quoted.status).toBe("quoted");
      if (quoted.status === "quoted") {
        const outcome = await port.book(quoted.quote.quoteId);
        expect(outcome).toEqual({
          status: "failed",
          quoteId: quoted.quote.quoteId,
          reason: "supplier_rejected",
        });
        // Idempotent replay of the recorded failure.
        await expect(port.book(quoted.quote.quoteId)).resolves.toEqual(outcome);
      }
    });

    // Item 8 — cancel lifecycle is typed end to end.
    it("cancel of an unknown booking fails typed", async () => {
      const port = harness.makePort(makeFakeClock().now);
      await expect(port.cancel("no-such-booking")).resolves.toEqual({
        status: "failed",
        bookingId: "no-such-booking",
        reason: "unknown_booking",
      });
    });

    // Item 10 — no implicit conversion, ever (INV-009).
    it("quote and re-quote never change the offer's currency", async () => {
      const clock = makeFakeClock();
      const port = harness.makePort(clock.now);
      const { offer, quote } = await searchAndQuote(port, harness.searchCriteria);
      expect(quote.netRate.currency).toBe(offer.netRate.currency);
      clock.advance(24 * 60 * 60 * 1000);
      const requote = await port.quote(offer.offerId);
      expect(requote.status).toBe("quoted");
      if (requote.status === "quoted") {
        expect(requote.quote.netRate.currency).toBe(offer.netRate.currency);
      }
    });
  });
}
