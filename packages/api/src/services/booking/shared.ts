// Shared quote/book/overview plumbing (QS3-5, quality-sweep-iter-3.md finding
// 5): tenant-scoped itinerary loading and supply-port lookup, used by every
// booking submodule. Split out of the former monolithic services/booking.ts
// (531 lines at filing, 788 by the time this landed — well past the 400-line
// threshold).
import { parseItinerary, type Itinerary } from "@tripforge/itinerary-schema";
import { eq, itinerary as itineraryTable, scopedWhere } from "@tripforge/db";
import type { SupplyPort, OfferBase, QuoteBase } from "@tripforge/supply-adapter";
import { createLogger } from "@tripforge/shared";
import type { AgentSessionContext, Container } from "../../context.js";
import type { TripRequest } from "../planner.js";

export const logger = createLogger({ bindings: { component: "booking" } });

export type AnySupplyPort = SupplyPort<unknown, OfferBase, QuoteBase>;

export function portFor(container: Container, port: string): AnySupplyPort | undefined {
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

export interface ItineraryRow {
  id: string;
  agencyId: string;
  document: Itinerary;
  tripRequest: TripRequest;
}

export async function loadItinerary(
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
