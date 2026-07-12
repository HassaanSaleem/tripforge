// Seller earnings aggregation (spec 014 US1; contracts §1). Sums an already-
// conserved money path (revenue_share_ledger, written once per license inside
// licenseListing's transaction) — this module performs no new money math, it
// only reads and totals rows the platform already wrote. Scoped by
// sellerAgencyId at the QUERY itself (research D2), not by post-filtering, so
// another agency's earnings are never fetched for this call. Shape mirrors
// ratingAggregates in ratings.ts exactly (group-by-then-Map).
import { eq, and, count, inArray, marketplaceLicense, revenueShareLedger, sum, type Db } from "@tripforge/db";
import type { DbTx } from "./types.js";

interface EarningsAggregate {
  licenseCount: number;
  sellerCreditTotalMinor: number;
}

/**
 * Per-listing license count + seller-credit total, for ONE seller's own
 * listings only. A listing with no licenses is absent from the returned map
 * (callers default a missing entry to zero — FR-003).
 */
export async function earningsAggregates(
  db: Db | DbTx,
  sellerAgencyId: string,
  listingIds: string[],
): Promise<Map<string, EarningsAggregate>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db
    .select({
      listingId: marketplaceLicense.listingId,
      licenses: count(),
      sellerCreditTotalMinor: sum(revenueShareLedger.sellerCreditMinor),
    })
    .from(revenueShareLedger)
    .innerJoin(marketplaceLicense, eq(revenueShareLedger.licenseId, marketplaceLicense.id))
    .where(
      and(eq(revenueShareLedger.sellerAgencyId, sellerAgencyId), inArray(marketplaceLicense.listingId, listingIds)),
    )
    .groupBy(marketplaceLicense.listingId);
  return new Map(
    rows.map((r) => [
      r.listingId,
      { licenseCount: r.licenses, sellerCreditTotalMinor: Number(r.sellerCreditTotalMinor ?? 0) },
    ]),
  );
}
