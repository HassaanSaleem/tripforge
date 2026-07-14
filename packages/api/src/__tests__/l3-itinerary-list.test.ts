// L3 — workspace.itinerary.list against a REAL database (spec 011 contract §2,
// FR-010): the marketplace picker's read is tenant-scoped by construction —
// two agencies draft through the real product path and each caller sees
// EXACTLY its own rows (INV-004, no cross-tenant leakage), newest first, with
// the 3-field projection only (no documents, no trip requests). The RBAC
// ladder is re-pinned at this procedure (anon UNAUTHORIZED / traveler
// FORBIDDEN) so the gate travels with the surface it protects.
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

describe.skipIf(!DATABASE_URL)("L3 workspace.itinerary.list (real Postgres)", () => {
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
    const agencyId = `l3il-agency-${randomUUID()}`;
    const userId = `l3il-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  async function draft(session: SessionContext, destination: string): Promise<string> {
    const drafted = await draftViaCaller(callerFor(session), {
      destination,
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      party: { adults: 2, children: 0 },
      budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
    });
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  it(
    "each agency sees exactly its own itineraries, newest first, projection-only (INV-004)",
    async () => {
      const alpha = await makeAgency("Alpha Voyages");
      const beta = await makeAgency("Beta Trails");
      const alphaFirst = await draft(alpha, "Paris");
      const alphaSecond = await draft(alpha, "Lisbon");
      const betaOnly = await draft(beta, "Rome");

      const alphaList = await callerFor(alpha).workspace.itinerary.list();
      const betaList = await callerFor(beta).workspace.itinerary.list();

      // Exactly its own rows — the other tenant's ids never appear.
      expect(alphaList.itineraries.map((i) => i.id).sort()).toEqual([alphaFirst, alphaSecond].sort());
      expect(betaList.itineraries.map((i) => i.id)).toEqual([betaOnly]);

      // Newest first (createdAt is server-stamped on the real insert path).
      const stamps = alphaList.itineraries.map((i) => Date.parse(i.createdAt));
      expect(stamps[0]).toBeGreaterThanOrEqual(stamps[1] as number);

      // Picker projection ONLY: no canonical document, no trip request. Every
      // unlisted trip carries an explicit null listing (spec 014 FR-008) and
      // null licensedCopy (spec 024 FR-006 — a self-authored original is
      // never marked), not an absent field.
      for (const row of alphaList.itineraries) {
        expect(Object.keys(row).sort()).toEqual(["createdAt", "currency", "id", "licensedCopy", "listing", "title"]);
        expect(row.currency).toBe("USD");
        expect(row.title.length).toBeGreaterThan(0);
        expect(row.listing).toBeNull();
        expect(row.licensedCopy).toBeNull();
      }
    },
    LONG,
  );

  it(
    "an active listing marks the trip; deactivating clears the mark (spec 014 US2)",
    async () => {
      const seller = await makeAgency("Epsilon Voyages");
      await handle.db.insert(agencyVetting).values({ agencyId: seller.agencyId, vettedBy: "l3il-test-operator" });
      const tripId = await draft(seller, "Porto");

      const before = await callerFor(seller).workspace.itinerary.list();
      expect(before.itineraries.find((i) => i.id === tripId)?.listing).toBeNull();

      const listed = await callerFor(seller).workspace.marketplace.createListing({
        itineraryId: tripId,
        title: "Porto long weekend — proven route",
        priceMinor: 25_000,
        licenseTerms: "White-label permitted; keep attribution lineage.",
        revenueShareBps: 750,
      });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") throw new Error("listing failed");

      const after = await callerFor(seller).workspace.itinerary.list();
      expect(after.itineraries.find((i) => i.id === tripId)?.listing).toEqual({
        listingId: listed.listingId,
        priceMinor: 25_000,
        currency: "USD",
      });

      await callerFor(seller).workspace.marketplace.deactivateListing({ listingId: listed.listingId });
      const afterOff = await callerFor(seller).workspace.itinerary.list();
      expect(afterOff.itineraries.find((i) => i.id === tripId)?.listing).toBeNull();
    },
    LONG,
  );

  it(
    "a licensed white-label copy appears in the BUYER's list; the seller's list is unchanged by the trade (spec 012 D10)",
    async () => {
      const seller = await makeAgency("Gamma Journeys");
      const buyer = await makeAgency("Delta Escapes");
      // Both sides vetted — the trade path refuses otherwise (seed-0006/0006a).
      await handle.db.insert(agencyVetting).values({ agencyId: seller.agencyId, vettedBy: "l3il-test-operator" });
      await handle.db.insert(agencyVetting).values({ agencyId: buyer.agencyId, vettedBy: "l3il-test-operator" });

      const sourceId = await draft(seller, "Barcelona");
      const buyerBefore = await callerFor(buyer).workspace.itinerary.list();
      expect(buyerBefore.itineraries).toEqual([]);

      const listed = await callerFor(seller).workspace.marketplace.createListing({
        itineraryId: sourceId,
        title: "Barcelona weekender — proven route",
        priceMinor: 25_000,
        licenseTerms: "White-label permitted; keep attribution lineage.",
        revenueShareBps: 750,
      });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") throw new Error("listing failed");

      const licensed = await callerFor(buyer).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licensed.status).toBe("licensed");
      if (licensed.status !== "licensed") throw new Error("license failed");

      // The workspace list's core promise (spec 012 FR-007): the receipt's
      // copy id is exactly what the buyer's tenant-scoped list now serves.
      const buyerAfter = await callerFor(buyer).workspace.itinerary.list();
      expect(buyerAfter.itineraries.map((i) => i.id)).toEqual([licensed.copyItineraryId]);

      // Licensed-copy marker (spec 024 FR-001/FR-002): the buyer's copy is
      // marked and attributed to the original author; a generation-1 chain.
      expect(buyerAfter.itineraries[0]?.licensedCopy).toEqual({
        originalAuthorAgencyName: "Gamma Journeys",
        generation: 1,
      });

      // The trade never grows (or leaks into) the seller's own list; the
      // seller's original stays unmarked (FR-006).
      const sellerAfter = await callerFor(seller).workspace.itinerary.list();
      expect(sellerAfter.itineraries.map((i) => i.id)).toEqual([sourceId]);
      expect(sellerAfter.itineraries[0]?.licensedCopy).toBeNull();
    },
    LONG,
  );

  it(
    "a re-licensed chain (copy-of-a-copy) attributes the FIRST author, generation 2 (spec 024 edge case)",
    async () => {
      const originalAuthor = await makeAgency("Zenith Expeditions");
      const firstReseller = await makeAgency("Coastal Journeys");
      const secondReseller = await makeAgency("Wanderlux Agency");
      for (const agency of [originalAuthor, firstReseller, secondReseller]) {
        await handle.db.insert(agencyVetting).values({ agencyId: agency.agencyId, vettedBy: "l3il-test-operator" });
      }

      const sourceId = await draft(originalAuthor, "Vienna");
      const listing1 = await callerFor(originalAuthor).workspace.marketplace.createListing({
        itineraryId: sourceId,
        title: "Vienna proven route",
        priceMinor: 25_000,
        licenseTerms: "White-label permitted; keep attribution lineage.",
        revenueShareBps: 750,
      });
      expect(listing1.status).toBe("listed");
      if (listing1.status !== "listed") throw new Error("listing failed");

      const license1 = await callerFor(firstReseller).workspace.marketplace.licenseListing({
        listingId: listing1.listingId,
      });
      expect(license1.status).toBe("licensed");
      if (license1.status !== "licensed") throw new Error("license failed");

      // First reseller re-lists their own copy — a resale, not a fresh original.
      const listing2 = await callerFor(firstReseller).workspace.marketplace.createListing({
        itineraryId: license1.copyItineraryId,
        title: "Vienna proven route (re-listed)",
        priceMinor: 20_000,
        licenseTerms: "White-label permitted; keep attribution lineage.",
        revenueShareBps: 500,
      });
      expect(listing2.status).toBe("listed");
      if (listing2.status !== "listed") throw new Error("re-listing failed");

      const license2 = await callerFor(secondReseller).workspace.marketplace.licenseListing({
        listingId: listing2.listingId,
      });
      expect(license2.status).toBe("licensed");
      if (license2.status !== "licensed") throw new Error("second license failed");

      const secondResellerList = await callerFor(secondReseller).workspace.itinerary.list();
      // Generation 2 (two rebrand-lineage hops); attribution stays the FIRST
      // author (Zenith Expeditions), never the intermediate reseller.
      expect(secondResellerList.itineraries.find((i) => i.id === license2.copyItineraryId)?.licensedCopy).toEqual({
        originalAuthorAgencyName: "Zenith Expeditions",
        generation: 2,
      });
    },
    LONG,
  );

  it(
    "the RBAC ladder travels with the procedure: anon UNAUTHORIZED, traveler FORBIDDEN",
    async () => {
      await expect(callerFor(null).workspace.itinerary.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        callerFor({ userId: `l3il-traveler-${randomUUID()}` }).workspace.itinerary.list(),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
    LONG,
  );
});
