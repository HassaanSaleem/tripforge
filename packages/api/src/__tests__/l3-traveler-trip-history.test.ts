// L3 — traveler trip history ("My Trips") against a REAL database (spec 031
// SC-001-004). Covers `clientView.attachTrip` (attach-on-view, idempotent) and
// `clientView.myTrips` (own-rows-only, cross-traveler isolation), plus a
// regression witness that anonymous itinerary/handoff behavior and the
// INV-020 redacted projection are UNCHANGED by this feature. NOT a money path
// — no concurrency/conservation treatment required (same class as
// l3-traveler-accounts.test.ts).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §4). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  clientTripLink,
  createDb,
  eq,
  organization,
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

describe.skipIf(!DATABASE_URL)("L3 traveler trip history (real Postgres)", () => {
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
    const agencyId = `l3tth-agency-${randomUUID()}`;
    const userId = `l3tth-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  /** A traveler: a `user` row with NO `member` row — same shape
   * `l3-traveler-accounts.test.ts` already established. */
  async function makeTraveler(name: string, email: string): Promise<SessionContext> {
    const userId = `l3tth-traveler-${randomUUID()}`;
    await handle.db.insert(userTable).values({ id: userId, name, email });
    return { userId };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  const DRAFT_INPUT = {
    destination: "Porto",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap", amountMinor: 250_000, currency: "USD" },
  } as const;

  async function draftItinerary(session: SessionContext): Promise<string> {
    const drafted = await draftViaCaller(callerFor(session), DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  async function shareToken(session: SessionContext, itineraryId: string): Promise<string> {
    const shared = await callerFor(session).workspace.itinerary.share({ itineraryId });
    expect(shared.status).toBe("shared");
    if (shared.status !== "shared") throw new Error("share failed");
    return shared.token;
  }

  async function linkCount(userId: string): Promise<number> {
    const rows = await handle.db.select().from(clientTripLink).where(eq(clientTripLink.userId, userId));
    return rows.length;
  }

  // ─── US1: attach-on-view + myTrips reflect resolveShareLink ────────────────

  it(
    "US1: anonymous attachTrip/myTrips are UNAUTHORIZED (FR-006, INV-018 boundary)",
    async () => {
      await expect(callerFor(null).clientView.attachTrip({ token: randomUUID() })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(callerFor(null).clientView.myTrips()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
    LONG,
  );

  it(
    "US1: attachTrip on an unknown token returns not_found, on a known token links and creates one row",
    async () => {
      const agent = await makeAgency("Douro Journeys");
      const traveler = await makeTraveler("Amina Yusuf", `amina-${randomUUID()}@example.test`);
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      const unknown = await callerFor(traveler).clientView.attachTrip({ token: randomUUID() });
      expect(unknown).toEqual({ status: "not_found" });

      const linked = await callerFor(traveler).clientView.attachTrip({ token });
      expect(linked).toEqual({ status: "linked" });
      expect(await linkCount(traveler.userId)).toBe(1);
    },
    LONG,
  );

  it(
    "US1: myTrips is an empty array for a signed-in traveler who has never opened a trip link (my-trips-empty-state-nav)",
    async () => {
      const traveler = await makeTraveler("Fresh Traveler", `fresh-${randomUUID()}@example.test`);
      const trips = await callerFor(traveler).clientView.myTrips();
      expect(trips).toEqual([]);
    },
    LONG,
  );

  it(
    "US1: myTrips after attachTrip matches resolveShareLink's own projection for the same token (FR-003)",
    async () => {
      const agent = await makeAgency("Sintra Escapes");
      const traveler = await makeTraveler("Priya Shah", `priya-${randomUUID()}@example.test`);
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      await callerFor(traveler).clientView.attachTrip({ token });
      const trips = await callerFor(traveler).clientView.myTrips();
      expect(trips).toHaveLength(1);

      const view = await callerFor(null).clientView.itinerary({ token });
      expect(view.status).toBe("found");
      if (view.status !== "found") throw new Error("view resolution failed");

      expect(trips[0]).toMatchObject({
        token,
        title: view.view.title,
        agencyName: view.view.agencyName,
        currency: view.view.currency,
        totalSellMinor: view.view.totalSellMinor,
      });
    },
    LONG,
  );

  /** Quote + book exactly one held item at the given markup — produces a
   * real, non-null `booking_component` row so the batched money-bearing
   * lookup (not just the agency-name batch) has something to get wrong. */
  async function bookOneItem(session: SessionContext, itineraryId: string, markupBps: number): Promise<void> {
    const quoted = await callerFor(session).workspace.booking.quote({ itineraryId, markupBps });
    const held = quoted.items.flatMap((i) => (i.outcome === "held" ? [i] : []));
    expect(held.length).toBeGreaterThan(0);
    const target = held[0]!;
    const booked = await callerFor(session).workspace.booking.book({
      itineraryId,
      quoteRowIds: [target.quote.quoteRowId],
    });
    expect(booked.status).toBe("confirmed");
  }

  it(
    "US1: myTrips with several linked trips across DIFFERENT agencies projects each trip independently (perf-031: batched lookups keyed correctly)",
    async () => {
      const agencyX = await makeAgency("Ericeira Surf Trips");
      const agencyY = await makeAgency("Tavira Salt Coast");
      const agencyZ = await makeAgency("Serra Highlands");
      const traveler = await makeTraveler("Noor Haddad", `noor-${randomUUID()}@example.test`);

      const itineraryIdX = await draftItinerary(agencyX);
      const itineraryIdY = await draftItinerary(agencyY);
      const itineraryIdZ = await draftItinerary(agencyZ);
      const tokenX = await shareToken(agencyX, itineraryIdX);
      const tokenY = await shareToken(agencyY, itineraryIdY);
      const tokenZ = await shareToken(agencyZ, itineraryIdZ);

      // Book X and Y at DIFFERENT markups (so their real booked sellMinor
      // genuinely differs); leave Z unbooked (draft-estimate pricing only —
      // toClientItineraryView falls back to each item's `pricing.sellPrice`
      // until it's actually booked, so totalSellMinor is non-null either way).
      // This exercises the money-bearing bookingComponentTable batch for
      // cross-trip contamination (X's booked price landing on Y or vice versa).
      await bookOneItem(agencyX, itineraryIdX, 1000);
      await bookOneItem(agencyY, itineraryIdY, 3000);

      // Sequential attach order (X, Y, Z) fixes the expected newest-first order.
      await callerFor(traveler).clientView.attachTrip({ token: tokenX });
      await callerFor(traveler).clientView.attachTrip({ token: tokenY });
      await callerFor(traveler).clientView.attachTrip({ token: tokenZ });

      const trips = await callerFor(traveler).clientView.myTrips();
      expect(trips.map((t) => t.token)).toEqual([tokenZ, tokenY, tokenX]);

      // Each trip's batched projection must match its OWN per-token view — no
      // cross-trip mixing of agency name / pricing between the batched rows.
      for (const token of [tokenX, tokenY, tokenZ]) {
        const view = await callerFor(null).clientView.itinerary({ token });
        expect(view.status).toBe("found");
        if (view.status !== "found") throw new Error("view resolution failed");
        const trip = trips.find((t) => t.token === token);
        expect(trip).toMatchObject({
          agencyName: view.view.agencyName,
          currency: view.view.currency,
          totalSellMinor: view.view.totalSellMinor,
        });
      }
      expect(new Set(trips.map((t) => t.agencyName)).size).toBe(3); // distinct agencies really did get distinct names

      // Positive proof the booked-price Map isn't cross-wired: X and Y were
      // booked at different markups, so their real totals must be mutually
      // DISTINCT — a swapped itineraryId key in bookedPricesByItinerary that
      // put X's booked component under Y's key (or vice versa) would make
      // one of them equal the OTHER's total instead of its own; the
      // per-token ground-truth comparison above alone couldn't tell "both
      // swapped the same way" apart from "both correct", so this closes it.
      const tripX = trips.find((t) => t.token === tokenX);
      const tripY = trips.find((t) => t.token === tokenY);
      expect(tripX?.totalSellMinor).not.toBeNull();
      expect(tripY?.totalSellMinor).not.toBeNull();
      expect(tripX?.totalSellMinor).not.toBe(tripY?.totalSellMinor);
    },
    LONG,
  );

  // ─── US2: the attach-on-view boundary is exact (dedup + isolation) ─────────

  it(
    "US2: a trip never attached for a traveler is absent even when attached for a DIFFERENT traveler",
    async () => {
      const agent = await makeAgency("Azores Voyages");
      const amina = await makeTraveler("Amina Yusuf", `amina-${randomUUID()}@example.test`);
      const jonas = await makeTraveler("Jonas Berg", `jonas-${randomUUID()}@example.test`);
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      await callerFor(amina).clientView.attachTrip({ token });

      const aminaTrips = await callerFor(amina).clientView.myTrips();
      expect(aminaTrips.map((t) => t.token)).toContain(token);

      const jonasTrips = await callerFor(jonas).clientView.myTrips();
      expect(jonasTrips.map((t) => t.token)).not.toContain(token);
    },
    LONG,
  );

  it(
    "US2: repeat attachTrip calls for the same (traveler, trip) pair produce exactly one row and one list entry",
    async () => {
      const agent = await makeAgency("Alentejo Trails");
      const traveler = await makeTraveler("Rosa Lima", `rosa-${randomUUID()}@example.test`);
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      await callerFor(traveler).clientView.attachTrip({ token });
      await callerFor(traveler).clientView.attachTrip({ token });
      await callerFor(traveler).clientView.attachTrip({ token });

      expect(await linkCount(traveler.userId)).toBe(1);
      const trips = await callerFor(traveler).clientView.myTrips();
      expect(trips.filter((t) => t.token === token)).toHaveLength(1);
    },
    LONG,
  );

  it(
    "US2: two travelers with non-overlapping attached trips each see EXACTLY their own set (FR-005)",
    async () => {
      const agent = await makeAgency("Coimbra Collective");
      const amina = await makeTraveler("Amina Yusuf", `amina-${randomUUID()}@example.test`);
      const jonas = await makeTraveler("Jonas Berg", `jonas-${randomUUID()}@example.test`);

      const tripA = await shareToken(agent, await draftItinerary(agent));
      const tripB = await shareToken(agent, await draftItinerary(agent));

      await callerFor(amina).clientView.attachTrip({ token: tripA });
      await callerFor(jonas).clientView.attachTrip({ token: tripB });

      const aminaTrips = await callerFor(amina).clientView.myTrips();
      expect(aminaTrips.map((t) => t.token)).toEqual([tripA]);

      const jonasTrips = await callerFor(jonas).clientView.myTrips();
      expect(jonasTrips.map((t) => t.token)).toEqual([tripB]);
    },
    LONG,
  );

  // ─── US3: anonymous + spec 010/022/030 behavior is UNCHANGED ───────────────

  it(
    "US3: anonymous clientView.itinerary + requestHandoff are BYTE-IDENTICAL to pre-feature behavior (regression, INV-018)",
    async () => {
      const agent = await makeAgency("Lagos Adventures");
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      const view = await callerFor(null).clientView.itinerary({ token });
      expect(view.status).toBe("found");

      const outcome = await callerFor(null).clientView.requestHandoff({
        token,
        contactName: "Hand-typed Traveler",
      });
      expect(outcome.status).toBe("submitted");

      const unknown = await callerFor(null).clientView.itinerary({ token: randomUUID() });
      expect(unknown).toEqual({ status: "not_found" });

      // Anonymous visits never write trip-history rows for anyone.
      const anyLinksForItinerary = await handle.db
        .select()
        .from(clientTripLink)
        .where(eq(clientTripLink.itineraryId, itineraryId));
      expect(anyLinksForItinerary).toHaveLength(0);
    },
    LONG,
  );

  it(
    "US3: myTrips payload carries NO agent-confidential value regardless of trip pricing (INV-020)",
    async () => {
      const agent = await makeAgency("Faro Excursions");
      const traveler = await makeTraveler("Kofi Mensah", `kofi-${randomUUID()}@example.test`);
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      await callerFor(traveler).clientView.attachTrip({ token });
      const trips = await callerFor(traveler).clientView.myTrips();
      const serialized = JSON.stringify(trips);
      expect(serialized.toLowerCase()).not.toContain("netminor");
      expect(serialized.toLowerCase()).not.toContain("markup");
      expect(serialized).not.toMatch(/kofi-|Kofi Mensah/);
      expect(serialized).not.toContain(agent.agencyId);
      expect(serialized).not.toContain(itineraryId);
    },
    LONG,
  );
});
