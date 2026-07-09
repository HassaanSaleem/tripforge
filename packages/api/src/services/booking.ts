// Quote-then-book orchestration (spec 005 US2/US3; contracts §3–4).
//
// QUOTE: per bookable item — port quote (firm hold), explicit conversion into
// the itinerary currency (rate recorded — FR-008), pure markup math (INV-010),
// server-persisted hold row (FR-009). Per-item failures never abort siblings.
//
// BOOK: validate holds server-side (tenant, unconsumed, unexpired — the port
// re-enforces expiry independently), then RESERVE-THEN-BOOK (research D12):
// one short transaction claims every still-unconsumed hold (id-ordered
// locking read + atomic consumed_at flip) BEFORE any supplier call, so the
// losing side of a concurrent race never reaches the supplier. The same
// transaction enforces ITEM-level exclusivity (FR-016, spec-gap-0002): an
// item with a consumed sibling hold or a recorded booking component is
// already booked, and booking any other hold for it fails typed
// item_already_booked — backstopped by UNIQUE (itinerary_id, item_id) on
// booking_component. Claimed holds
// book per component — re-establishing the supplier hold when the supplier no
// longer recognizes it (INV-028: quote and book may run in different
// processes; the persisted row is the truth and the re-quoted price must
// match it exactly) — and a supplier failure RELEASES the claim. ONE
// recording transaction then writes booking + reservation + ledger + PMF
// events for the booked components; if it fails after supplier bookings were
// made, each one is compensated with port.cancel and the claims are released
// — no supplier booking survives unrecorded (FR-011/INV-011 conservation).
// A booking where every component fails writes NOTHING.
import { applyMarkupBps, convertMoney, markupOf, money, type Money } from "@tripforge/domain";
import { parseItinerary, type Itinerary } from "@tripforge/itinerary-schema";
import {
  and,
  eq,
  inArray,
  booking as bookingTable,
  bookingComponent as bookingComponentTable,
  bookingQuote as bookingQuoteTable,
  itinerary as itineraryTable,
  markupLedger as markupLedgerTable,
  recordPmfEvent,
  scopedWhere,
} from "@tripforge/db";
import type { SupplyPort, OfferBase, QuoteBase } from "@tripforge/supply-adapter";
import { createLogger } from "@tripforge/shared";
import { z } from "zod";
import type { AgentSessionContext, Container } from "../context.js";
import { findRate } from "../rates.js";
import { verifiedSupplyCatalog, type TripRequest } from "./planner.js";

const logger = createLogger({ bindings: { component: "booking" } });

export const quoteInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  markupBps: z.number().int().min(0).max(10_000).default(1500),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const bookInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  quoteRowIds: z.array(z.uuid()).min(1),
});
export type BookInput = z.infer<typeof bookInputSchema>;

export interface HeldQuote {
  quoteRowId: string;
  netMinor: number;
  netCurrency: string;
  rate?: { numerator: number; denominator: number };
  sellMinor: number;
  currency: string;
  markupBps: number;
  merchantOfRecord: string;
  expiresAt: string;
}

export type QuoteItemOutcome =
  | { itemId: string; outcome: "held"; quote: HeldQuote }
  | { itemId: string; outcome: "failed"; reason: "unknown_offer" | "no_rate" | "already_booked" };

export type BookComponentOutcome =
  | {
      quoteRowId: string;
      itemId: string;
      outcome: "confirmed";
      supplierBookingId: string;
      netMinor: number;
      netCurrency: string;
      sellMinor: number;
      currency: string;
      merchantOfRecord: string;
    }
  | {
      quoteRowId: string;
      itemId: string;
      outcome: "failed";
      reason: "quote_expired" | "supplier_rejected" | "unknown_quote" | "already_consumed" | "item_already_booked";
    };

export interface BookOutcome {
  status: "confirmed" | "partially_confirmed" | "failed";
  bookingId?: string;
  components: BookComponentOutcome[];
}

type AnySupplyPort = SupplyPort<unknown, OfferBase, QuoteBase>;

function portFor(container: Container, port: string): AnySupplyPort | undefined {
  switch (port) {
    case "hotel":
      return container.hotel as AnySupplyPort;
    case "activity":
      return container.activity as AnySupplyPort;
    case "transfer":
      return container.transfer as AnySupplyPort;
    default:
      return undefined;
  }
}

