// Tenant-scoped itinerary reads (spec 011 contract §2). The marketplace
// listing form's picker projection — id/title/currency only; canonical
// documents stay behind itineraryOverview. Deliberately NOT in
// services/booking.ts (research D3): that module is past the split threshold
// with an open quality-sweep ticket.
import { and, desc, eq, itinerary as itineraryTable, marketplaceListing, scopedWhere, type Db } from "@tripforge/db";
import type { AgentSessionContext, Container } from "../context.js";

export interface MyItineraryListing {
  listingId: string;
  priceMinor: number;
  currency: string;
}

export interface MyItinerary {
  id: string;
  title: string;
  currency: string;
  createdAt: string;
  /** Active marketplace listing for this trip, if any (spec 014 US2). */
  listing: MyItineraryListing | null;
}

/**
 * The caller agency's own itineraries, newest first. Every row is pinned to
 * the session's tenant (INV-004) — cross-tenant rows are unreachable by
 * construction, witnessed by the L3 suite. LEFT JOINs the itinerary's own
 * active listing (research D4) — the partial unique active-listing index
 * (marketplace_listing_active_itinerary_idx) guarantees at most one match per
 * itinerary, so the join cannot multiply rows.
 */
export async function listItineraries(
  container: Container,
  session: AgentSessionContext,
): Promise<{ itineraries: MyItinerary[] }> {
  const db: Db | undefined = container.db;
  if (!db) throw new Error("database not configured");
  const rows = await db
    .select({
      id: itineraryTable.id,
      title: itineraryTable.title,
      currency: itineraryTable.currency,
      createdAt: itineraryTable.createdAt,
      listingId: marketplaceListing.id,
      listingPriceMinor: marketplaceListing.priceMinor,
      listingCurrency: marketplaceListing.currency,
    })
    .from(itineraryTable)
    .leftJoin(
      marketplaceListing,
      and(eq(marketplaceListing.itineraryId, itineraryTable.id), eq(marketplaceListing.status, "active")),
    )
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId))
    .orderBy(desc(itineraryTable.createdAt));
  return {
    itineraries: rows.map((row) => ({
      id: row.id,
      title: row.title,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      listing:
        row.listingId === null
          ? null
          : {
              listingId: row.listingId,
              priceMinor: row.listingPriceMinor as number,
              currency: row.listingCurrency as string,
            },
    })),
  };
}
