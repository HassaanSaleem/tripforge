// Trip overview (spec 005 contract §2): the opened-trip read combining the
// canonical document with its live quote holds and booking history.
import type { Itinerary } from "@tripforge/itinerary-schema";
import { money, MoneyError, type Money } from "@tripforge/domain";
import {
  eq,
  booking as bookingTable,
  bookingComponent as bookingComponentTable,
  bookingQuote as bookingQuoteTable,
  scopedWhere,
} from "@tripforge/db";
import type { AgentSessionContext, Container } from "../../context.js";
import { isItineraryValidationError, summarizeItineraryValidationError } from "../itinerary-read-guard.js";
import type { TripRequest } from "../planner.js";
import { logger, loadItinerary, type ItineraryRow } from "./shared.js";

/**
 * Agent-facing counterpart to client-view's `toClientItineraryView` (spec 013):
 * the document's `pricing.sellPrice`/`day.subtotal` are the draft-time
 * placeholder (netRate == sellPrice, assemble.ts FR-007) and are never
 * rewritten at book time, so the reopened workspace view stays net-priced
 * forever unless the booked component sell is projected in here too (seed-0026,
 * same root cause as seed-0025). netRate is left untouched — the agent's own
 * cost basis is not confidential to the agent. Read-only: the document itself
 * is never modified.
 */
function withBookedSellPrices(document: Itinerary, bookedPriceByItemId: ReadonlyMap<string, Money>): Itinerary {
  if (bookedPriceByItemId.size === 0) return document;
  return {
    ...document,
    days: document.days.map((day) => {
      const items = day.items.map((item) => {
        const bookedPrice = bookedPriceByItemId.get(item.id);
        if (!bookedPrice || !item.pricing) return item;
        if (bookedPrice.currency !== document.currency) {
          // Tripwire (mirrors client-view.ts D3): quote-time recording
          // guarantees the component currency equals the itinerary
          // currency, so a mismatch is data corruption — fail loudly.
          throw new MoneyError(
            `booked component currency ${bookedPrice.currency} does not match itinerary currency ${document.currency}`,
          );
        }
        return { ...item, pricing: { ...item.pricing, sellPrice: bookedPrice } };
      });
      const subtotalMinor = items.reduce((acc, it) => acc + (it.pricing?.sellPrice.amountMinor ?? 0), 0);
      return {
        ...day,
        items,
        ...(day.subtotal ? { subtotal: { amountMinor: subtotalMinor, currency: day.subtotal.currency } } : {}),
      };
    }),
  };
}

export async function itineraryOverview(
  container: Container,
  session: AgentSessionContext,
  itineraryId: string,
): Promise<
  | { status: "not_found" }
  | { status: "invalid"; itineraryId: string; diagnostic: string }
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
      /** The markup rate of the most recently booked generation (the
       * consumed quote row with the latest consumedAt), or null when the
       * trip has no booked components yet (seed-0028: reopening a
       * partially-booked trip should reflect what was ALREADY booked, not
       * silently reset to the form's 15% default). */
      latestBookedMarkupBps: number | null;
      /** Canonical item ids with a confirmed booking_component (seed-0027):
       * the same key set `withBookedSellPrices` already derives, surfaced so
       * the workspace view can mark each booked item and count a
       * booked/remaining summary without inferring booking state from the
       * document's pricing (which un-booked items also carry). */
      bookedItemIds: string[];
    }
> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  // Tenant ownership is confirmed inside loadItinerary before parseItinerary
  // runs, so a validation failure here means the CALLER'S OWN document fails
  // current-schema re-validation (spec 010 seed-0021) — safe to diagnose back
  // to them, unlike the anonymous share-link path (client-view.ts), which
  // must reveal nothing.
  let row: ItineraryRow | undefined;
  try {
    row = await loadItinerary(container, session, itineraryId);
  } catch (err) {
    if (!isItineraryValidationError(err)) throw err;
    logger.warn("booking.overview.itinerary_invalid", {
      agencyId: session.agencyId,
      itineraryId,
      issue: summarizeItineraryValidationError(err),
    });
    return {
      status: "invalid",
      itineraryId,
      diagnostic: "This trip's stored document no longer matches the current schema and can't be opened.",
    };
  }
  if (!row) return { status: "not_found" };
  const quotes = await db
    .select()
    .from(bookingQuoteTable)
    .where(scopedWhere(bookingQuoteTable.agencyId, session.agencyId, eq(bookingQuoteTable.itineraryId, row.id)));
  const bookings = await db
    .select()
    .from(bookingTable)
    .where(scopedWhere(bookingTable.agencyId, session.agencyId, eq(bookingTable.itineraryId, row.id)));
  // Booked items are priced from the booking record, same source-of-truth as
  // the client view (spec 013/seed-0025) — the document's stored sellPrice is
  // only ever the draft-time placeholder (assemble.ts).
  const components = await db
    .select({
      itemId: bookingComponentTable.itemId,
      sellMinor: bookingComponentTable.sellMinor,
      currency: bookingComponentTable.currency,
    })
    .from(bookingComponentTable)
    .where(scopedWhere(bookingComponentTable.agencyId, session.agencyId, eq(bookingComponentTable.itineraryId, row.id)));
  const bookedPriceByItemId = new Map(components.map((c) => [c.itemId, money(c.sellMinor, c.currency)]));
  // Expired unconsumed rows are never served — expiry can only trigger a
  // re-quote (spec 005 quote lifecycle; contract §2: active + consumed only).
  const now = Date.now();
  const consumedRows = quotes.filter((q) => q.consumedAt !== null);
  const latestConsumed = consumedRows.reduce<(typeof consumedRows)[number] | null>(
    (latest, row) => (latest === null || row.consumedAt! > latest.consumedAt! ? row : latest),
    null,
  );
  return {
    status: "found",
    itinerary: withBookedSellPrices(row.document, bookedPriceByItemId),
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
    latestBookedMarkupBps: latestConsumed?.markupBps ?? null,
    bookedItemIds: [...bookedPriceByItemId.keys()],
  };
}
