// Trip overview (spec 005 contract §2): the opened-trip read combining the
// canonical document with its live quote holds and booking history.
import type { Itinerary } from "@tripforge/itinerary-schema";
import { eq, booking as bookingTable, bookingQuote as bookingQuoteTable, scopedWhere } from "@tripforge/db";
import type { AgentSessionContext, Container } from "../../context.js";
import { isItineraryValidationError, summarizeItineraryValidationError } from "../itinerary-read-guard.js";
import type { TripRequest } from "../planner.js";
import { logger, loadItinerary, type ItineraryRow } from "./shared.js";

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
    latestBookedMarkupBps: latestConsumed?.markupBps ?? null,
  };
}