interface ItineraryRow {
  id: string;
  agencyId: string;
  document: Itinerary;
  tripRequest: TripRequest;
}

async function loadItinerary(
  container: Container,
  session: AgentSessionContext,
  itineraryId: string,
): Promise<ItineraryRow | undefined> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const rows = await db
    .select()
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId, eq(itineraryTable.id, itineraryId)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  // Boundary re-validation (INV-001): the document is canonical on read too.
  const document = parseItinerary(row.document);
  return { id: row.id, agencyId: row.agencyId, document, tripRequest: row.tripRequest as TripRequest };
}

export async function quoteItinerary(
  container: Container,
  session: AgentSessionContext,
  input: QuoteInput,
): Promise<{ status: "not_found" } | { status: "quoted"; items: QuoteItemOutcome[] }> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const row = await loadItinerary(container, session, input.itineraryId);
  if (!row) return { status: "not_found" };

  // Re-register supply state from the persisted request so quoting works in a
  // fresh process too (research D6) — idempotent against the sandbox engines.
  await verifiedSupplyCatalog(container, row.tripRequest);

  const alreadyBooked = new Set(
    (
      await db
        .select({ itemId: bookingComponentTable.itemId })
        .from(bookingComponentTable)
        .where(scopedWhere(bookingComponentTable.agencyId, session.agencyId, eq(bookingComponentTable.itineraryId, row.id)))
    ).map((r) => r.itemId),
  );

  const bookable = row.document.days.flatMap((day) =>
    day.items.flatMap((item) => (item.supplyRef ? [{ itemId: item.id, supplyRef: item.supplyRef }] : [])),
  );

  const outcomes: QuoteItemOutcome[] = [];
  const rowsToInsert: (typeof bookingQuoteTable.$inferInsert)[] = [];

  for (const { itemId, supplyRef } of bookable) {
    if (alreadyBooked.has(itemId)) {
      outcomes.push({ itemId, outcome: "failed", reason: "already_booked" });
      continue;
    }
    const port = portFor(container, supplyRef.port);
    if (!port) {
      outcomes.push({ itemId, outcome: "failed", reason: "unknown_offer" });
      continue;
    }
    const quoted = await port.quote(supplyRef.externalId);
    if (quoted.status === "failed") {
      outcomes.push({ itemId, outcome: "failed", reason: "unknown_offer" });
      continue;
    }
    const quote = quoted.quote;

    let convertedNet: Money;
    let rate: { numerator: number; denominator: number } | undefined;
    if (quote.netRate.currency === row.document.currency) {
      convertedNet = quote.netRate;
    } else {
      const found = findRate(container.rates, quote.netRate.currency, row.document.currency);
      if (!found) {
        outcomes.push({ itemId, outcome: "failed", reason: "no_rate" });
        continue;
      }
      convertedNet = convertMoney(quote.netRate, found);
      rate = { numerator: found.numerator, denominator: found.denominator };
      // Conversions are explicit, logged operations (INV-009).
      logger.info("booking.quote.currency_conversion", {
        agencyId: session.agencyId,
        itineraryId: row.id,
        itemId,
        from: quote.netRate.currency,
        to: row.document.currency,
        amountMinor: quote.netRate.amountMinor,
        convertedMinor: convertedNet.amountMinor,
        rateNumerator: found.numerator,
        rateDenominator: found.denominator,
      });
    }

    const sell = applyMarkupBps(convertedNet, input.markupBps);
    rowsToInsert.push({
      agencyId: session.agencyId,
      itineraryId: row.id,
      itemId,
      port: supplyRef.port,
      offerId: supplyRef.externalId,
      supplierQuoteId: quote.quoteId,
      netMinor: quote.netRate.amountMinor,
      netCurrency: quote.netRate.currency,
      rateNumerator: rate?.numerator,
      rateDenominator: rate?.denominator,
      convertedNetMinor: convertedNet.amountMinor,
      markupBps: input.markupBps,
      sellMinor: sell.amountMinor,
      currency: row.document.currency,
      merchantOfRecord: quote.merchantOfRecord,
      expiresAt: new Date(quote.expiresAt),
    });
    outcomes.push({
      itemId,
      outcome: "held",
      quote: {
        quoteRowId: "", // filled from the insert below
        netMinor: quote.netRate.amountMinor,
        netCurrency: quote.netRate.currency,
        rate,
        sellMinor: sell.amountMinor,
        currency: row.document.currency,
        markupBps: input.markupBps,
        merchantOfRecord: quote.merchantOfRecord,
        expiresAt: quote.expiresAt,
      },
    });
  }

  if (rowsToInsert.length > 0) {
    const inserted = await db.insert(bookingQuoteTable).values(rowsToInsert).returning({
      id: bookingQuoteTable.id,
      itemId: bookingQuoteTable.itemId,
    });
    const idByItem = new Map(inserted.map((r) => [r.itemId, r.id]));
    for (const outcome of outcomes) {
      if (outcome.outcome === "held") {
        outcome.quote.quoteRowId = idByItem.get(outcome.itemId) ?? "";
      }
    }
  }

  return { status: "quoted", items: outcomes };
}

