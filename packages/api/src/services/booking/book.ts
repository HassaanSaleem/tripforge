// BOOK flow (spec 005 US3; contract §4): validate holds server-side (tenant,
// unconsumed, unexpired — the port re-enforces expiry independently), then
// RESERVE-THEN-BOOK (research D12): one short transaction claims every
// still-unconsumed hold (id-ordered locking read + atomic consumed_at flip)
// BEFORE any supplier call, so the losing side of a concurrent race never
// reaches the supplier. The same transaction enforces ITEM-level exclusivity
// (FR-016, spec-gap-0002): an item with a consumed sibling hold or a recorded
// booking component is already booked, and booking any other hold for it
// fails typed item_already_booked — backstopped by UNIQUE (itinerary_id,
// item_id) on booking_component. Claimed holds book per component —
// re-establishing the supplier hold when the supplier no longer recognizes it
// (INV-028: quote and book may run in different processes; the persisted row
// is the truth and the re-quoted price must match it exactly) — and a
// supplier failure RELEASES the claim. ONE recording transaction then writes
// booking + reservation + ledger + PMF events for the booked components; if
// it fails after supplier bookings were made, each one is compensated with
// port.cancel and the claims are released — no supplier booking survives
// unrecorded (FR-011/INV-011 conservation). A booking where every component
// fails writes NOTHING.
import { markupOf, money } from "@tripforge/domain";
import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  booking as bookingTable,
  bookingComponent as bookingComponentTable,
  bookingQuote as bookingQuoteTable,
  markupLedger as markupLedgerTable,
  recordPmfEvent,
  scopedWhere,
} from "@tripforge/db";
import { z } from "zod";
import type { Container } from "../../context.js";
import { verifiedSupplyCatalog } from "../planner.js";
import { logger, loadItinerary, portFor } from "./shared.js";
import type { BookingActor } from "./actor.js";
import { lockQuoteRowsInClaimOrder, releaseClaims } from "./claims.js";

export const bookInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  quoteRowIds: z.array(z.uuid()).min(1),
});
type BookInput = z.infer<typeof bookInputSchema>;

type BookComponentOutcome =
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

