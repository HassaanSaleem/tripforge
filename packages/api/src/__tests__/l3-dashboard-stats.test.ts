// L3 — workspace.dashboard.stats against a REAL database (spec 017 contract
// §6): two-tenant isolation, zero-state for a fresh agency, and per-currency
// grouping (a booking in USD and one in EUR must never collapse into one
// summed number — Money-Safe bar, Constitution VI).
//
// Env-gated like the sibling l3 suites: runs when DATABASE_URL points at a
// live Postgres (compose stack); skipping without the env is loud, not green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { agencyVetting, createDb, organization, user as userTable, type DbHandle } from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { draftViaCaller } from "./draft-helper.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 workspace.dashboard.stats (real Postgres)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(): Container {
    return {
      hotel: new SandboxHotelAdapter(),
      activity: new SandboxActivityAdapter(),
      transfer: new SandboxTransferAdapter(),
      carRental: new SandboxCarRentalAdapter(),
      mediaStore: new SandboxMediaStoreAdapter(handle.db),
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: handle.db,
    };
  }

  async function makeAgency(name: string): Promise<SessionContext & { agencyId: string }> {
    const agencyId = `l3ds-agency-${randomUUID()}`;
    const userId = `l3ds-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  async function draftAndBook(
    session: SessionContext,
    destination: string,
    currency: string,
  ): Promise<string> {
    const caller = callerFor(session);
    const drafted = await draftViaCaller(caller, {
      destination,
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      party: { adults: 2, children: 0 },
      budget: { mode: "hardCap", amountMinor: 200_000, currency },
    });
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    const itineraryId = drafted.itinerary.id;

    const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
    expect(quoted.status).toBe("quoted");
    if (quoted.status !== "quoted") throw new Error("quote failed");
    const quoteRowIds = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
    expect(quoteRowIds.length).toBeGreaterThan(0);

    const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds });
    expect(booked.status).toBe("confirmed");

    return itineraryId;
  }

  it(
    "a fresh agency's stats are all-zero/empty, never an error (spec FR-003, SC-003)",
    async () => {
      const fresh = await makeAgency("Fresh Voyages");
      const stats = await callerFor(fresh).workspace.dashboard.stats();
      expect(stats).toEqual({
        gbvByCurrency: [],
        earningsByCurrency: [],
        activeTripCount: 0,
        listingCount: 0,
        licenseCount: 0,
        recentActivity: [],
      });
    },
    LONG,
  );

  it(
    "two-tenant isolation: agency A's stats never include agency B's rows (INV-004)",
    async () => {
      const alpha = await makeAgency("Alpha Stats Co");
      const beta = await makeAgency("Beta Stats Co");

      await draftAndBook(alpha, "Lisbon", "USD");
      await draftAndBook(beta, "Tokyo", "USD");

      const alphaStats = await callerFor(alpha).workspace.dashboard.stats();
      const betaStats = await callerFor(beta).workspace.dashboard.stats();

      expect(alphaStats.activeTripCount).toBe(1);
      expect(betaStats.activeTripCount).toBe(1);
      // Each agency's own booked GBV is non-zero and independent of the other's.
      expect(alphaStats.gbvByCurrency.find((c) => c.currency === "USD")?.totalMinor).toBeGreaterThan(0);
      expect(betaStats.gbvByCurrency.find((c) => c.currency === "USD")?.totalMinor).toBeGreaterThan(0);
      // Neither agency's recent activity ever names the other's trip.
      expect(alphaStats.recentActivity.some((a) => a.label.includes("Tokyo"))).toBe(false);
      expect(betaStats.recentActivity.some((a) => a.label.includes("Lisbon"))).toBe(false);
    },
    LONG,
  );

  it(
    "a booking in USD and one in EUR are two separate gbvByCurrency entries, never summed (Money-Safe bar)",
    async () => {
      const multi = await makeAgency("Multi Currency Co");
      await draftAndBook(multi, "Lisbon", "USD");
      await draftAndBook(multi, "Marrakech", "EUR");

      const stats = await callerFor(multi).workspace.dashboard.stats();
      const currencies = stats.gbvByCurrency.map((c) => c.currency).sort();
      expect(currencies).toEqual(["EUR", "USD"]);
      for (const entry of stats.gbvByCurrency) {
        expect(entry.totalMinor).toBeGreaterThan(0);
      }
      expect(stats.activeTripCount).toBe(2);
    },
    LONG,
  );

  it(
    "listing + license produce listingCount for the seller, licenseCount + earnings for the buyer/seller respectively",
    async () => {
      const seller = await makeAgency("Seller Stats Co");
      const buyer = await makeAgency("Buyer Stats Co");
      await handle.db.insert(agencyVetting).values({ agencyId: seller.agencyId, vettedBy: "l3ds-test-operator" });
      await handle.db.insert(agencyVetting).values({ agencyId: buyer.agencyId, vettedBy: "l3ds-test-operator" });

      const sourceId = await draftAndBook(seller, "Reykjavik", "USD");

      const listed = await callerFor(seller).workspace.marketplace.createListing({
        itineraryId: sourceId,
        title: "Reykjavik long weekend — proven route",
        priceMinor: 25_000,
        licenseTerms: "White-label permitted; keep attribution lineage.",
        revenueShareBps: 750,
      });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") throw new Error("listing failed");

      const beforeLicense = await callerFor(seller).workspace.dashboard.stats();
      expect(beforeLicense.listingCount).toBe(1);
      expect(beforeLicense.earningsByCurrency).toEqual([]);

      const licensed = await callerFor(buyer).workspace.marketplace.licenseListing({ listingId: listed.listingId });
      expect(licensed.status).toBe("licensed");

      const sellerAfter = await callerFor(seller).workspace.dashboard.stats();
      const buyerAfter = await callerFor(buyer).workspace.dashboard.stats();

      expect(sellerAfter.listingCount).toBe(1);
      expect(sellerAfter.earningsByCurrency.find((c) => c.currency === "USD")?.totalMinor).toBeGreaterThan(0);
      expect(buyerAfter.licenseCount).toBe(1);
      // The buyer's white-label copy is its own itinerary — counts as an active trip.
      expect(buyerAfter.activeTripCount).toBe(1);
      // Licensing is not a sale for the buyer — no listing/earnings of their own.
      expect(buyerAfter.listingCount).toBe(0);
      expect(buyerAfter.earningsByCurrency).toEqual([]);
    },
    LONG,
  );

  it(
    "the RBAC ladder travels with the procedure: anon UNAUTHORIZED, traveler FORBIDDEN",
    async () => {
      await expect(callerFor(null).workspace.dashboard.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        callerFor({ userId: `l3ds-traveler-${randomUUID()}` }).workspace.dashboard.stats(),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
    LONG,
  );
});
