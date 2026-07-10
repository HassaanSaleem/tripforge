// The trade-layer money path (spec 006 US2; contracts §4; research D8).
// ONE database transaction — INV-012 verbatim: a license cannot complete
// without its recorded split. Inside it: lock the listing (FOR UPDATE — the
// same serialization tool as deactivation and the booking claim gate), check
// active / vetted / not-self / not-already-licensed, insert the white-label
// copy (FK target first), the license, and the revenue-share ledger row whose
// split is computed by pure domain math (INV-010), then emit both PMF events
// (INV-021). ANY failure rolls the whole transaction back — no orphan license,
// ledger row, copy, or event can survive (FR-011/INV-011); the concurrent
// duplicate race is decided by UNIQUE (listing_id, reseller_agency_id).
import { randomUUID } from "node:crypto";
import { money, splitTakeRate } from "@tripforge/domain";
import { parseItinerary } from "@tripforge/itinerary-schema";
import {
  and,
  eq,
  itinerary as itineraryTable,
  marketplaceLicense,
  marketplaceListing,
  recordPmfEvent,
  revenueShareLedger,
  type Db,
} from "@tripforge/db";
import { z } from "zod";
import { DEFAULT_PLATFORM_TAKE_RATE_BPS } from "./config.js";
import { isUniqueViolation } from "./pg-errors.js";
import { isVetted } from "./vetting.js";
import { whiteLabelCopy } from "./white-label.js";
import type { MarketplaceActor } from "./types.js";

export const licenseListingInputSchema = z.strictObject({
  listingId: z.uuid(),
});
export type LicenseListingInput = z.infer<typeof licenseListingInputSchema>;

export type LicenseListingOutcome =
  | {
      status: "licensed";
      licenseId: string;
      copyItineraryId: string;
      priceMinor: number;
      platformTakeMinor: number;
      sellerCreditMinor: number;
      currency: string;
    }
  | { status: "not_found" }
  | { status: "not_vetted" }
  | { status: "own_listing" }
  | { status: "not_active" }
  | { status: "already_licensed"; licenseId: string };

export async function licenseListing(
  db: Db,
  actor: MarketplaceActor,
  input: LicenseListingInput,
): Promise<LicenseListingOutcome> {
  if (!(await isVetted(db, actor.agencyId))) {
    return { status: "not_vetted" };
  }
  try {
    return await db.transaction(async (tx) => {
      // Cross-tenant BY DESIGN (research D7): a buyer licenses another
      // tenant's listing — the lock + status check bound what they may do.
      const listings = await tx
        .select()
        .from(marketplaceListing)
        .where(eq(marketplaceListing.id, input.listingId))
        .limit(1)
        .for("update");
      const listing = listings[0];
      if (!listing) return { status: "not_found" } as const;
      if (listing.status !== "active") return { status: "not_active" } as const;
      if (listing.sellerAgencyId === actor.agencyId) return { status: "own_listing" } as const;

      const existing = await tx
        .select({ id: marketplaceLicense.id })
        .from(marketplaceLicense)
        .where(
          and(
            eq(marketplaceLicense.listingId, listing.id),
            eq(marketplaceLicense.resellerAgencyId, actor.agencyId),
          ),
        )
        .limit(1);
      if (existing[0]) return { status: "already_licensed", licenseId: existing[0].id } as const;

      // Both sides vetted at v0 (spec 006 FR-002, edge case "Both sides
      // vetted"): the SELLER's vetting is re-checked here, inside the
      // transaction, so an active listing stops being licensable the moment
      // the seller's vetting is revoked — not just at listing time.
      if (!(await isVetted(tx, listing.sellerAgencyId))) {
        return { status: "not_vetted" } as const;
      }

      const sources = await tx.select().from(itineraryTable).where(eq(itineraryTable.id, listing.itineraryId)).limit(1);
      const source = sources[0];
      if (!source) {
        // FK-impossible outside a torn migration — surface loudly, conserve state.
        throw new Error(`listing ${listing.id} references missing itinerary ${listing.itineraryId}`);
      }

      const copyId = randomUUID();
      const copyDocument = whiteLabelCopy(parseItinerary(source.document), {
        copyId,
        resellerAgencyId: actor.agencyId,
        licenseTerms: listing.licenseTerms,
        revenueShareBps: listing.revenueShareBps,
        sourceItineraryId: source.id,
      });
      // Boundary re-validation before the write (INV-001).
      const validatedCopy = parseItinerary(copyDocument);

      const split = splitTakeRate(money(listing.priceMinor, listing.currency), DEFAULT_PLATFORM_TAKE_RATE_BPS);

      // Copy first (the license FK-references it), then license, then ledger.
      await tx.insert(itineraryTable).values({
        id: copyId,
        agencyId: actor.agencyId,
        title: validatedCopy.title,
        currency: validatedCopy.currency,
        document: validatedCopy,
        // Inherited so the reseller can re-quote supply on the copy (D8).
        tripRequest: source.tripRequest,
      });
      const insertedLicenses = await tx
        .insert(marketplaceLicense)
        .values({
          listingId: listing.id,
          sellerAgencyId: listing.sellerAgencyId,
          resellerAgencyId: actor.agencyId,
          copyItineraryId: copyId,
          priceMinor: listing.priceMinor,
          currency: listing.currency,
        })
        .returning({ id: marketplaceLicense.id });
      const license = insertedLicenses[0];
      if (!license) throw new Error("license insert returned no row");

      await tx.insert(revenueShareLedger).values({
        licenseId: license.id,
        sellerAgencyId: listing.sellerAgencyId,
        resellerAgencyId: actor.agencyId,
        priceMinor: listing.priceMinor,
        platformTakeMinor: split.platformTake.amountMinor,
        sellerCreditMinor: split.sellerCredit.amountMinor,
        currency: listing.currency,
      });

      // Take-rate revenue is attributed to the SELLER agency ("take-rate
      // revenue per active agent"); the copy is the reseller's resold trip.
      // The event carries the FULL split (FR-014: license price, platform
      // take as amountMinor, seller credit) — conservation enforced by the
      // recorder: priceMinor = amountMinor + sellerCreditMinor.
      await recordPmfEvent(tx, {
        type: "take_rate_accrued",
        agencyId: listing.sellerAgencyId,
        amountMinor: split.platformTake.amountMinor,
        currency: listing.currency,
        itineraryId: copyId,
        actorUserId: actor.userId,
        priceMinor: listing.priceMinor,
        sellerCreditMinor: split.sellerCredit.amountMinor,
      });
      await recordPmfEvent(tx, {
        type: "trip_created",
        agencyId: actor.agencyId,
        itineraryId: copyId,
        source: "licensed",
        actorUserId: actor.userId,
      });

      return {
        status: "licensed",
        licenseId: license.id,
        copyItineraryId: copyId,
        priceMinor: listing.priceMinor,
        platformTakeMinor: split.platformTake.amountMinor,
        sellerCreditMinor: split.sellerCredit.amountMinor,
        currency: listing.currency,
      } as const;
    });
  } catch (err) {
    // Concurrent duplicate by the SAME agency: the unique key decided the
    // race; the loser's transaction (copy included) rolled back whole.
    if (isUniqueViolation(err)) {
      const winner = await db
        .select({ id: marketplaceLicense.id })
        .from(marketplaceLicense)
        .where(
          and(
            eq(marketplaceLicense.listingId, input.listingId),
            eq(marketplaceLicense.resellerAgencyId, actor.agencyId),
          ),
        )
        .limit(1);
      if (winner[0]) return { status: "already_licensed", licenseId: winner[0].id };
    }
    throw err;
  }
}
