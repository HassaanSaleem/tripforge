// L3 — the money path against a REAL database (spec 005 FR-011/014; quality
// bar Money-Safe: unit-test-only coverage of money paths fails review).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (the compose
// stack; see quickstart §4 — `docker run --network <stack> -e DATABASE_URL=…`).
// Skipping without the env is loud in the summary, never silent green.
//
// Controllability: containers are built per test with controllable sandbox
// clocks and scriptable FakeLLM drafts; a port-boundary wrapper surfaces the
// deterministic fail-book offer in search results so partial failure can be
// exercised end-to-end (test double at the PORT boundary — the allowed seam).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  and,
  count,
  eq,
  inArray,
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
  SandboxTransferAdapter,
  type HotelPort,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";
import type { Db } from "@tripforge/db";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

/** Port-boundary wrapper: expose the always-fails-booking fixture in search
 * results so the deterministic planner picks it (cheapest) — INV-007 tests. */
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

describe.skipIf(!DATABASE_URL)("L3 money path (real Postgres + sandbox supply)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(opts: { now?: () => number; llm?: FakeLLM; failBookHotel?: boolean } = {}): Container {
    const now = opts.now ?? (() => Date.now());
    const hotel = new SandboxHotelAdapter(now);
    return {
      hotel: opts.failBookHotel ? withFailBookOffer(hotel) : hotel,
      activity: new SandboxActivityAdapter(now),
      transfer: new SandboxTransferAdapter(now),
      carRental: new SandboxCarRentalAdapter(now),
      llm: opts.llm ?? new FakeLLM(),
      rates: STATIC_RATES,
      db: handle.db,
    };
  }

  /** Container plus direct references to its sandbox adapters, so tests can
   * inspect SUPPLIER-side state (live bookings) — the seed-0005d conservation
   * witness the port interface deliberately does not expose. */
  function makeSupplierSet() {
    const hotel = new SandboxHotelAdapter();
    const activity = new SandboxActivityAdapter();
    const transfer = new SandboxTransferAdapter();
    const carRental = new SandboxCarRentalAdapter();
    const container: Container = {
      hotel,
      activity,
      transfer,
      carRental,
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: handle.db,
    };
    const liveSupplierBookings = () =>
      hotel.liveBookingIds().length +
      activity.liveBookingIds().length +
      transfer.liveBookingIds().length +
      carRental.liveBookingIds().length;
    return { container, liveSupplierBookings };
  }

  /** Wrap a real Db so its Nth `transaction` call throws — simulating the
   * database dropping between the supplier booking and the money-row write
   * (bookItinerary's claim tx is call 1, the recording tx is call 2). All
   * other members delegate to the real handle. */
  function withTxFailureOn(db: Db, failingCall: number): Db {
    let calls = 0;
    return new Proxy(db, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === "transaction") {
          return (...args: unknown[]): unknown => {
            calls += 1;
            if (calls === failingCall) {
              throw new Error("injected: database unavailable at write time");
            }
            return (value as (...inner: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof value === "function" ? (value as (...inner: unknown[]) => unknown).bind(target) : value;
      },
    });
  }

  async function makeAgency(): Promise<SessionContext & { agencyId: string; agencyRole: "member" }> {
    const agencyId = `l3-agency-${randomUUID()}`;
    const userId = `l3-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name: "L3 Agency", slug: agencyId });
    // PMF events FK actor_user_id → user.id, so the session's user must exist.
    await handle.db
      .insert(userTable)
      .values({ id: userId, name: "L3 User", email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
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

  it(
    "walks draft → quote → book with exact state deltas, ledger identity, and double-book conservation",
    async () => {
      const session = await makeAgency();
      const container = makeContainer();
      const caller = appRouter.createCaller({ session, container });

      // ── draft (US1): itinerary +1, pmf trip_created +1, nothing else ──────
      const drafted = await caller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const allocSum = drafted.itinerary.pricing.categories.reduce((a, c) => a + c.allocated.amountMinor, 0);
      expect(allocSum).toBe(100_000);
      let counts = await countsFor(session.agencyId);
      expect(counts).toEqual({ itineraries: 1, quotes: 0, bookings: 0, components: 0, ledger: 0, pmfEvents: 1 });

      // ── quote (US2): one hold per bookable item, conversion recorded ──────
      const itineraryId = drafted.itinerary.id;
      const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") return;
      const held = quoted.items.filter((i) => i.outcome === "held");
      expect(held.length).toBeGreaterThanOrEqual(3);
      expect(quoted.items.every((i) => i.outcome === "held")).toBe(true);
      // EUR activities carry the explicit conversion rate (FR-008).
      const withRate = held.filter((h) => h.outcome === "held" && h.quote.netCurrency === "EUR");
      expect(withRate.length).toBeGreaterThan(0);
      for (const h of withRate) {
        if (h.outcome !== "held") continue;
        expect(h.quote.rate).toEqual({ numerator: 108, denominator: 100 });
        expect(h.quote.currency).toBe("USD");
      }
      counts = await countsFor(session.agencyId);
      expect(counts.quotes).toBe(held.length);

      // ── book (US2): one tx — booking, components, ledger, PMF events ─────
      const quoteRowIds = held.flatMap((h) => (h.outcome === "held" ? [h.quote.quoteRowId] : []));
      const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds });
      expect(booked.status).toBe("confirmed");
      expect(booked.components.every((c) => c.outcome === "confirmed")).toBe(true);
      counts = await countsFor(session.agencyId);
      expect(counts).toEqual({
        itineraries: 1,
        quotes: held.length,
        bookings: 1,
        components: held.length,
        ledger: held.length,
        pmfEvents: 1 + held.length, // trip_created + booking_confirmed per component
      });

      // Ledger identity (SC-005): markup = sell − net exactly, per row.
      const ledgerRows = await handle.db
        .select()
        .from(markupLedgerTable)
        .where(eq(markupLedgerTable.agencyId, session.agencyId));
      for (const row of ledgerRows) {
        expect(row.markupMinor).toBe(row.sellMinor - row.netMinor);
        expect(row.currency).toBe("USD");
      }

      // booking_confirmed events carry sell amounts in the itinerary currency.
      const bookedEvents = await handle.db
        .select()
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, session.agencyId), eq(pmfEvent.type, "booking_confirmed")));
      expect(bookedEvents).toHaveLength(held.length);
      for (const ev of bookedEvents) {
        expect(ev.currency).toBe("USD");
        expect(ev.itineraryId).toBe(itineraryId);
      }

      // ── double-book (SC-004): typed failure, ZERO state delta ────────────
      const before = await countsFor(session.agencyId);
      const again = await caller.workspace.booking.book({ itineraryId, quoteRowIds });
      expect(again.status).toBe("failed");
      expect(again.components.every((c) => c.outcome === "failed" && c.reason === "already_consumed")).toBe(true);
      expect(await countsFor(session.agencyId)).toEqual(before);
    },
    LONG,
  );

  it(
    "expired holds: typed failure + conservation, then re-quote → book succeeds (US2 AC-3, D6)",
    async () => {
      const session = await makeAgency();
      // Engine clock 1h in the past: every hold is born expired vs server now.
      const past = Date.now() - 3_600_000;
      const staleContainer = makeContainer({ now: () => past });
      const staleCaller = appRouter.createCaller({ session, container: staleContainer });

      const drafted = await staleCaller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await staleCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const quoteRowIds = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
      expect(quoteRowIds.length).toBeGreaterThan(0);

      const before = await countsFor(session.agencyId);
      const booked = await staleCaller.workspace.booking.book({ itineraryId, quoteRowIds });
      expect(booked.status).toBe("failed");
      expect(booked.components.every((c) => c.outcome === "failed" && c.reason === "quote_expired")).toBe(true);
      // All-fail conservation (FR-011): nothing written anywhere.
      expect(await countsFor(session.agencyId)).toEqual(before);

      // Expired unconsumed rows are never served (spec 005 quote lifecycle;
      // contract §2 serves active + consumed only) — expiry only re-quotes.
      const expiredView = await staleCaller.workspace.itinerary.get({ itineraryId });
      expect(expiredView.quotes).toHaveLength(0);

      // Re-quote with a FRESH container (fresh process simulation — research
      // D6: re-search re-registers offers on new engine instances) → book.
      const freshCaller = appRouter.createCaller({ session, container: makeContainer() });
      const requoted = await freshCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (requoted.status !== "quoted") return;
      const freshIds = requoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
      expect(freshIds.length).toBe(quoteRowIds.length);
      const rebooked = await freshCaller.workspace.booking.book({ itineraryId, quoteRowIds: freshIds });
      expect(rebooked.status).toBe("confirmed");

      // Consumed rows stay served after their hold window would lapse; the
      // expired unconsumed originals stay excluded (contract §2).
      const consumedView = await freshCaller.workspace.itinerary.get({ itineraryId });
      expect(consumedView.quotes.map((q) => q.quoteRowId).sort()).toEqual([...freshIds].sort());
      expect(consumedView.quotes.every((q) => q.consumed)).toBe(true);
    },
    LONG,
  );

  it(
    "partial failure: failing component reports typed reason and writes ZERO rows; siblings confirm (US3)",
    async () => {
      const session = await makeAgency();
      const container = makeContainer({ failBookHotel: true });
      const caller = appRouter.createCaller({ session, container });

      // The fail-book fixture (9 900) is now the cheapest hotel → the
      // deterministic planner picks it.
      const drafted = await caller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const failItem = drafted.itinerary.days
        .flatMap((d) => d.items)
        .find((i) => i.supplyRef?.externalId === SANDBOX_FAIL_BOOK_OFFER_ID);
      expect(failItem).toBeDefined();

      const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const heldIds = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
      const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds: heldIds });
      expect(booked.status).toBe("partially_confirmed");

      const failed = booked.components.filter((c) => c.outcome === "failed");
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ itemId: failItem?.id, reason: "supplier_rejected" });
      const confirmed = booked.components.filter((c) => c.outcome === "confirmed");
      expect(confirmed.length).toBe(heldIds.length - 1);

      // The failed component contributed zero rows to ANY table (FR-011).
      const counts = await countsFor(session.agencyId);
      expect(counts.components).toBe(confirmed.length);
      expect(counts.ledger).toBe(confirmed.length);
      expect(counts.pmfEvents).toBe(1 + confirmed.length);
      const failedComponents = await handle.db
        .select()
        .from(bookingComponentTable)
        .where(and(eq(bookingComponentTable.agencyId, session.agencyId), eq(bookingComponentTable.itemId, failItem?.id ?? "")));
      expect(failedComponents).toHaveLength(0);
    },
    LONG,
  );

  it(
    "hallucinated offers are dropped at verification; an all-hallucinated draft persists nothing (SC-002)",
    async () => {
      const session = await makeAgency();
      const scripted = new FakeLLM({
        plannerScripts: [
          {
            status: "drafted",
            draft: {
              title: "Mostly made up",
              days: [
                {
                  items: [
                    { port: "hotel", offerId: "paris-002" },
                    { port: "hotel", offerId: "totally-fabricated" },
                    { port: "activity", offerId: "also-fake" },
                  ],
                },
              ],
            },
            usage: { inputTokens: 0, outputTokens: 0 },
          },
          {
            status: "drafted",
            draft: { title: "All made up", days: [{ items: [{ port: "hotel", offerId: "nope" }] }] },
            usage: { inputTokens: 0, outputTokens: 0 },
          },
        ],
      });
      const caller = appRouter.createCaller({ session, container: makeContainer({ llm: scripted }) });

      const first = await caller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(first.status).toBe("drafted");
      if (first.status !== "drafted") return;
      const items = first.itinerary.days.flatMap((d) => d.items);
      expect(items).toHaveLength(1);
      expect(items[0]?.supplyRef?.externalId).toBe("paris-002");

      const before = await countsFor(session.agencyId);
      const second = await caller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(second).toEqual({ status: "planner_failed", reason: "no_proposals" });
      expect(await countsFor(session.agencyId)).toEqual(before); // zero writes
    },
    LONG,
  );

  it(
    "re-balancing is visible in the draft response and never touches the flights reserve (US4)",
    async () => {
      const session = await makeAgency();
      const caller = appRouter.createCaller({ session, container: makeContainer() });
      // 30 000 hard cap: accommodation band (10 500) < cheapest hotel (12 500)
      // → buffer/local donors cover it; a later activity is dropped at the cap.
      const drafted = await caller.workspace.itinerary.draft({
        ...DRAFT_INPUT,
        budget: { mode: "hardCap", amountMinor: 30_000, currency: "USD" },
      });
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      expect(drafted.fit.rebalances.length).toBeGreaterThan(0);
      expect(drafted.fit.rebalances.every((m) => m.from !== "flightsTransport")).toBe(true);
      const accommodation = drafted.fit.categories.find((c) => c.category === "accommodation");
      expect(accommodation?.state).toBe("fits");
      // Hard cap conserved: total allocations unchanged.
      const sum = drafted.itinerary.pricing.categories.reduce((a, c) => a + c.allocated.amountMinor, 0);
      expect(sum).toBe(30_000);
      // Spend never exceeds the cap.
      const spent = drafted.itinerary.pricing.categories.reduce((a, c) => a + (c.spent?.amountMinor ?? 0), 0);
      expect(spent).toBeLessThanOrEqual(30_000);
    },
    LONG,
  );

  it(
    "books a live hold from a FRESH server process, without re-quoting (INV-028 — the Vercel quote→book sequence)",
    async () => {
      const session = await makeAgency();
      // Container A quotes; container B books. Fresh sandbox adapters mean the
      // supplier's in-process memory is EMPTY at book time — exactly what a
      // separate serverless invocation sees. The persisted hold must still book.
      const quoteCaller = appRouter.createCaller({ session, container: makeContainer() });
      const drafted = await quoteCaller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await quoteCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const held = quoted.items.filter((i) => i.outcome === "held");
      const quoteRowIds = held.flatMap((h) => (h.outcome === "held" ? [h.quote.quoteRowId] : []));
      expect(quoteRowIds.length).toBeGreaterThanOrEqual(3);

      const bookCaller = appRouter.createCaller({ session, container: makeContainer() });
      const booked = await bookCaller.workspace.booking.book({ itineraryId, quoteRowIds });
      expect(booked.status).toBe("confirmed");
      expect(booked.components.every((c) => c.outcome === "confirmed")).toBe(true);

      // Exact deltas — the re-established holds recorded once, ledger identity intact.
      const counts = await countsFor(session.agencyId);
      expect(counts).toEqual({
        itineraries: 1,
        quotes: held.length,
        bookings: 1,
        components: held.length,
        ledger: held.length,
        pmfEvents: 1 + held.length,
      });
      const ledgerRows = await handle.db
        .select()
        .from(markupLedgerTable)
        .where(eq(markupLedgerTable.agencyId, session.agencyId));
      for (const row of ledgerRows) {
        expect(row.markupMinor).toBe(row.sellMinor - row.netMinor);
      }
    },
    LONG,
  );

  it(
    "duplicate quoteRowIds in one request record money exactly once (FR-009 dedupe)",
    async () => {
      const session = await makeAgency();
      const caller = appRouter.createCaller({ session, container: makeContainer() });
      const drafted = await caller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const firstHeld = quoted.items.find((i) => i.outcome === "held");
      expect(firstHeld).toBeDefined();
      if (!firstHeld || firstHeld.outcome !== "held") return;
      const id = firstHeld.quote.quoteRowId;

      // [id, id] is ONE hold: one component, one ledger row, one PMF event.
      const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds: [id, id] });
      expect(booked.status).toBe("confirmed");
      expect(booked.components).toHaveLength(1);
      const counts = await countsFor(session.agencyId);
      expect(counts.bookings).toBe(1);
      expect(counts.components).toBe(1);
      expect(counts.ledger).toBe(1);
      expect(counts.pmfEvents).toBe(1 + 1); // trip_created + ONE booking_confirmed
      const ledgerRows = await handle.db
        .select()
        .from(markupLedgerTable)
        .where(eq(markupLedgerTable.agencyId, session.agencyId));
      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows[0]?.markupMinor).toBe((ledgerRows[0]?.sellMinor ?? 0) - (ledgerRows[0]?.netMinor ?? 0));
    },
    LONG,
  );

  it(
    "two concurrent book requests for the same holds record them exactly once (FR-009 atomic consume)",
    async () => {
      const session = await makeAgency();
      const quoteCaller = appRouter.createCaller({ session, container: makeContainer() });
      const drafted = await quoteCaller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await quoteCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const held = quoted.items.filter((i) => i.outcome === "held");
      const quoteRowIds = held.flatMap((h) => (h.outcome === "held" ? [h.quote.quoteRowId] : []));

      // Two fresh containers = two serverless instances racing the same cart.
      const callerA = appRouter.createCaller({ session, container: makeContainer() });
      const callerB = appRouter.createCaller({ session, container: makeContainer() });
      const [a, b] = await Promise.all([
        callerA.workspace.booking.book({ itineraryId, quoteRowIds }),
        callerB.workspace.booking.book({ itineraryId, quoteRowIds }),
      ]);

      // Exactly one winner, regardless of interleaving; the loser reports
      // typed failures and writes nothing.
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(["confirmed", "failed"]);
      const counts = await countsFor(session.agencyId);
      expect(counts.bookings).toBe(1);
      expect(counts.components).toBe(held.length);
      expect(counts.ledger).toBe(held.length);
      expect(counts.pmfEvents).toBe(1 + held.length);
    },
    LONG,
  );

  it(
    "concurrent fresh-process books reach the supplier ONCE per hold — the loser books nothing external (seed-0005d)",
    async () => {
      const session = await makeAgency();
      const quoteCaller = appRouter.createCaller({ session, container: makeContainer() });
      const drafted = await quoteCaller.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await quoteCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const held = quoted.items.filter((i) => i.outcome === "held");
      const quoteRowIds = held.flatMap((h) => (h.outcome === "held" ? [h.quote.quoteRowId] : []));
      expect(quoteRowIds.length).toBeGreaterThanOrEqual(3);

      // Two fresh processes race the same cart. Each has EMPTY supplier
      // memory, so under book-before-consume each would re-establish DISTINCT
      // fresh supplier quotes and BOTH would book externally (quoteId
      // idempotency cannot dedupe them) — leaving the loser's supplier
      // booking recorded nowhere. Reserve-then-book must decide the race in
      // the database first, keeping the loser off the supplier entirely.
      const supplierA = makeSupplierSet();
      const supplierB = makeSupplierSet();
      const callerA = appRouter.createCaller({ session, container: supplierA.container });
      const callerB = appRouter.createCaller({ session, container: supplierB.container });
      const [a, b] = await Promise.all([
        callerA.workspace.booking.book({ itineraryId, quoteRowIds }),
        callerB.workspace.booking.book({ itineraryId, quoteRowIds }),
      ]);

      expect([a.status, b.status].sort()).toEqual(["confirmed", "failed"]);
      const loser = a.status === "failed" ? a : b;
      expect(loser.components.every((c) => c.outcome === "failed" && c.reason === "already_consumed")).toBe(true);

      // THE conservation assertion (FR-009/FR-011/INV-011): across every
      // supplier the racers touched there is exactly ONE live booking per
      // hold — an unrecorded external booking cannot exist.
      expect(supplierA.liveSupplierBookings() + supplierB.liveSupplierBookings()).toBe(held.length);

      // And the database records that one set exactly once.
      const counts = await countsFor(session.agencyId);
      expect(counts.bookings).toBe(1);
      expect(counts.components).toBe(held.length);
      expect(counts.ledger).toBe(held.length);
      expect(counts.pmfEvents).toBe(1 + held.length);
    },
    LONG,
  );

  /** Quote the itinerary twice before booking — re-quoting mints fresh holds
   * without consuming the old ones, leaving TWO live holds per item (the
   * FR-016 / spec-gap-0002 setup). Returns per-item hold-id pairs. */
  async function draftWithTwoHoldsPerItem(caller: ReturnType<typeof appRouter.createCaller>) {
    const drafted = await caller.workspace.itinerary.draft(DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") return undefined;
    const itineraryId = drafted.itinerary.id;
    const heldOf = async () => {
      const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") return new Map<string, string>();
      return new Map(
        quoted.items.flatMap((i) => (i.outcome === "held" ? [[i.itemId, i.quote.quoteRowId] as const] : [])),
      );
    };
    const first = await heldOf();
    const second = await heldOf();
    expect(first.size).toBeGreaterThanOrEqual(3);
    expect(second.size).toBe(first.size);
    const items = [...first.keys()];
    return {
      itineraryId,
      items,
      firstIds: items.map((i) => first.get(i) as string),
      secondIds: items.map((i) => second.get(i) as string),
    };
  }

  it(
    "a second live hold for an already-booked item fails item_already_booked with zero delta (FR-016/SC-009, spec-gap-0002)",
    async () => {
      const session = await makeAgency();
      const caller = appRouter.createCaller({ session, container: makeContainer() });
      const setup = await draftWithTwoHoldsPerItem(caller);
      if (!setup) return;
      const { itineraryId, firstIds, secondIds } = setup;

      const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds: firstIds });
      expect(booked.status).toBe("confirmed");

      // The second holds are alive and unexpired — booking them must refuse
      // every item typed, write nothing, and never reach the supplier.
      const supplier = makeSupplierSet();
      const loserCaller = appRouter.createCaller({ session, container: supplier.container });
      const before = await countsFor(session.agencyId);
      const again = await loserCaller.workspace.booking.book({ itineraryId, quoteRowIds: secondIds });
      expect(again.status).toBe("failed");
      expect(again.components).toHaveLength(secondIds.length);
      expect(again.components.every((c) => c.outcome === "failed" && c.reason === "item_already_booked")).toBe(true);
      expect(await countsFor(session.agencyId)).toEqual(before);
      expect(supplier.liveSupplierBookings()).toBe(0);
      // The refused holds were never claimed — consumed_at stays NULL.
      const secondRows = await handle.db
        .select({ consumedAt: bookingQuoteTable.consumedAt })
        .from(bookingQuoteTable)
        .where(inArray(bookingQuoteTable.id, secondIds));
      expect(secondRows.every((r) => r.consumedAt === null)).toBe(true);

      // DB backstop witness (FR-016): even a direct write of a second
      // component for a booked item is refused by UNIQUE (itinerary_id, item_id).
      const [component] = await handle.db
        .select()
        .from(bookingComponentTable)
        .where(eq(bookingComponentTable.agencyId, session.agencyId))
        .limit(1);
      expect(component).toBeDefined();
      if (!component) return;
      const conflictingQuoteRowId = secondIds[setup.items.indexOf(component.itemId)];
      expect(conflictingQuoteRowId).toBeDefined();
      await expect(
        handle.db.insert(bookingComponentTable).values({
          bookingId: component.bookingId,
          agencyId: session.agencyId,
          itineraryId,
          itemId: component.itemId,
          port: component.port,
          offerId: component.offerId,
          quoteRowId: conflictingQuoteRowId as string,
          supplierBookingId: "backstop-direct-write",
          netMinor: component.netMinor,
          netCurrency: component.netCurrency,
          sellMinor: component.sellMinor,
          currency: component.currency,
          merchantOfRecord: component.merchantOfRecord,
        }),
      ).rejects.toThrow(/booking_component_itinerary_item_idx|duplicate key/);
    },
    LONG,
  );

  it(
    "one request carrying two live holds for the same item books it exactly once (FR-016 within-request reduction)",
    async () => {
      const session = await makeAgency();
      const caller = appRouter.createCaller({ session, container: makeContainer() });
      const setup = await draftWithTwoHoldsPerItem(caller);
      if (!setup) return;
      const { itineraryId, firstIds, secondIds } = setup;

      // Interleave the pairs: per item the FIRST occurrence proceeds and the
      // later same-item hold fails typed (mirrors the FR-009 duplicate rule).
      const interleaved = firstIds.flatMap((id, i) => [id, secondIds[i] as string]);
      const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds: interleaved });
      expect(booked.status).toBe("partially_confirmed");
      const confirmed = booked.components.filter((c) => c.outcome === "confirmed");
      const refused = booked.components.filter((c) => c.outcome === "failed");
      expect(confirmed.map((c) => c.quoteRowId).sort()).toEqual([...firstIds].sort());
      expect(refused.map((c) => c.quoteRowId).sort()).toEqual([...secondIds].sort());
      expect(refused.every((c) => c.reason === "item_already_booked")).toBe(true);
      // Every item recorded exactly once, money conserved.
      const counts = await countsFor(session.agencyId);
      expect(counts.bookings).toBe(1);
      expect(counts.components).toBe(firstIds.length);
      expect(counts.ledger).toBe(firstIds.length);
      expect(counts.pmfEvents).toBe(1 + firstIds.length);
    },
    LONG,
  );

  it(
    "two concurrent books holding DIFFERENT live holds for the same items confirm each item exactly once (FR-016 claim-time race)",
    async () => {
      const session = await makeAgency();
      const quoteCaller = appRouter.createCaller({ session, container: makeContainer() });
      const setup = await draftWithTwoHoldsPerItem(quoteCaller);
      if (!setup) return;
      const { itineraryId, firstIds, secondIds } = setup;

      // Distinct hold sets defeat FR-009's per-hold consume — only the FR-016
      // item gate can decide this race. Each racer is a fresh process with its
      // own supplier memory (the seed-0005d conservation witness).
      const supplierA = makeSupplierSet();
      const supplierB = makeSupplierSet();
      const callerA = appRouter.createCaller({ session, container: supplierA.container });
      const callerB = appRouter.createCaller({ session, container: supplierB.container });
      const [a, b] = await Promise.all([
        callerA.workspace.booking.book({ itineraryId, quoteRowIds: firstIds }),
        callerB.workspace.booking.book({ itineraryId, quoteRowIds: secondIds }),
      ]);

      // The claim transactions share the sibling-hold lock set, so they
      // serialize: one cart wins every item; the loser fails typed WITHOUT
      // reaching the supplier.
      expect([a.status, b.status].sort()).toEqual(["confirmed", "failed"]);
      const loser = a.status === "failed" ? a : b;
      expect(loser.components.every((c) => c.outcome === "failed" && c.reason === "item_already_booked")).toBe(true);
      const counts = await countsFor(session.agencyId);
      expect(counts.bookings).toBe(1);
      expect(counts.components).toBe(firstIds.length);
      expect(counts.ledger).toBe(firstIds.length);
      expect(counts.pmfEvents).toBe(1 + firstIds.length);
      // Exactly one live supplier booking per item across both racers — the
      // losing cart never produced an external booking (FR-011/INV-011).
      expect(supplierA.liveSupplierBookings() + supplierB.liveSupplierBookings()).toBe(firstIds.length);
    },
    LONG,
  );

  it(
    "recording-tx failure after supplier booking compensates: zero live supplier bookings, claims released, zero money rows (FR-011 failure branch)",
    async () => {
      const session = await makeAgency();
      const supplier = makeSupplierSet();
      const setup = appRouter.createCaller({ session, container: supplier.container });
      const drafted = await setup.workspace.itinerary.draft(DRAFT_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;
      const quoted = await setup.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      if (quoted.status !== "quoted") return;
      const quoteRowIds = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
      expect(quoteRowIds.length).toBeGreaterThanOrEqual(3);

      // The book call's claim tx succeeds; the recording tx (call 2) fails —
      // the supplier bookings were already made and MUST NOT survive.
      const bookCaller = appRouter.createCaller({
        session,
        container: { ...supplier.container, db: withTxFailureOn(handle.db, 2) },
      });
      await expect(bookCaller.workspace.booking.book({ itineraryId, quoteRowIds })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });

      // Compensation: every supplier booking cancelled (zero live), every
      // claim released, zero money rows — full failure-branch conservation.
      expect(supplier.liveSupplierBookings()).toBe(0);
      const counts = await countsFor(session.agencyId);
      expect(counts.bookings).toBe(0);
      expect(counts.components).toBe(0);
      expect(counts.ledger).toBe(0);
      expect(counts.pmfEvents).toBe(1); // trip_created only
      const holdRows = await handle.db
        .select({ consumedAt: bookingQuoteTable.consumedAt })
        .from(bookingQuoteTable)
        .where(eq(bookingQuoteTable.agencyId, session.agencyId));
      expect(holdRows).toHaveLength(quoteRowIds.length);
      expect(holdRows.every((r) => r.consumedAt === null)).toBe(true);
    },
    LONG,
  );

  it(
    "tenancy: another agency's itinerary is NOT_FOUND for reads, quotes, and books (FR-013)",
    async () => {
      const owner = await makeAgency();
      const ownerCaller = appRouter.createCaller({ session: owner, container: makeContainer() });
      const drafted = await ownerCaller.workspace.itinerary.draft(DRAFT_INPUT);
      if (drafted.status !== "drafted") return;
      const itineraryId = drafted.itinerary.id;

      const intruder = await makeAgency();
      const intruderCaller = appRouter.createCaller({ session: intruder, container: makeContainer() });
      await expect(intruderCaller.workspace.itinerary.get({ itineraryId })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(intruderCaller.workspace.booking.quote({ itineraryId, markupBps: 1500 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        intruderCaller.workspace.booking.book({ itineraryId, quoteRowIds: [randomUUID()] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
    LONG,
  );
});