export async function bookItinerary(
  container: Container,
  session: AgentSessionContext,
  input: BookInput,
): Promise<{ status: "not_found" } | BookOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const row = await loadItinerary(container, session, input.itineraryId);
  if (!row) return { status: "not_found" };

  // Duplicate ids in one request must not double-consume a hold (FR-009):
  // dedupe preserving first-occurrence order; one outcome per unique row.
  const quoteRowIds = [...new Set(input.quoteRowIds)];

  const quoteRows = await db
    .select()
    .from(bookingQuoteTable)
    .where(
      scopedWhere(
        bookingQuoteTable.agencyId,
        session.agencyId,
        eq(bookingQuoteTable.itineraryId, row.id),
        inArray(bookingQuoteTable.id, quoteRowIds),
      ),
    );
  const rowById = new Map(quoteRows.map((r) => [r.id, r]));

  const outcomeById = new Map<string, BookComponentOutcome>();
  const now = Date.now();

  // Phase 1 — validate against the persisted rows (no writes, no supplier
  // calls). Survivors become claim candidates. Distinct holds targeting the
  // same item reduce to the first occurrence (FR-016 mirrors the FR-009
  // duplicate-id rule): later same-item holds fail item_already_booked.
  const candidates: (typeof quoteRows)[number][] = [];
  const itemsInRequest = new Set<string>();
  for (const quoteRowId of quoteRowIds) {
    const quoteRow = rowById.get(quoteRowId);
    if (!quoteRow) {
      outcomeById.set(quoteRowId, { quoteRowId, itemId: "", outcome: "failed", reason: "unknown_quote" });
      continue;
    }
    if (quoteRow.consumedAt !== null) {
      outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: "already_consumed" });
      continue;
    }
    // Server-side hold check (FR-009); the supplier re-enforces it on book.
    if (now >= quoteRow.expiresAt.getTime()) {
      outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: "quote_expired" });
      continue;
    }
    if (!portFor(container, quoteRow.port)) {
      outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: "unknown_quote" });
      continue;
    }
    if (itemsInRequest.has(quoteRow.itemId)) {
      outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: "item_already_booked" });
      continue;
    }
    itemsInRequest.add(quoteRow.itemId);
    candidates.push(quoteRow);
  }

  // Phase 2 — RESERVE before book (FR-009 + FR-016, research D12): one short
  // transaction decides BOTH races BEFORE any supplier call, so the losing
  // side of a concurrent booking never reaches the supplier. It locks every
  // hold of the candidate ITEMS (not just the candidate rows) in id order —
  // concurrent claimants that touch the same items serialize on the same
  // lock set, deadlock-free — then rejects a candidate whose own row was
  // meanwhile consumed (already_consumed) or whose item is already booked
  // through a consumed sibling hold or a recorded component
  // (item_already_booked), and atomically flips consumed_at for the winners.
  // Under READ COMMITTED a blocked claimant re-evaluates after the winner
  // commits and claims nothing.
  const claimedIds = new Set<string>();
  const itemBlockedIds = new Set<string>();
  if (candidates.length > 0) {
    const candidateItemIds = [...new Set(candidates.map((c) => c.itemId))];
    await db.transaction(async (tx) => {
      const siblings = await tx
        .select({
          id: bookingQuoteTable.id,
          itemId: bookingQuoteTable.itemId,
          consumedAt: bookingQuoteTable.consumedAt,
        })
        .from(bookingQuoteTable)
        .where(and(eq(bookingQuoteTable.itineraryId, row.id), inArray(bookingQuoteTable.itemId, candidateItemIds)))
        .orderBy(bookingQuoteTable.id)
        .for("update");
      const freshById = new Map(siblings.map((s) => [s.id, s.consumedAt]));
      // An item with a consumed sibling hold has a booking in flight or
      // recorded; existing components cover any state where the consumed
      // hold row itself is gone (FR-016 — the component is the record).
      const bookedItems = new Set(siblings.filter((s) => s.consumedAt !== null).map((s) => s.itemId));
      const componentRows = await tx
        .select({ itemId: bookingComponentTable.itemId })
        .from(bookingComponentTable)
        .where(
          and(eq(bookingComponentTable.itineraryId, row.id), inArray(bookingComponentTable.itemId, candidateItemIds)),
        );
      for (const r of componentRows) bookedItems.add(r.itemId);

      const winners: string[] = [];
      for (const candidate of candidates) {
        const fresh = freshById.get(candidate.id);
        if (fresh === undefined || fresh !== null) continue; // row gone or consumed meanwhile → already_consumed
        if (bookedItems.has(candidate.itemId)) {
          itemBlockedIds.add(candidate.id);
          continue;
        }
        bookedItems.add(candidate.itemId);
        winners.push(candidate.id);
      }
      if (winners.length === 0) return;
      await tx.update(bookingQuoteTable).set({ consumedAt: new Date() }).where(inArray(bookingQuoteTable.id, winners));
      for (const id of winners) claimedIds.add(id);
    });
  }
  for (const quoteRow of candidates) {
    if (!claimedIds.has(quoteRow.id)) {
      outcomeById.set(quoteRow.id, {
        quoteRowId: quoteRow.id,
        itemId: quoteRow.itemId,
        outcome: "failed",
        reason: itemBlockedIds.has(quoteRow.id) ? "item_already_booked" : "already_consumed",
      });
    }
  }

  // Phase 3 — book each CLAIMED hold at the supplier. A supplier failure
  // releases the claim, returning the hold to bookable exactly as if the
  // failure had preceded the claim (zero net state, FR-011).
  const confirmed: Array<{
    quoteRow: (typeof quoteRows)[number];
    supplierBookingId: string;
    supplierQuoteId: string;
  }> = [];
  // Supply re-registration for hold re-establishment is idempotent (research
  // D6) but not free — run it at most once per book invocation, lazily.
  let catalogRegistered = false;

  for (const quoteRow of candidates) {
    if (!claimedIds.has(quoteRow.id)) continue;
    const quoteRowId = quoteRow.id;
    const port = portFor(container, quoteRow.port);
    if (!port) continue; // unreachable — validated in phase 1
    let supplierQuoteId = quoteRow.supplierQuoteId;
    let booked = await port.book(supplierQuoteId);
    if (booked.status === "failed" && booked.reason === "unknown_quote") {
      // INV-028: the supplier no longer recognizes the hold (quote and book ran
      // in different processes, or the supplier GC'd it) while OUR persisted
      // hold is alive (unconsumed, unexpired — checked above). Re-establish it:
      // re-register supply state, take a fresh supplier quote for the same
      // offer, and book it ONLY if it still carries the exact held price.
      if (!catalogRegistered) {
        await verifiedSupplyCatalog(container, row.tripRequest);
        catalogRegistered = true;
      }
      const requoted = await port.quote(quoteRow.offerId);
      if (requoted.status === "quoted") {
        const fresh = requoted.quote;
        const priceUnchanged =
          fresh.netRate.amountMinor === quoteRow.netMinor &&
          fresh.netRate.currency === quoteRow.netCurrency &&
          fresh.merchantOfRecord === quoteRow.merchantOfRecord;
        if (!priceUnchanged) {
          // The held price is gone at the supplier — never book a different
          // price against an old hold (INV-006); the caller re-quotes.
          logger.warn("booking.book.hold_reestablish_price_mismatch", {
            agencyId: session.agencyId,
            itineraryId: row.id,
            quoteRowId,
            heldNetMinor: quoteRow.netMinor,
            heldNetCurrency: quoteRow.netCurrency,
            requotedNetMinor: fresh.netRate.amountMinor,
            requotedNetCurrency: fresh.netRate.currency,
          });
          await releaseClaims(db, [quoteRowId]);
          outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: "quote_expired" });
          continue;
        }
        logger.info("booking.book.hold_reestablished", {
          agencyId: session.agencyId,
          itineraryId: row.id,
          quoteRowId,
          supplierQuoteId: quoteRow.supplierQuoteId,
          reestablishedQuoteId: fresh.quoteId,
        });
        supplierQuoteId = fresh.quoteId;
        booked = await port.book(supplierQuoteId);
      }
    }
    if (booked.status === "failed") {
      await releaseClaims(db, [quoteRowId]);
      outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: booked.reason });
      continue;
    }
    confirmed.push({ quoteRow, supplierBookingId: booked.booking.bookingId, supplierQuoteId });
    outcomeById.set(quoteRowId, {
      quoteRowId,
      itemId: quoteRow.itemId,
      outcome: "confirmed",
      supplierBookingId: booked.booking.bookingId,
      netMinor: quoteRow.netMinor,
      netCurrency: quoteRow.netCurrency,
      sellMinor: quoteRow.sellMinor,
      currency: quoteRow.currency,
      merchantOfRecord: quoteRow.merchantOfRecord,
    });
  }

  const components = quoteRowIds.flatMap((id) => {
    const outcome = outcomeById.get(id);
    return outcome ? [outcome] : [];
  });

  // All-fail conservation (FR-011): claims released above, zero writes anywhere.
  if (confirmed.length === 0) {
    return { status: "failed", components };
  }

  // Phase 4 — record the money. The claims are already won, so this
  // transaction only writes rows; the UNIQUE constraint on
  // booking_component.quote_row_id stays as the write-time backstop.
  let txResult: { bookingId: string; status: "confirmed" | "partially_confirmed" };
  try {
    txResult = await db.transaction(async (tx) => {
      const status = confirmed.length === quoteRowIds.length ? ("confirmed" as const) : ("partially_confirmed" as const);
      const [bookingRow] = await tx
        .insert(bookingTable)
        .values({ agencyId: session.agencyId, itineraryId: row.id, status })
        .returning({ id: bookingTable.id });
      if (!bookingRow) {
        throw new Error("booking insert returned no row");
      }
      for (const { quoteRow, supplierBookingId, supplierQuoteId } of confirmed) {
        if (supplierQuoteId !== quoteRow.supplierQuoteId) {
          // Persist the re-established supplier quote actually booked (D11).
          await tx
            .update(bookingQuoteTable)
            .set({ supplierQuoteId })
            .where(eq(bookingQuoteTable.id, quoteRow.id));
        }
        const [component] = await tx
          .insert(bookingComponentTable)
          .values({
            bookingId: bookingRow.id,
            agencyId: session.agencyId,
            itineraryId: row.id,
            itemId: quoteRow.itemId,
            port: quoteRow.port,
            offerId: quoteRow.offerId,
            quoteRowId: quoteRow.id,
            supplierBookingId,
            netMinor: quoteRow.netMinor,
            netCurrency: quoteRow.netCurrency,
            rateNumerator: quoteRow.rateNumerator,
            rateDenominator: quoteRow.rateDenominator,
            sellMinor: quoteRow.sellMinor,
            currency: quoteRow.currency,
            merchantOfRecord: quoteRow.merchantOfRecord,
          })
          .returning({ id: bookingComponentTable.id });
        if (!component) {
          throw new Error("booking component insert returned no row");
        }
        // Ledger identity: markup = sell − net exactly (Money-Safe, SC-005),
        // computed by pure domain math (INV-010).
        const markup = markupOf(
          money(quoteRow.sellMinor, quoteRow.currency),
          money(quoteRow.convertedNetMinor, quoteRow.currency),
        );
        await tx.insert(markupLedgerTable).values({
          agencyId: session.agencyId,
          bookingComponentId: component.id,
          netMinor: quoteRow.convertedNetMinor,
          sellMinor: quoteRow.sellMinor,
          markupMinor: markup.amountMinor,
          currency: quoteRow.currency,
        });
        await recordPmfEvent(tx, {
          type: "booking_confirmed",
          agencyId: session.agencyId,
          itineraryId: row.id,
          amountMinor: quoteRow.sellMinor,
          currency: quoteRow.currency,
          actorUserId: session.userId,
        });
      }
      return { bookingId: bookingRow.id, status };
    });
  } catch (err) {
    // COMPENSATE (FR-011/INV-011, research D12): the money rows did not
    // commit, so no supplier booking may survive unrecorded — cancel every
    // component just booked and release its claim, then surface the fault.
    // Cancel/release failures are logged loudly for reconciliation.
    for (const c of confirmed) {
      try {
        const cancelled = await portFor(container, c.quoteRow.port)?.cancel(c.supplierBookingId);
        logger.error("booking.book.recording_failed_supplier_cancelled", {
          agencyId: session.agencyId,
          itineraryId: row.id,
          quoteRowId: c.quoteRow.id,
          supplierBookingId: c.supplierBookingId,
          cancelStatus: cancelled?.status ?? "no_port",
        });
      } catch (cancelErr) {
        logger.error("booking.book.compensation_cancel_failed", {
          agencyId: session.agencyId,
          itineraryId: row.id,
          quoteRowId: c.quoteRow.id,
          supplierBookingId: c.supplierBookingId,
          error: String(cancelErr),
        });
      }
    }
    try {
      await releaseClaims(
        db,
        confirmed.map((c) => c.quoteRow.id),
      );
    } catch (releaseErr) {
      logger.error("booking.book.compensation_release_failed", {
        agencyId: session.agencyId,
        itineraryId: row.id,
        quoteRowIds: confirmed.map((c) => c.quoteRow.id),
        error: String(releaseErr),
      });
    }
    throw err;
  }
  return { status: txResult.status, bookingId: txResult.bookingId, components };
}

