// L3 — the marketplace trade layer against a REAL database (spec 006 SC-002/
// SC-003/SC-006; quality bar Money-Safe: unit-test-only coverage of money
// paths fails review). Walks list → license/white-label → rate through the
// full tRPC surface, asserting exact state deltas, the revenue-share
// conservation identity (price = platform take + seller credit), provenance
// travel on the copy, and ZERO surviving rows on the forced-failure and
// losing-race branches (INV-011/012).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §3). Skipping without the env is loud, never silent green.
//
// Fault injection happens at the DB-EXECUTOR boundary (research D6) — a Proxy
// makes the Nth insert INSIDE the license transaction throw, the same seam
// philosophy as the port-boundary wrapper in l3-booking.test.ts. No test
// hooks exist in product code; Postgres does the conserving, this suite
// proves it.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  and,
  count,
  createDb,
  eq,
  itinerary as itineraryTable,
  listingRating,
  marketplaceLicense,
  marketplaceListing,
  organization,
  pmfEvent,
  revenueShareLedger,
  agencyVetting,
  user as userTable,
  type Db,
  type DbHandle,
} from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { parseItinerary } from "@tripforge/itinerary-schema";
import { appRouter } from "../routers/root.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 marketplace trade layer (real Postgres)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(db?: Db): Container {
    return {
      hotel: new SandboxHotelAdapter(),
      activity: new SandboxActivityAdapter(),
      transfer: new SandboxTransferAdapter(),
      carRental: new SandboxCarRentalAdapter(),
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: db ?? handle.db,
    };
  }

  async function makeAgency(name: string): Promise<SessionContext & { agencyId: string }> {
    const agencyId = `l3m-agency-${randomUUID()}`;
    const userId = `l3m-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  /** The operator vetting action's effect (FR-001) — the script itself is
   * exercised in the live gate; here the row is the contract. */
  async function vet(agencyId: string): Promise<void> {
    await handle.db.insert(agencyVetting).values({ agencyId, vettedBy: "l3-test-operator" });
  }

  function callerFor(session: SessionContext, db?: Db) {
    return appRouter.createCaller({ session, container: makeContainer(db) });
  }

  const DRAFT_INPUT = {
    destination: "Paris",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
  } as const;

  /** Draft a real itinerary through the product path (document + tripRequest
   * persisted exactly as production writes them). */
  async function draftItinerary(session: SessionContext): Promise<string> {
    const drafted = await callerFor(session).workspace.itinerary.draft(DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  const LISTING_INPUT = {
    title: "Paris on a budget — proven weekender",
    priceMinor: 25_000,
    licenseTerms: "White-label permitted; no sublicensing; keep attribution lineage.",
    revenueShareBps: 750,
  } as const;

  async function tradeCounts(where: { seller: string; reseller: string }) {
    const db = handle.db;
    const [listings] = await db
      .select({ n: count() })
      .from(marketplaceListing)
      .where(eq(marketplaceListing.sellerAgencyId, where.seller));
    const [licenses] = await db
      .select({ n: count() })
      .from(marketplaceLicense)
      .where(eq(marketplaceLicense.resellerAgencyId, where.reseller));
    const [ledger] = await db
      .select({ n: count() })
      .from(revenueShareLedger)
      .where(eq(revenueShareLedger.resellerAgencyId, where.reseller));
    const [copies] = await db
      .select({ n: count() })
      .from(itineraryTable)
      .where(eq(itineraryTable.agencyId, where.reseller));
    const [resellerPmf] = await db.select({ n: count() }).from(pmfEvent).where(eq(pmfEvent.agencyId, where.reseller));
    return {
      listings: Number(listings?.n ?? 0),
      licenses: Number(licenses?.n ?? 0),
      ledger: Number(ledger?.n ?? 0),
      copies: Number(copies?.n ?? 0),
      resellerPmf: Number(resellerPmf?.n ?? 0),
    };
  }

  it(
    "US1: vetting gates listing; provenance is stamped; browse/deactivate behave per contract",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const buyer = await makeAgency("Nomad Collective");
      const itineraryId = await draftItinerary(seller);

      // Unvetted: refused with the explicit typed outcome (FR-002), nothing written.
      const refused = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(refused.status).toBe("not_vetted");

      await vet(seller.agencyId);
      await vet(buyer.agencyId);

      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      // The SOURCE itinerary now carries complete listed provenance (INV-002).
      const [sourceRow] = await handle.db
        .select()
        .from(itineraryTable)
        .where(eq(itineraryTable.id, itineraryId));
      const sourceDoc = parseItinerary(sourceRow?.document);
      expect(sourceDoc.provenance.originalAuthorAgencyId).toBe(seller.agencyId);
      expect(sourceDoc.provenance.licenseTerms).toBe(LISTING_INPUT.licenseTerms);
      expect(sourceDoc.provenance.revenueShareBps).toBe(LISTING_INPUT.revenueShareBps);

      // listing_created PMF event, in the same flow (INV-021).
      const created = await handle.db
        .select()
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, seller.agencyId), eq(pmfEvent.type, "listing_created")));
      expect(created).toHaveLength(1);
      expect(created[0]?.itineraryId).toBe(itineraryId);

      // One ACTIVE listing per itinerary (D9).
      const dup = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(dup).toEqual({ status: "already_listed", listingId: listed.listingId });

      // Listing someone else's itinerary is NOT_FOUND (tenant scope, FR-005).
      await expect(
        callerFor(buyer).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // Browse: cross-tenant visibility with the public projection (D7).
      const browsed = await callerFor(buyer).workspace.marketplace.browseListings();
      const mineView = await callerFor(seller).workspace.marketplace.browseListings();
      const seen = browsed.listings.find((l) => l.listingId === listed.listingId);
      expect(seen).toMatchObject({
        title: LISTING_INPUT.title,
        priceMinor: LISTING_INPUT.priceMinor,
        currency: "USD",
        revenueShareBps: LISTING_INPUT.revenueShareBps,
        sellerAgencyId: seller.agencyId,
        sellerAgencyName: "Atlas DMC",
        ratingAverage: null,
        ratingCount: 0,
        mine: false,
      });
      expect(mineView.listings.find((l) => l.listingId === listed.listingId)?.mine).toBe(true);

      // Deactivation: seller-only, one-way, excluded from browse (FR-007).
      await expect(
        callerFor(buyer).workspace.marketplace.deactivateListing({ listingId: listed.listingId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const off = await callerFor(seller).workspace.marketplace.deactivateListing({ listingId: listed.listingId });
      expect(off).toEqual({ status: "deactivated", listingId: listed.listingId });
      const afterOff = await callerFor(buyer).workspace.marketplace.browseListings();
      expect(afterOff.listings.find((l) => l.listingId === listed.listingId)).toBeUndefined();
      const again = await callerFor(seller).workspace.marketplace.deactivateListing({ listingId: listed.listingId });
      expect(again).toEqual({ status: "already_inactive", listingId: listed.listingId });
    },
    LONG,
  );

  it(
    "US2: one atomic license transaction — split identity, provenance travel, PMF events, and every refusal",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const reseller = await makeAgency("Nomad Collective");
      const outsider = await makeAgency("Unvetted Tours");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      // Refusals first (zero writes): unvetted, self-dealing.
      expect(
        (await callerFor(outsider).workspace.marketplace.licenseListing({ listingId: listed.listingId })).status,
      ).toBe("not_vetted");
      expect(
        (await callerFor(seller).workspace.marketplace.licenseListing({ listingId: listed.listingId })).status,
      ).toBe("own_listing");

      const before = await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId });
      const licensed = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licensed.status).toBe("licensed");
      if (licensed.status !== "licensed") return;

      // Exact split (floor take): 25_000 @ 1000 bps → 2_500 / 22_500 (D-0006.b).
      expect(licensed).toMatchObject({
        priceMinor: 25_000,
        platformTakeMinor: 2_500,
        sellerCreditMinor: 22_500,
        currency: "USD",
      });

      // Ledger row-local conservation identity (SC-002).
      const [ledgerRow] = await handle.db
        .select()
        .from(revenueShareLedger)
        .where(eq(revenueShareLedger.licenseId, licensed.licenseId));
      expect(ledgerRow).toMatchObject({
        sellerAgencyId: seller.agencyId,
        resellerAgencyId: reseller.agencyId,
        priceMinor: 25_000,
        platformTakeMinor: 2_500,
        sellerCreditMinor: 22_500,
        currency: "USD",
      });
      if (!ledgerRow) return;
      expect(ledgerRow.platformTakeMinor + ledgerRow.sellerCreditMinor).toBe(ledgerRow.priceMinor);

      // The white-label copy: reseller tenant, complete travelling provenance
      // (SC-003), lineage naming the source, inherited trip request.
      const [copyRow] = await handle.db
        .select()
        .from(itineraryTable)
        .where(eq(itineraryTable.id, licensed.copyItineraryId));
      expect(copyRow?.agencyId).toBe(reseller.agencyId);
      const copyDoc = parseItinerary(copyRow?.document);
      expect(copyDoc.provenance).toEqual({
        originalAuthorAgencyId: seller.agencyId,
        licenseTerms: LISTING_INPUT.licenseTerms,
        revenueShareBps: LISTING_INPUT.revenueShareBps,
        rebrandLineage: [itineraryId],
      });
      const [srcRow] = await handle.db.select().from(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      expect(copyRow?.tripRequest).toEqual(srcRow?.tripRequest);

      // Both PMF events, transactionally with the trade (INV-021, D4).
      const take = await handle.db
        .select()
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, seller.agencyId), eq(pmfEvent.type, "take_rate_accrued")));
      expect(take).toHaveLength(1);
      // FR-014: the licensed event carries the FULL split — license price,
      // platform take (amountMinor), seller credit — and it conserves.
      expect(take[0]).toMatchObject({
        amountMinor: 2_500,
        priceMinor: 25_000,
        sellerCreditMinor: 22_500,
        currency: "USD",
        itineraryId: licensed.copyItineraryId,
      });
      expect((take[0]?.amountMinor ?? 0) + (take[0]?.sellerCreditMinor ?? 0)).toBe(take[0]?.priceMinor);
      const resold = await handle.db
        .select()
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, reseller.agencyId), eq(pmfEvent.type, "trip_created")));
      expect(resold).toHaveLength(1);
      expect(resold[0]).toMatchObject({ source: "licensed", itineraryId: licensed.copyItineraryId });

      // Exactly one of everything (state delta vs before).
      const after = await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId });
      expect(after).toEqual({
        listings: before.listings,
        licenses: before.licenses + 1,
        ledger: before.ledger + 1,
        copies: before.copies + 1,
        resellerPmf: before.resellerPmf + 1,
      });

      // Duplicate by the same reseller: typed refusal, still one of everything.
      const dup = await callerFor(reseller).workspace.marketplace.licenseListing({ listingId: listed.listingId });
      expect(dup).toEqual({ status: "already_licensed", licenseId: licensed.licenseId });
      expect(await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId })).toEqual(after);

      // Deactivated listing refuses NEW licensees; existing copies unaffected (FR-007).
      const third = await makeAgency("Third Agency");
      await vet(third.agencyId);
      await callerFor(seller).workspace.marketplace.deactivateListing({ listingId: listed.listingId });
      expect(
        (await callerFor(third).workspace.marketplace.licenseListing({ listingId: listed.listingId })).status,
      ).toBe("not_active");
      const [copyStill] = await handle.db
        .select({ n: count() })
        .from(itineraryTable)
        .where(eq(itineraryTable.id, licensed.copyItineraryId));
      expect(Number(copyStill?.n)).toBe(1);
    },
    LONG,
  );

  it(
    "US2 conservation: a fault INSIDE the license transaction leaves ZERO rows (FR-011/INV-011)",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const reseller = await makeAgency("Nomad Collective");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      const before = await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId });

      // Fail the 3rd insert inside the tx — AFTER the copy and license
      // inserts, at the ledger write: the worst spot for conservation.
      const faultyDb = withInsertFaultInTx(handle.db, 3);
      await expect(
        callerFor(reseller, faultyDb).workspace.marketplace.licenseListing({ listingId: listed.listingId }),
      ).rejects.toThrow(/injected/);

      // ZERO survivors: no license, no ledger row, no copy, no PMF event.
      expect(await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId })).toEqual(before);

      // And the hold on nothing: the same reseller can still license cleanly.
      const retry = await callerFor(reseller).workspace.marketplace.licenseListing({ listingId: listed.listingId });
      expect(retry.status).toBe("licensed");
    },
    LONG,
  );

  it(
    "US2 concurrency: duplicate concurrent licenses — exactly one winner, one money record (FR-012)",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const reseller = await makeAgency("Nomad Collective");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      // Two independent containers (fresh-process shape, INV-028) race.
      const [a, b] = await Promise.all([
        callerFor(reseller).workspace.marketplace.licenseListing({ listingId: listed.listingId }),
        callerFor(reseller).workspace.marketplace.licenseListing({ listingId: listed.listingId }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(["already_licensed", "licensed"]);

      const counts = await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId });
      expect(counts.licenses).toBe(1);
      expect(counts.ledger).toBe(1);
      expect(counts.copies).toBe(1);
    },
    LONG,
  );

  it(
    "US2 both-sides vetting: a de-vetted SELLER's active listing refuses licensing — zero delta (FR-002)",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const reseller = await makeAgency("Nomad Collective");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      // The operator revokes the SELLER's vetting AFTER the listing went active.
      await handle.db.delete(agencyVetting).where(eq(agencyVetting.agencyId, seller.agencyId));

      const before = await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId });
      const refused = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(refused.status).toBe("not_vetted");

      // ZERO survivors: no license, ledger row, copy, or reseller PMF event —
      // and no take-rate accrual for the de-vetted seller either.
      expect(await tradeCounts({ seller: seller.agencyId, reseller: reseller.agencyId })).toEqual(before);
      const sellerTake = await handle.db
        .select({ n: count() })
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, seller.agencyId), eq(pmfEvent.type, "take_rate_accrued")));
      expect(Number(sellerTake[0]?.n)).toBe(0);

      // Falsifiability: restore the seller's vetting — the same license completes.
      await vet(seller.agencyId);
      const retry = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(retry.status).toBe("licensed");
    },
    LONG,
  );

  it(
    "US3: only licensees rate; re-rating replaces; aggregates land in browse (FR-013)",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const reseller = await makeAgency("Nomad Collective");
      const bystander = await makeAgency("No License Yet");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      await vet(bystander.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;
      const licensed = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licensed.status).toBe("licensed");

      // Non-licensee (and the seller itself) cannot rate — mechanically.
      expect(
        (await callerFor(bystander).workspace.marketplace.rateListing({ listingId: listed.listingId, stars: 5 }))
          .status,
      ).toBe("not_licensee");
      expect(
        (await callerFor(seller).workspace.marketplace.rateListing({ listingId: listed.listingId, stars: 5 })).status,
      ).toBe("not_licensee");

      const rated = await callerFor(reseller).workspace.marketplace.rateListing({
        listingId: listed.listingId,
        stars: 5,
        comment: "Sold two of these in a week.",
      });
      expect(rated).toMatchObject({ status: "rated", stars: 5, ratingAverage: 5, ratingCount: 1 });

      // Re-rate REPLACES (count stable — FR-013), and browse carries the aggregate.
      const rerated = await callerFor(reseller).workspace.marketplace.rateListing({
        listingId: listed.listingId,
        stars: 3,
      });
      expect(rerated).toMatchObject({ status: "rated", stars: 3, ratingAverage: 3, ratingCount: 1 });
      const [ratingRows] = await handle.db
        .select({ n: count() })
        .from(listingRating)
        .where(eq(listingRating.listingId, listed.listingId));
      expect(Number(ratingRows?.n)).toBe(1);

      const browsed = await callerFor(bystander).workspace.marketplace.browseListings();
      expect(browsed.listings.find((l) => l.listingId === listed.listingId)).toMatchObject({
        ratingAverage: 3,
        ratingCount: 1,
      });

      // listing_rated PMF events accompany both submissions (INV-021).
      const events = await handle.db
        .select()
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, reseller.agencyId), eq(pmfEvent.type, "listing_rated")));
      expect(events).toHaveLength(2);
    },
    LONG,
  );

  it(
    "zero-price listing licenses cleanly with a zero split still recorded (spec edge case)",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const reseller = await makeAgency("Nomad Collective");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({
        itineraryId,
        ...LISTING_INPUT,
        priceMinor: 0,
      });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;
      const licensed = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licensed).toMatchObject({
        status: "licensed",
        priceMinor: 0,
        platformTakeMinor: 0,
        sellerCreditMinor: 0,
      });
      if (licensed.status !== "licensed") return;
      const [ledgerRow] = await handle.db
        .select()
        .from(revenueShareLedger)
        .where(eq(revenueShareLedger.licenseId, licensed.licenseId));
      expect(ledgerRow).toMatchObject({ priceMinor: 0, platformTakeMinor: 0, sellerCreditMinor: 0 });
    },
    LONG,
  );

  it(
    "seller earnings (spec 014 US1): browseListings reports the exact license count and seller-credit sum, seller-only",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      const resellerA = await makeAgency("Nomad Collective");
      const resellerB = await makeAgency("Third Agency");
      await vet(seller.agencyId);
      await vet(resellerA.agencyId);
      await vet(resellerB.agencyId);
      const itineraryId = await draftItinerary(seller);
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      // Before any license: an explicit zero, never absent (FR-003).
      const beforeBrowse = await callerFor(seller).workspace.marketplace.browseListings();
      expect(beforeBrowse.listings.find((l) => l.listingId === listed.listingId)).toMatchObject({
        licenseCount: 0,
        sellerCreditTotalMinor: 0,
      });

      const licenseA = await callerFor(resellerA).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      const licenseB = await callerFor(resellerB).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licenseA.status).toBe("licensed");
      expect(licenseB.status).toBe("licensed");
      if (licenseA.status !== "licensed" || licenseB.status !== "licensed") return;

      const exactSum = licenseA.sellerCreditMinor + licenseB.sellerCreditMinor;
      const sellerBrowse = await callerFor(seller).workspace.marketplace.browseListings();
      expect(sellerBrowse.listings.find((l) => l.listingId === listed.listingId)).toMatchObject({
        licenseCount: 2,
        sellerCreditTotalMinor: exactSum,
      });

      // Seller-only (FR-004): no other agency's browse ever sees earnings for
      // a listing it does not own — including the resellers who just licensed it.
      const resellerABrowse = await callerFor(resellerA).workspace.marketplace.browseListings();
      expect(resellerABrowse.listings.find((l) => l.listingId === listed.listingId)).toMatchObject({
        mine: false,
        licenseCount: null,
        sellerCreditTotalMinor: null,
      });
    },
    LONG,
  );
});

/** Wrap a real Db so the Nth `insert` INSIDE the next transaction throws —
 * the executor-boundary fault injector (research D6). Everything else
 * delegates to the real handle; Postgres rolls the transaction back. */
function withInsertFaultInTx(db: Db, failingInsert: number): Db {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (prop === "transaction") {
        return (cb: (tx: object) => unknown, ...rest: unknown[]) =>
          (value as (...a: unknown[]) => unknown).call(
            target,
            (tx: object) => {
              let inserts = 0;
              const proxied = new Proxy(tx, {
                get(txTarget, txProp) {
                  const txValue = Reflect.get(txTarget, txProp) as unknown;
                  if (txProp === "insert") {
                    return (...args: unknown[]) => {
                      inserts += 1;
                      if (inserts === failingInsert) {
                        throw new Error("injected: fault inside license transaction");
                      }
                      return (txValue as (...a: unknown[]) => unknown).apply(txTarget, args);
                    };
                  }
                  return typeof txValue === "function"
                    ? (txValue as (...a: unknown[]) => unknown).bind(txTarget)
                    : txValue;
                },
              });
              return cb(proxied);
            },
            ...rest,
          );
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
