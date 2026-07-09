// Listing flows (spec 006 US1; contracts §1–3). createListing stamps the
// seller's declared terms into the SOURCE itinerary's provenance inside the
// same transaction that creates the listing (research D8) — INV-002's
// "marketplace-listed itineraries carry mandatory provenance" is made true of
// the listed original, not just future copies. Business refusals are typed
// VALUES; the router maps not_found to a TRPCError (booking precedent).
import { stampProvenance } from "@tripforge/domain";
import { ListedItinerarySchema, parseItinerary } from "@tripforge/itinerary-schema";
import {
  and,
  eq,
  itinerary as itineraryTable,
  marketplaceListing,
  organization,
  recordPmfEvent,
  scopedWhere,
  type Db,
} from "@tripforge/db";
import { z } from "zod";
import { isVetted } from "./vetting.js";
import { isUniqueViolation } from "./pg-errors.js";
import { ratingAggregates } from "./ratings.js";
import type { MarketplaceActor } from "./types.js";

export const createListingInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  title: z.string().min(1).max(200),
  /** License fee in integer minor units of the itinerary's currency (INV-009). */
  priceMinor: z.number().int().min(0),
  licenseTerms: z.string().min(1).max(2000),
  revenueShareBps: z.number().int().min(0).max(10_000),
});
export type CreateListingInput = z.infer<typeof createListingInputSchema>;

export type CreateListingOutcome =
  | { status: "listed"; listingId: string; itineraryId: string }
  | { status: "not_found" }
  | { status: "not_vetted" }
  | { status: "already_listed"; listingId: string }
  | { status: "provenance_incomplete"; issues: string[] };

export async function createListing(
  db: Db,
  actor: MarketplaceActor,
  input: CreateListingInput,
): Promise<CreateListingOutcome> {
  if (!(await isVetted(db, actor.agencyId))) {
    return { status: "not_vetted" };
  }
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(itineraryTable)
        .where(scopedWhere(itineraryTable.agencyId, actor.agencyId, eq(itineraryTable.id, input.itineraryId)))
        .limit(1);
      const row = rows[0];
      if (!row) return { status: "not_found" } as const;

      const existing = await tx
        .select({ id: marketplaceListing.id })
        .from(marketplaceListing)
        .where(and(eq(marketplaceListing.itineraryId, row.id), eq(marketplaceListing.status, "active")))
        .limit(1);
      if (existing[0]) return { status: "already_listed", listingId: existing[0].id } as const;

      // Stamp the declared terms into the source document (INV-002), then
      // gate on the listed-itinerary refinement (FR-004) — the mechanical
      // guarantee that nothing incomplete ever reaches the marketplace.
      const document = parseItinerary(row.document);
      const stamped = stampProvenance(document, actor.agencyId, {
        licenseTerms: input.licenseTerms,
        revenueShareBps: input.revenueShareBps,
      });
      const listed = ListedItinerarySchema.safeParse(stamped);
      if (!listed.success) {
        return {
          status: "provenance_incomplete",
          issues: listed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        } as const;
      }

      await tx
        .update(itineraryTable)
        .set({ document: listed.data, updatedAt: new Date() })
        .where(eq(itineraryTable.id, row.id));

      const inserted = await tx
        .insert(marketplaceListing)
        .values({
          sellerAgencyId: actor.agencyId,
          itineraryId: row.id,
          title: input.title,
          priceMinor: input.priceMinor,
          currency: document.currency,
          licenseTerms: input.licenseTerms,
          revenueShareBps: input.revenueShareBps,
          status: "active",
        })
        .returning({ id: marketplaceListing.id });
      const listing = inserted[0];
      if (!listing) throw new Error("listing insert returned no row");

      await recordPmfEvent(tx, {
        type: "listing_created",
        agencyId: actor.agencyId,
        itineraryId: row.id,
        actorUserId: actor.userId,
      });

      return { status: "listed", listingId: listing.id, itineraryId: row.id } as const;
    });
  } catch (err) {
    // Creation race on the partial unique active-listing index (D9): the
    // loser's transaction rolled back whole; report the winner's listing.
    if (isUniqueViolation(err)) {
      const winner = await db
        .select({ id: marketplaceListing.id })
        .from(marketplaceListing)
        .where(and(eq(marketplaceListing.itineraryId, input.itineraryId), eq(marketplaceListing.status, "active")))
        .limit(1);
      if (winner[0]) return { status: "already_listed", listingId: winner[0].id };
    }
    throw err;
  }
}

export interface BrowseListing {
  listingId: string;
  title: string;
  priceMinor: number;
  currency: string;
  licenseTerms: string;
  revenueShareBps: number;
  sellerAgencyId: string;
  sellerAgencyName: string;
  ratingAverage: number | null;
  ratingCount: number;
  mine: boolean;
}

/**
 * The one deliberate cross-tenant read (research D7): active listings only,
 * projected to the seller-published public fields — no client data, no trip
 * request, no non-listed itinerary content.
 */
export async function browseListings(db: Db, actor: MarketplaceActor): Promise<{ listings: BrowseListing[] }> {
  const rows = await db
    .select({
      listingId: marketplaceListing.id,
      title: marketplaceListing.title,
      priceMinor: marketplaceListing.priceMinor,
      currency: marketplaceListing.currency,
      licenseTerms: marketplaceListing.licenseTerms,
      revenueShareBps: marketplaceListing.revenueShareBps,
      sellerAgencyId: marketplaceListing.sellerAgencyId,
      sellerAgencyName: organization.name,
    })
    .from(marketplaceListing)
    .innerJoin(organization, eq(marketplaceListing.sellerAgencyId, organization.id))
    .where(eq(marketplaceListing.status, "active"));

  const aggregates = await ratingAggregates(
    db,
    rows.map((r) => r.listingId),
  );
  return {
    listings: rows.map((r) => {
      const agg = aggregates.get(r.listingId);
      return {
        ...r,
        ratingAverage: agg?.average ?? null,
        ratingCount: agg?.count ?? 0,
        mine: r.sellerAgencyId === actor.agencyId,
      };
    }),
  };
}

export const deactivateListingInputSchema = z.strictObject({
  listingId: z.uuid(),
});
export type DeactivateListingInput = z.infer<typeof deactivateListingInputSchema>;

export type DeactivateListingOutcome =
  | { status: "deactivated"; listingId: string }
  | { status: "already_inactive"; listingId: string }
  | { status: "not_found" };

export async function deactivateListing(
  db: Db,
  actor: MarketplaceActor,
  input: DeactivateListingInput,
): Promise<DeactivateListingOutcome> {
  return db.transaction(async (tx) => {
    // FOR UPDATE serializes against a concurrent licenseListing (research D8):
    // exactly one of the two outcomes wins the row.
    const rows = await tx
      .select({ id: marketplaceListing.id, status: marketplaceListing.status })
      .from(marketplaceListing)
      .where(
        scopedWhere(marketplaceListing.sellerAgencyId, actor.agencyId, eq(marketplaceListing.id, input.listingId)),
      )
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row) return { status: "not_found" } as const;
    if (row.status !== "active") return { status: "already_inactive", listingId: row.id } as const;
    await tx
      .update(marketplaceListing)
      .set({ status: "inactive", deactivatedAt: new Date() })
      .where(eq(marketplaceListing.id, row.id));
    return { status: "deactivated", listingId: row.id } as const;
  });
}