export async function bookItinerary(
  container: Container,
  actor: BookingActor,
  input: BookInput,
): Promise<{ status: "not_found" } | BookOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const row = await loadItinerary(container, actor, input.itineraryId);
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
        actor.agencyId,
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
  const expiredIds = new Set<string>();
  if (candidates.length > 0) {
    const candidateItemIds = [...new Set(candidates.map((c) => c.itemId))];
    await db.transaction(async (tx) => {
      const siblings = await tx
        .select({
          id: bookingQuoteTable.id,
          itemId: bookingQuoteTable.itemId,
          consumedAt: bookingQuoteTable.consumedAt,
          expiresAt: bookingQuoteTable.expiresAt,
        })
        .from(bookingQuoteTable)
        .where(and(eq(bookingQuoteTable.itineraryId, row.id), inArray(bookingQuoteTable.itemId, candidateItemIds)))
        .orderBy(bookingQuoteTable.id)
        .for("update");
      const freshById = new Map(siblings.map((s) => [s.id, s.consumedAt]));
      const expiryById = new Map(siblings.map((s) => [s.id, s.expiresAt]));
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

      // FR-009 expiry is atomic WITH the claim (seed-0005e): the Phase-1
      // check used an earlier clock — a hold that crossed expires_at while
      // waiting on the lock set must never be claimed or booked.
      const claimNow = new Date();
      const winners: string[] = [];
      for (const candidate of candidates) {
        const fresh = freshById.get(candidate.id);
        if (fresh === undefined || fresh !== null) continue; // row gone or consumed meanwhile → already_consumed
        const expiresAt = expiryById.get(candidate.id);
        if (expiresAt === undefined || claimNow.getTime() >= expiresAt.getTime()) {
          expiredIds.add(candidate.id);
          continue;
        }
        if (bookedItems.has(candidate.itemId)) {
          itemBlockedIds.add(candidate.id);
          continue;
        }
        bookedItems.add(candidate.itemId);
        winners.push(candidate.id);
      }
      if (winners.length === 0) return;
      // Belt-and-braces: the UPDATE itself re-asserts unconsumed AND
      // unexpired, so an expired hold cannot be claimed even if the
      // in-memory reasoning above ever drifts from the row state.
      const returned = await tx
        .update(bookingQuoteTable)
        .set({ consumedAt: claimNow })
        .where(
          and(
            inArray(bookingQuoteTable.id, winners),
            isNull(bookingQuoteTable.consumedAt),
            gt(bookingQuoteTable.expiresAt, claimNow),
          ),
        )
        .returning({ id: bookingQuoteTable.id });
      for (const r of returned) claimedIds.add(r.id);
      for (const id of winners) {
        if (!claimedIds.has(id)) expiredIds.add(id); // rows are locked, so a refused winner can only be expiry
      }
    });
  }
  for (const quoteRow of candidates) {
    if (!claimedIds.has(quoteRow.id)) {
      outcomeById.set(quoteRow.id, {
        quoteRowId: quoteRow.id,
        itemId: quoteRow.itemId,
        outcome: "failed",
        reason: expiredIds.has(quoteRow.id)
          ? "quote_expired"
          : itemBlockedIds.has(quoteRow.id)
            ? "item_already_booked"
            : "already_consumed",
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
      // FR-009 (seed-0005e): the claim happened earlier on another clock —
      // never re-quote/book a hold whose PERSISTED expiry has since passed.
      // Re-read the row (not the Phase-1 snapshot): the persisted value is
      // the truth an expired hold must be judged against.
      const freshExpiryRows = await db
        .select({ expiresAt: bookingQuoteTable.expiresAt })
        .from(bookingQuoteTable)
        .where(eq(bookingQuoteTable.id, quoteRowId))
        .limit(1);
      const freshExpiry = freshExpiryRows[0]?.expiresAt;
      if (freshExpiry === undefined || Date.now() >= freshExpiry.getTime()) {
        await releaseClaims(db, [quoteRowId]);
        outcomeById.set(quoteRowId, { quoteRowId, itemId: quoteRow.itemId, outcome: "failed", reason: "quote_expired" });
        continue;
      }
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
            agencyId: actor.agencyId,
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
          agencyId: actor.agencyId,
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
      // Claim-order discipline (seed-0015): every booking_quote row this tx
      // will touch — FK KEY SHARE from each component insert, plus the
      // re-established supplier_quote_id updates — is locked up front in
      // claim order, so the per-component writes below (request order) can
      // never interleave into a lock cycle with a concurrent claim gate.
      await lockQuoteRowsInClaimOrder(
        tx,
        confirmed.map((c) => c.quoteRow.id),
      );
      const status = confirmed.length === quoteRowIds.length ? ("confirmed" as const) : ("partially_confirmed" as const);
      const [bookingRow] = await tx
        .insert(bookingTable)
        .values({ agencyId: actor.agencyId, itineraryId: row.id, status })
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
            agencyId: actor.agencyId,
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
          agencyId: actor.agencyId,
          bookingComponentId: component.id,
          netMinor: quoteRow.convertedNetMinor,
          sellMinor: quoteRow.sellMinor,
          markupMinor: markup.amountMinor,
          currency: quoteRow.currency,
        });
        await recordPmfEvent(tx, {
          type: "booking_confirmed",
          agencyId: actor.agencyId,
          itineraryId: row.id,
          amountMinor: quoteRow.sellMinor,
          currency: quoteRow.currency,
          actorUserId: actor.userId,
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
          agencyId: actor.agencyId,
          itineraryId: row.id,
          quoteRowId: c.quoteRow.id,
          supplierBookingId: c.supplierBookingId,
          cancelStatus: cancelled?.status ?? "no_port",
        });
      } catch (cancelErr) {
        logger.error("booking.book.compensation_cancel_failed", {
          agencyId: actor.agencyId,
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
        agencyId: actor.agencyId,
        itineraryId: row.id,
        quoteRowIds: confirmed.map((c) => c.quoteRow.id),
        error: String(releaseErr),
      });
    }
    throw err;
  }
  return { status: txResult.status, bookingId: txResult.bookingId, components };
}