/** Release claimed-but-unbooked holds: `consumed_at` back to NULL, returning
 * them to bookable. Only ever called on rows this request claimed, so no
 * concurrent booking can hold them (research D12). */
async function releaseClaims(db: NonNullable<Container["db"]>, quoteRowIds: string[]): Promise<void> {
  if (quoteRowIds.length === 0) return;
  await db.update(bookingQuoteTable).set({ consumedAt: null }).where(inArray(bookingQuoteTable.id, quoteRowIds));
}

export async function itineraryOverview(
  container: Container,
  session: AgentSessionContext,
  itineraryId: string,
): Promise<
  | { status: "not_found" }
  | {
      status: "found";
      itinerary: Itinerary;
      tripRequest: TripRequest;
      quotes: Array<{
        quoteRowId: string;
        itemId: string;
        sellMinor: number;
        currency: string;
        expiresAt: string;
        consumed: boolean;
      }>;
      bookings: Array<{ bookingId: string; status: string; createdAt: string }>;
    }
> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const row = await loadItinerary(container, session, itineraryId);
  if (!row) return { status: "not_found" };
  const quotes = await db
    .select()
    .from(bookingQuoteTable)
    .where(scopedWhere(bookingQuoteTable.agencyId, session.agencyId, eq(bookingQuoteTable.itineraryId, row.id)));
  const bookings = await db
    .select()
    .from(bookingTable)
    .where(scopedWhere(bookingTable.agencyId, session.agencyId, eq(bookingTable.itineraryId, row.id)));
  // Expired unconsumed rows are never served — expiry can only trigger a
  // re-quote (spec 005 quote lifecycle; contract §2: active + consumed only).
  const now = Date.now();
  return {
    status: "found",
    itinerary: row.document,
    tripRequest: row.tripRequest,
    quotes: quotes
      .filter((q) => q.consumedAt !== null || now < q.expiresAt.getTime())
      .map((q) => ({
        quoteRowId: q.id,
        itemId: q.itemId,
        sellMinor: q.sellMinor,
        currency: q.currency,
        expiresAt: q.expiresAt.toISOString(),
        consumed: q.consumedAt !== null,
      })),
    bookings: bookings.map((b) => ({ bookingId: b.id, status: b.status, createdAt: b.createdAt.toISOString() })),
  };
}
