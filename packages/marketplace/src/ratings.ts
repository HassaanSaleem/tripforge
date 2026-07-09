// Licensee-only ratings (spec 006 US3; contracts §5): trust enforced
// mechanically — the license row IS the permission to rate (FR-013). One
// rating per (listing, rater agency); re-rating upserts on that key so the
// count never inflates. The aggregate helper is shared with browse.
import {
  and,
  avg,
  count,
  eq,
  inArray,
  listingRating,
  marketplaceLicense,
  marketplaceListing,
  recordPmfEvent,
  type Db,
} from "@tripforge/db";
import { z } from "zod";
import type { DbTx, MarketplaceActor } from "./types.js";

export const rateListingInputSchema = z.strictObject({
  listingId: z.uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type RateListingInput = z.infer<typeof rateListingInputSchema>;

export type RateListingOutcome =
  | { status: "rated"; listingId: string; stars: number; ratingAverage: number; ratingCount: number }
  | { status: "not_found" }
  | { status: "not_licensee" };

export interface RatingAggregate {
  average: number;
  count: number;
}

/** Per-listing average (1 d.p.) + count; listings without ratings are absent. */
export async function ratingAggregates(db: Db | DbTx, listingIds: string[]): Promise<Map<string, RatingAggregate>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db
    .select({
      listingId: listingRating.listingId,
      average: avg(listingRating.stars),
      ratings: count(),
    })
    .from(listingRating)
    .where(inArray(listingRating.listingId, listingIds))
    .groupBy(listingRating.listingId);
  return new Map(
    rows.flatMap((r) =>
      r.average === null ? [] : [[r.listingId, { average: Math.round(Number(r.average) * 10) / 10, count: r.ratings }] as const],
    ),
  );
}

export async function rateListing(
  db: Db,
  actor: MarketplaceActor,
  input: RateListingInput,
): Promise<RateListingOutcome> {
  return db.transaction(async (tx) => {
    // Rating survives deactivation (the license relationship persists), so
    // the listing is loaded by id without a status filter.
    const listings = await tx
      .select({ id: marketplaceListing.id, itineraryId: marketplaceListing.itineraryId })
      .from(marketplaceListing)
      .where(eq(marketplaceListing.id, input.listingId))
      .limit(1);
    const listing = listings[0];
    if (!listing) return { status: "not_found" } as const;

    const licenses = await tx
      .select({ id: marketplaceLicense.id })
      .from(marketplaceLicense)
      .where(
        and(eq(marketplaceLicense.listingId, listing.id), eq(marketplaceLicense.resellerAgencyId, actor.agencyId)),
      )
      .limit(1);
    if (!licenses[0]) return { status: "not_licensee" } as const;

    await tx
      .insert(listingRating)
      .values({
        listingId: listing.id,
        raterAgencyId: actor.agencyId,
        stars: input.stars,
        comment: input.comment,
      })
      .onConflictDoUpdate({
        target: [listingRating.listingId, listingRating.raterAgencyId],
        set: { stars: input.stars, comment: input.comment ?? null, updatedAt: new Date() },
      });

    await recordPmfEvent(tx, {
      type: "listing_rated",
      agencyId: actor.agencyId,
      itineraryId: listing.itineraryId,
      actorUserId: actor.userId,
    });

    const aggregate = (await ratingAggregates(tx, [listing.id])).get(listing.id);
    return {
      status: "rated",
      listingId: listing.id,
      stars: input.stars,
      ratingAverage: aggregate?.average ?? input.stars,
      ratingCount: aggregate?.count ?? 1,
    } as const;
  });
}
