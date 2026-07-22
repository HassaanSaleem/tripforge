// L3 — the TRAVELER self-drive money path against a REAL database (spec 036;
// GOAL.md D2.4). A signed-in traveler books a shared itinerary's un-booked
// items through clientView.selfBook, which runs the SAME quote-then-book path
// an agent uses, scoped to the OWNING agency resolved from the share token
// (INV-024: the traveler never invokes a workspace procedure). This suite is a
// money path, so it carries failure-branch conservation assertions (INV-011),
// the ledger identity (markup = sell − net), attribution (owning agency +
// traveler actor), and the INV-020 redaction — not just a happy path.
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §4). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  and,
  count,
  eq,
  booking as bookingTable,
  bookingComponent as bookingComponentTable,
  bookingQuote as bookingQuoteTable,
  createDb,
  itinerary as itineraryTable,
  markupLedger as markupLedgerTable,
  organization,
  pmfEvent,
  user as userTable,
  type DbHandle,
} from "@tripforge/db";
import {
  SANDBOX_FAIL_BOOK_OFFER_ID,
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
  type HotelPort,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { draftViaCaller } from "./draft-helper.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

/** Port-boundary wrapper (identical seam to l3-booking): surface the
 * always-fails-booking fixture so the deterministic planner picks it (cheapest)
 * — lets a self-book exercise partial failure end-to-end. */
function withFailBookOffer(inner: HotelPort): HotelPort {
  return {
    async search(criteria) {
      const offers = await inner.search(criteria);
      return [
        ...offers,
        {
          offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
          content: { title: "Sandbox Always-Fails Hotel" },
          netRate: { amountMinor: 9_900, currency: "USD" },
        },
      ];
    },
    quote: (offerId) => inner.quote(offerId),
    book: (quoteId) => inner.book(quoteId),
    cancel: (bookingId) => inner.cancel(bookingId),
  };
}

describe.skipIf(!DATABASE_URL)("L3 traveler self-book money path (real Postgres + sandbox supply)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(opts: { now?: () => number; failBookHotel?: boolean } = {}): Container {
    const now = opts.now ?? (() => Date.now());
    const hotel = new SandboxHotelAdapter(now);
    return {
      hotel: opts.failBookHotel ? withFailBookOffer(hotel) : hotel,
      activity: new SandboxActivityAdapter(now),
      transfer: new SandboxTransferAdapter(now),
      carRental: new SandboxCarRentalAdapter(now),
      mediaStore: new SandboxMediaStoreAdapter(handle.db),
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: handle.db,
    };
  }

  function callerFor(session: SessionContext | null, container?: Container) {
    return appRouter.createCaller({ session, container: container ?? makeContainer() });
  }

  async function makeAgency(): Promise<SessionContext & { agencyId: string; agencyRole: "member" }> {
    const agencyId = `l3sb-agency-${randomUUID()}`;
    const userId = `l3sb-agent-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name: "L3 SelfBook Agency", slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: "L3 Agent", email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  /** A traveler: a `user` row with NO `member` row (org-less consumer identity). */
  async function makeTraveler(): Promise<SessionContext> {
    const userId = `l3sb-traveler-${randomUUID()}`;
    await handle.db.insert(userTable).values({ id: userId, name: "L3 Traveler", email: `${userId}@example.test` });
    return { userId };
  }

  async function countsFor(agencyId: string) {
    const db = handle.db;
    const [itin] = await db.select({ n: count() }).from(itineraryTable).where(eq(itineraryTable.agencyId, agencyId));
    const [quotes] = await db.select({ n: count() }).from(bookingQuoteTable).where(eq(bookingQuoteTable.agencyId, agencyId));
    const [bookings] = await db.select({ n: count() }).from(bookingTable).where(eq(bookingTable.agencyId, agencyId));
    const [components] = await db
      .select({ n: count() })
      .from(bookingComponentTable)
      .where(eq(bookingComponentTable.agencyId, agencyId));
    const [ledger] = await db.select({ n: count() }).from(markupLedgerTable).where(eq(markupLedgerTable.agencyId, agencyId));
    const [pmf] = await db.select({ n: count() }).from(pmfEvent).where(eq(pmfEvent.agencyId, agencyId));
    return {
      itineraries: Number(itin?.n ?? 0),
      quotes: Number(quotes?.n ?? 0),
      bookings: Number(bookings?.n ?? 0),
      components: Number(components?.n ?? 0),
      ledger: Number(ledger?.n ?? 0),
      pmfEvents: Number(pmf?.n ?? 0),
    };
  }

  const DRAFT_INPUT = {
    destination: "Paris",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
  } as const;

  async function draftAndShare(
    session: SessionContext,
    container?: Container,
  ): Promise<{ itineraryId: string; token: string }> {
    const caller = callerFor(session, container);
    const drafted = await draftViaCaller(caller, DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    const itineraryId = drafted.itinerary.id;
    const shared = await caller.workspace.itinerary.share({ itineraryId });
    expect(shared.status).toBe("shared");
    if (shared.status !== "shared") throw new Error("share failed");
    return { itineraryId, token: shared.token };
  }

  // ── Happy path: a traveler self-books an un-booked shared proposal ──────────
  it(
    "a signed-in traveler self-books all bookable items — exact deltas, owning-agency attribution, traveler actor, ledger identity",
    async () => {
      const agent = await makeAgency();
      const traveler = await makeTraveler();
      // Draft + share WITHOUT booking → the traveler has real work to self-book.
      const { itineraryId, token } = await draftAndShare(agent);

      const before = await countsFor(agent.agencyId);
      expect(before).toEqual({ itineraries: 1, quotes: 0, bookings: 0, components: 0, ledger: 0, pmfEvents: 1 });

      const outcome = await callerFor(traveler).clientView.selfBook({ token });
      expect(outcome.status).toBe("confirmed");
      if (outcome.status !== "confirmed") return;
      const confirmed = outcome.legs.filter((l) => l.outcome === "confirmed");
      expect(confirmed.length).toBeGreaterThanOrEqual(3);
      expect(outcome.legs.every((l) => l.outcome === "confirmed")).toBe(true);
      const c = confirmed.length;

      // Exact state deltas — all attributed to the OWNING agency (INV-004).
      const after = await countsFor(agent.agencyId);
      expect(after).toEqual({
        itineraries: 1,
        quotes: c,
        bookings: 1,
        components: c,
        ledger: c,
        pmfEvents: 1 + c, // trip_created + booking_confirmed per component
      });

      // totalChargedMinor equals the sum of confirmed leg sells.
      const legSum = confirmed.reduce((s, l) => s + (l.outcome === "confirmed" ? l.sellMinor : 0), 0);
      expect(outcome.totalChargedMinor).toBe(legSum);
      expect(outcome.totalChargedMinor).toBeGreaterThan(0);

      // Ledger identity: markup = sell − net exactly, per row.
      const ledgerRows = await handle.db
        .select()
        .from(markupLedgerTable)
        .where(eq(markupLedgerTable.agencyId, agent.agencyId));
      expect(ledgerRows).toHaveLength(c);
      for (const row of ledgerRows) {
        expect(row.markupMinor).toBe(row.sellMinor - row.netMinor);
      }

      // The booking is attributed to the owning agency, and the ACTOR is the
      // traveler — not the agent (client-ownership attribution, GBV counts).
      const bookedEvents = await handle.db
        .select({ actorUserId: pmfEvent.actorUserId, itineraryId: pmfEvent.itineraryId })
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, agent.agencyId), eq(pmfEvent.type, "booking_confirmed")));
      expect(bookedEvents).toHaveLength(c);
      expect(bookedEvents.every((e) => e.actorUserId === traveler.userId)).toBe(true);
      expect(bookedEvents.every((e) => e.itineraryId === itineraryId)).toBe(true);

      // Redaction (INV-020): no confidential field crosses the boundary.
      const serialized = JSON.stringify(outcome).toLowerCase();
      for (const forbidden of ["netminor", "markup", "merchantofrecord", "supplierbookingid", "offerid", "supplyref"]) {
        expect(serialized).not.toContain(forbidden);
      }
    },
    LONG,
  );

  // ── Partial failure: a failed leg is never charged, others confirm ─────────
  it(
    "partial failure: the failing leg reports a client-safe reason and writes ZERO rows; siblings confirm (INV-011)",
    async () => {
      const agent = await makeAgency();
      const traveler = await makeTraveler();
      // The fail-book hotel (9 900) is the cheapest → the planner picks it.
      const { itineraryId, token } = await draftAndShare(agent, makeContainer({ failBookHotel: true }));

      const outcome = await callerFor(traveler, makeContainer({ failBookHotel: true })).clientView.selfBook({ token });
      expect(outcome.status).toBe("partially_confirmed");
      if (outcome.status !== "partially_confirmed") return;
      const failed = outcome.legs.filter((l) => l.outcome === "failed");
      const confirmed = outcome.legs.filter((l) => l.outcome === "confirmed");
      expect(failed).toHaveLength(1);
      const failedLeg = failed[0];
      expect(failedLeg).toBeDefined();
      if (!failedLeg || failedLeg.outcome !== "failed") throw new Error("expected a failed leg");
      expect(failedLeg.reason).toBe("supplier_unavailable");
      expect(confirmed.length).toBeGreaterThan(0);

      // The failed leg contributed ZERO rows to any money table.
      const counts = await countsFor(agent.agencyId);
      expect(counts.components).toBe(confirmed.length);
      expect(counts.ledger).toBe(confirmed.length);
      expect(counts.pmfEvents).toBe(1 + confirmed.length); // trip_created + confirmed only

      // totalChargedMinor excludes the failed leg (only confirmed sells).
      const legSum = confirmed.reduce((s, l) => s + (l.outcome === "confirmed" ? l.sellMinor : 0), 0);
      expect(outcome.totalChargedMinor).toBe(legSum);

      // The failed item's hold was released (unconsumed) — bookable again.
      const failItemId = failedLeg.itemId;
      const failHolds = await handle.db
        .select({ consumedAt: bookingQuoteTable.consumedAt })
        .from(bookingQuoteTable)
        .where(and(eq(bookingQuoteTable.itineraryId, itineraryId), eq(bookingQuoteTable.itemId, failItemId)));
      expect(failHolds.length).toBeGreaterThan(0);
      expect(failHolds.every((r) => r.consumedAt === null)).toBe(true);
    },
    LONG,
  );

  // ── Total failure: nothing charged, zero rows (all holds expired) ──────────
  it(
    "total failure: every leg expired → status failed, ZERO new money rows, holds released (all-fail conservation)",
    async () => {
      const agent = await makeAgency();
      const traveler = await makeTraveler();
      const { itineraryId, token } = await draftAndShare(agent);
      const before = await countsFor(agent.agencyId);

      // A stale-clock container: every hold the self-book mints is born expired
      // vs server now → bookItinerary fails all with quote_expired.
      const past = Date.now() - 3_600_000;
      const outcome = await callerFor(traveler, makeContainer({ now: () => past })).clientView.selfBook({ token });
      expect(outcome.status).toBe("failed");
      if (outcome.status !== "failed") return;
      expect(outcome.legs.length).toBeGreaterThan(0);
      expect(outcome.legs.every((l) => l.outcome === "failed" && l.reason === "price_changed")).toBe(true);
      expect(outcome.totalChargedMinor).toBe(0);

      // All-fail conservation: no booking/component/ledger/booking-pmf written.
      const after = await countsFor(agent.agencyId);
      expect(after.bookings).toBe(before.bookings);
      expect(after.components).toBe(before.components);
      expect(after.ledger).toBe(before.ledger);
      expect(after.pmfEvents).toBe(before.pmfEvents); // still just trip_created

      // Every hold released (unconsumed).
      const holds = await handle.db
        .select({ consumedAt: bookingQuoteTable.consumedAt })
        .from(bookingQuoteTable)
        .where(eq(bookingQuoteTable.itineraryId, itineraryId));
      expect(holds.length).toBeGreaterThan(0);
      expect(holds.every((r) => r.consumedAt === null)).toBe(true);
    },
    LONG,
  );

  // ── Nothing to book: a fully agent-booked itinerary is a clean no-op ───────
  it(
    "an itinerary the agent already booked in full yields nothing_to_book with zero new rows",
    async () => {
      const agent = await makeAgency();
      const traveler = await makeTraveler();
      const agentCaller = callerFor(agent);
      const drafted = await draftViaCaller(agentCaller, DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await agentCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") return;
      const quoteRowIds = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
      const booked = await agentCaller.workspace.booking.book({ itineraryId, quoteRowIds });
      expect(booked.status).toBe("confirmed");
      const shared = await agentCaller.workspace.itinerary.share({ itineraryId });
      if (shared.status !== "shared") throw new Error("share failed");

      const before = await countsFor(agent.agencyId);
      const outcome = await callerFor(traveler).clientView.selfBook({ token: shared.token });
      expect(outcome).toEqual({ status: "nothing_to_book" });
      expect(await countsFor(agent.agencyId)).toEqual(before);
    },
    LONG,
  );

  // ── Auth + not_found ───────────────────────────────────────────────────────
  it(
    "self-book is UNAUTHORIZED for an anonymous caller and not_found for an unknown token (FR-009, no existence oracle)",
    async () => {
      await expect(callerFor(null).clientView.selfBook({ token: randomUUID() })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      const traveler = await makeTraveler();
      const outcome = await callerFor(traveler).clientView.selfBook({ token: randomUUID() });
      expect(outcome).toEqual({ status: "not_found" });
    },
    LONG,
  );
});
