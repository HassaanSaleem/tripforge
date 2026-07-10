// Tenant-scoped itinerary reads (spec 011 contract §2). The marketplace
// listing form's picker projection — id/title/currency only; canonical
// documents stay behind itineraryOverview. Deliberately NOT in
// services/booking.ts (research D3): that module is past the split threshold
// with an open quality-sweep ticket.
import { desc, itinerary as itineraryTable, scopedWhere, type Db } from "@tripforge/db";
import type { AgentSessionContext, Container } from "../context.js";

export interface MyItinerary {
  id: string;
  title: string;
  currency: string;
  createdAt: string;
}

/**
 * The caller agency's own itineraries, newest first. Every row is pinned to
 * the session's tenant (INV-004) — cross-tenant rows are unreachable by
 * construction, witnessed by the L3 suite.
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
    })
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId))
    .orderBy(desc(itineraryTable.createdAt));
  return {
    itineraries: rows.map((row) => ({
      id: row.id,
      title: row.title,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
