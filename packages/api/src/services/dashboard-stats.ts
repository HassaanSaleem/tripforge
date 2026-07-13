// Agent Home dashboard aggregate (spec 017 research D5/D6, data-model
// "Dashboard Stats"). Read-only projection over data the platform already
// records — no new money computation. Every query is scoped by agencyId AT
// THE QUERY ITSELF (INV-004), mirroring packages/marketplace/src/earnings.ts's
// earningsAggregates. Money is grouped BY CURRENCY and never summed across
// currencies (Money-Safe bar, Constitution VI) — sum()/count() over zero
// matching rows returns 0/empty, which is what makes a fresh agency zero-safe
// (spec FR-003) rather than an error case to special-case.
import {
  booking,
  bookingComponent,
  count,
  desc,
  eq,
  itinerary,
  marketplaceLicense,
  marketplaceListing,
  revenueShareLedger,
  sum,
  type Db,
} from "@tripforge/db";

export interface CurrencyTotal {
  currency: string;
  totalMinor: number;
}

export type RecentActivityKind = "drafted" | "booked" | "licensed";

export interface RecentActivityEntry {
  kind: RecentActivityKind;
  label: string;
  occurredAt: string;
}

export interface DashboardStats {
  gbvByCurrency: CurrencyTotal[];
  earningsByCurrency: CurrencyTotal[];
  activeTripCount: number;
  listingCount: number;
  licenseCount: number;
  recentActivity: RecentActivityEntry[];
}

const RECENT_ACTIVITY_LIMIT = 8;

export async function dashboardStats(db: Db, agencyId: string): Promise<DashboardStats> {
  const [gbvRows, earningsRows, tripRows, listingRows, licenseRows, draftedRows, bookedRows, licensedRows] =
    await Promise.all([
      db
        .select({ currency: bookingComponent.currency, totalMinor: sum(bookingComponent.sellMinor) })
        .from(bookingComponent)
        .where(eq(bookingComponent.agencyId, agencyId))
        .groupBy(bookingComponent.currency),
      db
        .select({ currency: revenueShareLedger.currency, totalMinor: sum(revenueShareLedger.sellerCreditMinor) })
        .from(revenueShareLedger)
        .where(eq(revenueShareLedger.sellerAgencyId, agencyId))
        .groupBy(revenueShareLedger.currency),
      db.select({ n: count() }).from(itinerary).where(eq(itinerary.agencyId, agencyId)),
      db.select({ n: count() }).from(marketplaceListing).where(eq(marketplaceListing.sellerAgencyId, agencyId)),
      db.select({ n: count() }).from(marketplaceLicense).where(eq(marketplaceLicense.resellerAgencyId, agencyId)),
      db
        .select({ title: itinerary.title, createdAt: itinerary.createdAt })
        .from(itinerary)
        .where(eq(itinerary.agencyId, agencyId))
        .orderBy(desc(itinerary.createdAt))
        .limit(RECENT_ACTIVITY_LIMIT),
      db
        .select({ title: itinerary.title, createdAt: booking.createdAt })
        .from(booking)
        .innerJoin(itinerary, eq(booking.itineraryId, itinerary.id))
        .where(eq(booking.agencyId, agencyId))
        .orderBy(desc(booking.createdAt))
        .limit(RECENT_ACTIVITY_LIMIT),
      db
        .select({ title: marketplaceListing.title, createdAt: marketplaceLicense.createdAt })
        .from(marketplaceLicense)
        .innerJoin(marketplaceListing, eq(marketplaceLicense.listingId, marketplaceListing.id))
        .where(eq(marketplaceLicense.resellerAgencyId, agencyId))
        .orderBy(desc(marketplaceLicense.createdAt))
        .limit(RECENT_ACTIVITY_LIMIT),
    ]);

  const recentActivity: RecentActivityEntry[] = [
    ...draftedRows.map((r) => ({
      kind: "drafted" as const,
      label: `Trip drafted: ${r.title}`,
      occurredAt: r.createdAt.toISOString(),
    })),
    ...bookedRows.map((r) => ({
      kind: "booked" as const,
      label: `Booking confirmed: ${r.title}`,
      occurredAt: r.createdAt.toISOString(),
    })),
    ...licensedRows.map((r) => ({
      kind: "licensed" as const,
      label: `Listing licensed: ${r.title}`,
      occurredAt: r.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, RECENT_ACTIVITY_LIMIT);

  return {
    gbvByCurrency: gbvRows.map((r) => ({ currency: r.currency, totalMinor: Number(r.totalMinor ?? 0) })),
    earningsByCurrency: earningsRows.map((r) => ({ currency: r.currency, totalMinor: Number(r.totalMinor ?? 0) })),
    activeTripCount: tripRows[0]?.n ?? 0,
    listingCount: listingRows[0]?.n ?? 0,
    licenseCount: licenseRows[0]?.n ?? 0,
    recentActivity,
  };
}
