// L3 — group travel against a REAL database (spec 021 SC-002/SC-003/SC-004/
// SC-005; quality bar Money-Safe: unit-test-only coverage of money+inventory
// paths fails review). Walks post → browse → join through the full tRPC
// surface, asserting exact state deltas, the CONCURRENT LAST-SEAT RACE
// (exactly one winner, seatsRemaining never negative, zero orphan seat rows
// on the losing side), and the white-label branch (independent reseller seat
// pool, unchanged revenue-share conservation identity).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §3). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  agencyVetting,
  count,
  createDb,
  eq,
  groupDeparture,
  groupDepartureSeat,
  organization,
  pmfEvent,
  revenueShareLedger,
  user as userTable,
  type Db,
  type DbHandle,
} from "@tripforge/db";
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

describe.skipIf(!DATABASE_URL)("L3 group travel (real Postgres)", () => {
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
      mediaStore: new SandboxMediaStoreAdapter(db ?? handle.db),
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: db ?? handle.db,
    };
  }

  async function makeAgency(name: string): Promise<SessionContext & { agencyId: string }> {
    const agencyId = `l3g-agency-${randomUUID()}`;
    const userId = `l3g-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  async function vet(agencyId: string): Promise<void> {
    await handle.db.insert(agencyVetting).values({ agencyId, vettedBy: "l3-test-operator" });
  }

  function callerFor(session: SessionContext, db?: Db) {
    return appRouter.createCaller({ session, container: makeContainer(db) });
  }

  const DRAFT_INPUT = {
    destination: "Lisbon",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap", amountMinor: 120_000, currency: "USD" },
  } as const;

  async function draftItinerary(session: SessionContext): Promise<string> {
    const drafted = await draftViaCaller(callerFor(session), DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  const POST_INPUT = {
    departureDate: "2026-10-01",
    capacity: 2,
    pricePerSeatMinor: 45_000,
  } as const;

  const LISTING_INPUT = {
    title: "Lisbon group tour — monthly departure",
    priceMinor: 25_000,
    licenseTerms: "White-label permitted; no sublicensing.",
    revenueShareBps: 750,
  } as const;

  it(
    "US1: an agency posts and cancels a group departure; tenant scope enforced",
    async () => {
      const agency = await makeAgency("Sunset Journeys");
      const other = await makeAgency("Coastal Trails");
      const itineraryId = await draftItinerary(agency);

      const posted = await callerFor(agency).workspace.groupTravel.post({ itineraryId, ...POST_INPUT });
      expect(posted.status).toBe("posted");
      if (posted.status !== "posted") return;
      expect(posted.seatsRemaining).toBe(2);
      expect(posted.capacity).toBe(2);

      const posted_event = await handle.db
        .select()
        .from(pmfEvent)
        .where(eq(pmfEvent.type, "group_departure_posted"));
      expect(posted_event.some((e) => e.agencyId === agency.agencyId && e.itineraryId === itineraryId)).toBe(true);

      // Posting from an itinerary owned by a different agency is NOT_FOUND (tenant scope).
      await expect(
        callerFor(other).workspace.groupTravel.post({ itineraryId, ...POST_INPUT }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // Cancel: posting-agency-only, one-way.
      await expect(
        callerFor(other).workspace.groupTravel.cancel({ departureId: posted.departureId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const cancelled = await callerFor(agency).workspace.groupTravel.cancel({ departureId: posted.departureId });
      expect(cancelled).toEqual({ status: "cancelled", departureId: posted.departureId });
      const again = await callerFor(agency).workspace.groupTravel.cancel({ departureId: posted.departureId });
      expect(again).toEqual({ status: "already_cancelled", departureId: posted.departureId });
    },
    LONG,
  );

  it(
    "US2: joining decrements seatsRemaining exactly; sold-out and inactive refusals conserve state (FR-005/006)",
    async () => {
      const agency = await makeAgency("Sunset Journeys");
      const itineraryId = await draftItinerary(agency);
      const posted = await callerFor(agency).workspace.groupTravel.post({
        itineraryId,
        ...POST_INPUT,
        capacity: 1,
      });
      expect(posted.status).toBe("posted");
      if (posted.status !== "posted") return;

      const joined = await callerFor(agency).workspace.groupTravel.join({
        departureId: posted.departureId,
        travelerName: "Jamie Lee",
        travelerEmail: "jamie@example.test",
      });
      expect(joined.status).toBe("joined");
      if (joined.status !== "joined") return;
      expect(joined.seatsRemaining).toBe(0);
      expect(joined.seatPriceMinor).toBe(POST_INPUT.pricePerSeatMinor);

      const seatRows = await handle.db
        .select()
        .from(groupDepartureSeat)
        .where(eq(groupDepartureSeat.groupDepartureId, posted.departureId));
      expect(seatRows).toHaveLength(1);
      expect(seatRows[0]?.travelerName).toBe("Jamie Lee");

      const joinedEvent = await handle.db
        .select()
        .from(pmfEvent)
        .where(eq(pmfEvent.type, "group_departure_seat_joined"));
      expect(
        joinedEvent.some(
          (e) => e.agencyId === agency.agencyId && e.amountMinor === POST_INPUT.pricePerSeatMinor,
        ),
      ).toBe(true);

      // Sold out: zero rows added, typed refusal (state conservation, SC-003).
      const soldOut = await callerFor(agency).workspace.groupTravel.join({
        departureId: posted.departureId,
        travelerName: "Someone Else",
      });
      expect(soldOut).toEqual({ status: "sold_out" });
      const stillOneSeat = await handle.db
        .select()
        .from(groupDepartureSeat)
        .where(eq(groupDepartureSeat.groupDepartureId, posted.departureId));
      expect(stillOneSeat).toHaveLength(1);

      // Inactive departure: refused, zero rows added.
      const posted2 = await callerFor(agency).workspace.groupTravel.post({ itineraryId, ...POST_INPUT });
      if (posted2.status !== "posted") return;
      await callerFor(agency).workspace.groupTravel.cancel({ departureId: posted2.departureId });
      const inactive = await callerFor(agency).workspace.groupTravel.join({
        departureId: posted2.departureId,
        travelerName: "Late Arrival",
      });
      expect(inactive).toEqual({ status: "not_active" });
    },
    LONG,
  );

  it(
    "US2 concurrency: two simultaneous joins on the LAST seat — exactly one winner, capacity never oversold (SC-002)",
    async () => {
      const agency = await makeAgency("Sunset Journeys");
      const itineraryId = await draftItinerary(agency);
      const posted = await callerFor(agency).workspace.groupTravel.post({
        itineraryId,
        ...POST_INPUT,
        capacity: 1,
      });
      expect(posted.status).toBe("posted");
      if (posted.status !== "posted") return;

      // Two independent containers (fresh-process shape, INV-028) race for the one seat.
      const [a, b] = await Promise.all([
        callerFor(agency).workspace.groupTravel.join({ departureId: posted.departureId, travelerName: "Racer A" }),
        callerFor(agency).workspace.groupTravel.join({ departureId: posted.departureId, travelerName: "Racer B" }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(["joined", "sold_out"]);

      const [remaining] = await handle.db
        .select({ seatsRemaining: groupDeparture.seatsRemaining })
        .from(groupDeparture)
        .where(eq(groupDeparture.id, posted.departureId));
      expect(remaining?.seatsRemaining).toBe(0);

      const [seatCountRow] = await handle.db
        .select({ n: count() })
        .from(groupDepartureSeat)
        .where(eq(groupDepartureSeat.groupDepartureId, posted.departureId));
      expect(Number(seatCountRow?.n)).toBe(1);
    },
    LONG,
  );

  it(
    "US3: browse shows only active departures with current seatsRemaining and the verified badge",
    async () => {
      const agency = await makeAgency("Sunset Journeys");
      const buyer = await makeAgency("Coastal Trails");
      await vet(agency.agencyId);
      const itineraryId = await draftItinerary(agency);
      const posted = await callerFor(agency).workspace.groupTravel.post({ itineraryId, ...POST_INPUT });
      if (posted.status !== "posted") return;

      const cancelledItinerary = await draftItinerary(agency);
      const cancelledPost = await callerFor(agency).workspace.groupTravel.post({
        itineraryId: cancelledItinerary,
        ...POST_INPUT,
      });
      if (cancelledPost.status !== "posted") return;
      await callerFor(agency).workspace.groupTravel.cancel({ departureId: cancelledPost.departureId });

      const browsed = await callerFor(buyer).workspace.groupTravel.browse();
      const seen = browsed.departures.find((d) => d.departureId === posted.departureId);
      expect(seen).toMatchObject({
        capacity: POST_INPUT.capacity,
        seatsRemaining: POST_INPUT.capacity,
        pricePerSeatMinor: POST_INPUT.pricePerSeatMinor,
        postingAgencyId: agency.agencyId,
        sellerVetted: true,
        mine: false,
      });
      expect(browsed.departures.find((d) => d.departureId === cancelledPost.departureId)).toBeUndefined();

      await callerFor(agency).workspace.groupTravel.join({ departureId: posted.departureId, travelerName: "A" });
      const rebrowsed = await callerFor(buyer).workspace.groupTravel.browse();
      expect(rebrowsed.departures.find((d) => d.departureId === posted.departureId)?.seatsRemaining).toBe(
        POST_INPUT.capacity - 1,
      );

      // Newest-first ordering (itinerary-list.tsx precedent): a THIRD
      // departure posted after the first must appear before it in browse —
      // without this, row order is DB-unspecified and a just-posted
      // departure can render anywhere in the grid (live-test regression).
      const thirdItinerary = await draftItinerary(agency);
      const third = await callerFor(agency).workspace.groupTravel.post({ itineraryId: thirdItinerary, ...POST_INPUT });
      if (third.status !== "posted") return;
      const finalBrowse = await callerFor(buyer).workspace.groupTravel.browse();
      const ids = finalBrowse.departures.map((d) => d.departureId);
      expect(ids.indexOf(third.departureId)).toBeLessThan(ids.indexOf(posted.departureId));
    },
    LONG,
  );

  it(
    "US4: white-labeling a group departure seeds an INDEPENDENT reseller seat pool (FR-010, SC-004)",
    async () => {
      const seller = await makeAgency("Sunset Journeys");
      const reseller = await makeAgency("Coastal Trails");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      const posted = await callerFor(seller).workspace.groupTravel.post({ itineraryId, ...POST_INPUT });
      if (posted.status !== "posted") return;

      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      const licensed = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licensed.status).toBe("licensed");
      if (licensed.status !== "licensed") return;

      // Existing conservation identity — UNCHANGED (spec 006, reused as-is).
      const [ledgerRow] = await handle.db
        .select()
        .from(revenueShareLedger)
        .where(eq(revenueShareLedger.licenseId, licensed.licenseId));
      expect(ledgerRow?.priceMinor).toBe(ledgerRow!.platformTakeMinor + ledgerRow!.sellerCreditMinor);

      // The reseller's copy carries its OWN independent seat pool, seeded at
      // the ORIGINAL's capacity (not the original's live seatsRemaining).
      const [copyDeparture] = await handle.db
        .select()
        .from(groupDeparture)
        .where(eq(groupDeparture.itineraryId, licensed.copyItineraryId));
      expect(copyDeparture).toMatchObject({
        agencyId: reseller.agencyId,
        capacity: POST_INPUT.capacity,
        seatsRemaining: POST_INPUT.capacity,
        status: "active",
      });

      // The reseller's own clients joining the COPY must not touch the original.
      const resellerJoin = await callerFor(reseller).workspace.groupTravel.join({
        departureId: copyDeparture!.id,
        travelerName: "Reseller's Client",
      });
      expect(resellerJoin.status).toBe("joined");

      const [originalAfter] = await handle.db
        .select({ seatsRemaining: groupDeparture.seatsRemaining })
        .from(groupDeparture)
        .where(eq(groupDeparture.id, posted.departureId));
      expect(originalAfter?.seatsRemaining).toBe(POST_INPUT.capacity); // unaffected
    },
    LONG,
  );

  it(
    "US4: licensing an itinerary WITHOUT a group departure is unaffected (additive no-op)",
    async () => {
      const seller = await makeAgency("Sunset Journeys");
      const reseller = await makeAgency("Coastal Trails");
      await vet(seller.agencyId);
      await vet(reseller.agencyId);
      const itineraryId = await draftItinerary(seller);
      // No groupTravel.post call — ordinary itinerary listing.
      const listed = await callerFor(seller).workspace.marketplace.createListing({ itineraryId, ...LISTING_INPUT });
      if (listed.status !== "listed") return;
      const licensed = await callerFor(reseller).workspace.marketplace.licenseListing({
        listingId: listed.listingId,
      });
      expect(licensed.status).toBe("licensed");
      if (licensed.status !== "licensed") return;

      const copyDepartures = await handle.db
        .select()
        .from(groupDeparture)
        .where(eq(groupDeparture.itineraryId, licensed.copyItineraryId));
      expect(copyDepartures).toHaveLength(0);
    },
    LONG,
  );
});
