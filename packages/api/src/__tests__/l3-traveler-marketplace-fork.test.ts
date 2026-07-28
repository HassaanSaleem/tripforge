// L3 — the TRAVELER marketplace-fork money path against a REAL database (spec
// 041; GOAL.md D2.7 bounds a+b). A traveler forks an agent's marketplace listing
// into a SELLER-agency-owned copy (clientView.marketplace.fork), then self-books
// that copy through the UNCHANGED selfBook path — paying the SOURCE listing's
// established markup (bound b), never the flat default and never net. This is a
// money path, so it carries the seller-markup pricing proof, failure-branch
// conservation (INV-011), seller attribution (INV-004), the never-zero default
// (FR-011), listing independence (SC-004), and the neutral refusal (FR-009) —
// not just a happy path.
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §4). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  and,
  count,
  eq,
  agencyVetting,
  booking as bookingTable,
  bookingComponent as bookingComponentTable,
  bookingQuote as bookingQuoteTable,
  createDb,
  itinerary as itineraryTable,
  marketplaceFork as marketplaceForkTable,
  markupLedger as markupLedgerTable,
  organization,
  pmfEvent,
  tripHandoffRequest as tripHandoffRequestTable,
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
import { applyMarkupBps, money } from "@tripforge/domain";
import { appRouter } from "../routers/root.js";
import { draftViaCaller } from "./draft-helper.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;
// A markup deliberately DIFFERENT from the platform default (1500) so the
// fork-aware fallback (source markup, not the default) is provable.
const SELLER_MARKUP_BPS = 2500;
const DEFAULT_MARKUP_BPS = 1500;

/** Surface the always-fails-booking fixture so the deterministic planner picks
 * it (cheapest) — lets a self-book exercise partial failure end-to-end. Same
 * seam as l3-traveler-self-book. */
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

describe.skipIf(!DATABASE_URL)("L3 traveler marketplace-fork money path (real Postgres + sandbox supply)", () => {
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

  async function makeAgency(name: string): Promise<SessionContext & { agencyId: string; agencyRole: "member" }> {
    const agencyId = `l3mf-agency-${randomUUID()}`;
    const userId = `l3mf-agent-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} Agent`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  /** A traveler: a `user` row with NO `member` row (org-less consumer identity). */
  async function makeTraveler(): Promise<SessionContext> {
    const userId = `l3mf-traveler-${randomUUID()}`;
    await handle.db.insert(userTable).values({ id: userId, name: "L3 Traveler", email: `${userId}@example.test` });
    return { userId };
  }

  async function vet(agencyId: string): Promise<void> {
    await handle.db.insert(agencyVetting).values({ agencyId, vettedBy: "l3-test-operator" });
  }

  const DRAFT_INPUT = {
    destination: "Paris",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
  } as const;

  const LISTING_INPUT = {
    title: "Paris on a budget — proven weekender",
    priceMinor: 25_000,
    licenseTerms: "White-label permitted; keep attribution lineage.",
    revenueShareBps: 750,
  } as const;

  /** Draft a real itinerary through the product path (document + tripRequest as
   * production writes them). */
  async function draftItinerary(session: SessionContext, container?: Container): Promise<string> {
    const drafted = await draftViaCaller(callerFor(session, container), DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  /** A vetted seller lists a trip. `quoteAtMarkup` (when set) establishes the
   * seller's markup on the SOURCE via a real quote before listing, so the fork
   * prices at it (bound b). Returns { listingId, sourceItineraryId }. */
  async function listTrip(
    seller: SessionContext & { agencyId: string },
    opts: { quoteAtMarkup?: number; container?: Container } = {},
  ): Promise<{ listingId: string; sourceItineraryId: string }> {
    const sourceItineraryId = await draftItinerary(seller, opts.container);
    if (opts.quoteAtMarkup !== undefined) {
      const quoted = await callerFor(seller, opts.container).workspace.booking.quote({
        itineraryId: sourceItineraryId,
        markupBps: opts.quoteAtMarkup,
      });
      expect(quoted.status).toBe("quoted");
    }
    const listed = await callerFor(seller).workspace.marketplace.createListing({
      itineraryId: sourceItineraryId,
      ...LISTING_INPUT,
    });
    expect(listed.status).toBe("listed");
    if (listed.status !== "listed") throw new Error("listing failed");
    return { listingId: listed.listingId, sourceItineraryId };
  }

  async function moneyCountsFor(agencyId: string) {
    const db = handle.db;
    const [bookings] = await db.select({ n: count() }).from(bookingTable).where(eq(bookingTable.agencyId, agencyId));
    const [components] = await db
      .select({ n: count() })
      .from(bookingComponentTable)
      .where(eq(bookingComponentTable.agencyId, agencyId));
    const [ledger] = await db
      .select({ n: count() })
      .from(markupLedgerTable)
      .where(eq(markupLedgerTable.agencyId, agencyId));
    return {
      bookings: Number(bookings?.n ?? 0),
      components: Number(components?.n ?? 0),
      ledger: Number(ledger?.n ?? 0),
    };
  }

  async function ledgerRowsFor(agencyId: string) {
    return handle.db.select().from(markupLedgerTable).where(eq(markupLedgerTable.agencyId, agencyId));
  }

  // ── FR-010: a fork self-books at the SOURCE seller's markup (bound b) ────────
  it(
    "a fork self-books at the source listing's markup (2500), NOT the default — seller keeps the markup",
    async () => {
      const seller = await makeAgency("Atlas DMC");
      await vet(seller.agencyId);
      const traveler = await makeTraveler();
      const { listingId, sourceItineraryId } = await listTrip(seller, { quoteAtMarkup: SELLER_MARKUP_BPS });

      const forked = await callerFor(traveler).clientView.marketplace.fork({ listingId });
      expect(forked.status).toBe("forked");
      if (forked.status !== "forked") return;

      // Provenance recorded: the copy is a fresh, seller-owned itinerary that
      // points back at the source; the listed original is NOT the copy.
      const [forkRow] = await handle.db
        .select()
        .from(marketplaceForkTable)
        .where(eq(marketplaceForkTable.listingId, listingId));
      expect(forkRow?.sourceItineraryId).toBe(sourceItineraryId);
      expect(forkRow?.sellerAgencyId).toBe(seller.agencyId);
      expect(forkRow?.travelerUserId).toBe(traveler.userId);
      const copyId = forkRow?.copyItineraryId;
      expect(copyId).toBeDefined();
      const [copyRow] = await handle.db.select().from(itineraryTable).where(eq(itineraryTable.id, copyId as string));
      expect(copyRow?.agencyId).toBe(seller.agencyId); // seller-owned (bound a)
      expect(copyId).not.toBe(sourceItineraryId);

      const outcome = await callerFor(traveler).clientView.selfBook({ token: forked.token });
      expect(outcome.status).toBe("confirmed");
      if (outcome.status !== "confirmed") return;

      // Every markup_ledger row is attributed to the SELLER agency (INV-004) and
      // priced at the SELLER's markup — sell = applyMarkupBps(net, 2500) EXACTLY,
      // and NOT the platform default (proves the fork-aware fallback fired).
      const ledger = await ledgerRowsFor(seller.agencyId);
      expect(ledger.length).toBeGreaterThanOrEqual(3);
      for (const row of ledger) {
        const net = money(row.netMinor, row.currency);
        expect(row.sellMinor).toBe(applyMarkupBps(net, SELLER_MARKUP_BPS).amountMinor);
        expect(row.sellMinor).not.toBe(applyMarkupBps(net, DEFAULT_MARKUP_BPS).amountMinor);
        expect(row.markupMinor).toBe(row.sellMinor - row.netMinor);
      }

      // The booking is attributed to the seller agency; the ACTOR is the traveler.
      const bookedEvents = await handle.db
        .select({ actorUserId: pmfEvent.actorUserId })
        .from(pmfEvent)
        .where(and(eq(pmfEvent.agencyId, seller.agencyId), eq(pmfEvent.type, "booking_confirmed")));
      expect(bookedEvents.length).toBe(ledger.length);
      expect(bookedEvents.every((e) => e.actorUserId === traveler.userId)).toBe(true);

      // Redaction (INV-020): nothing confidential crosses the boundary.
      const serialized = JSON.stringify(outcome).toLowerCase();
      for (const forbidden of ["netminor", "markup", "merchantofrecord", "supplierbookingid", "offerid", "supplyref"]) {
        expect(serialized).not.toContain(forbidden);
      }
    },
    LONG,
  );

  // ── FR-011: an unquoted source forks at the platform default — never zero ────
  it(
    "a fork of a never-quoted listing self-books at the platform default (1500), never net (FR-011)",
    async () => {
      const seller = await makeAgency("Nomad Collective");
      await vet(seller.agencyId);
      const traveler = await makeTraveler();
      const { listingId } = await listTrip(seller); // NOT quoted → no source markup

      const forked = await callerFor(traveler).clientView.marketplace.fork({ listingId });
      expect(forked.status).toBe("forked");
      if (forked.status !== "forked") return;
      const outcome = await callerFor(traveler).clientView.selfBook({ token: forked.token });
      expect(outcome.status).toBe("confirmed");

      const ledger = await ledgerRowsFor(seller.agencyId);
      expect(ledger.length).toBeGreaterThanOrEqual(3);
      for (const row of ledger) {
        const net = money(row.netMinor, row.currency);
        expect(row.sellMinor).toBe(applyMarkupBps(net, DEFAULT_MARKUP_BPS).amountMinor);
        expect(row.markupMinor).toBeGreaterThan(0); // never net (a traveler can't pay cost)
      }
    },
    LONG,
  );

  // ── FR-012 / INV-011: partial failure charges nothing for the failed leg ─────
  it(
    "partial failure on a forked self-book: the failing leg writes ZERO money rows; siblings confirm; holds released",
    async () => {
      const seller = await makeAgency("Cedar Trails");
      await vet(seller.agencyId);
      const traveler = await makeTraveler();
      // Fail-book hotel present in BOTH the seller's draft container and the
      // traveler's self-book container (the planner picks it as cheapest).
      const failContainer = makeContainer({ failBookHotel: true });
      const { listingId } = await listTrip(seller, { container: failContainer });

      const forked = await callerFor(traveler).clientView.marketplace.fork({ listingId });
      expect(forked.status).toBe("forked");
      if (forked.status !== "forked") return;

      const outcome = await callerFor(traveler, makeContainer({ failBookHotel: true })).clientView.selfBook({
        token: forked.token,
      });
      expect(outcome.status).toBe("partially_confirmed");
      if (outcome.status !== "partially_confirmed") return;
      const failed = outcome.legs.filter((l) => l.outcome === "failed");
      const confirmed = outcome.legs.filter((l) => l.outcome === "confirmed");
      expect(failed).toHaveLength(1);
      expect(confirmed.length).toBeGreaterThan(0);

      // The failed leg contributed ZERO money rows; exactly one booking with the
      // confirmed components; all under the SELLER agency.
      const counts = await moneyCountsFor(seller.agencyId);
      expect(counts.bookings).toBe(1);
      expect(counts.components).toBe(confirmed.length);
      expect(counts.ledger).toBe(confirmed.length);
      expect(outcome.totalChargedMinor).toBe(
        confirmed.reduce((s, l) => s + (l.outcome === "confirmed" ? l.sellMinor : 0), 0),
      );

      // The failed item's hold was released (unconsumed) → bookable again.
      const failItemId = failed[0]?.outcome === "failed" ? failed[0].itemId : undefined;
      expect(failItemId).toBeDefined();
      const copyId = (
        await handle.db
          .select({ copyItineraryId: marketplaceForkTable.copyItineraryId })
          .from(marketplaceForkTable)
          .where(eq(marketplaceForkTable.listingId, listingId))
      )[0]?.copyItineraryId as string;
      const failHolds = await handle.db
        .select({ consumedAt: bookingQuoteTable.consumedAt })
        .from(bookingQuoteTable)
        .where(and(eq(bookingQuoteTable.itineraryId, copyId), eq(bookingQuoteTable.itemId, failItemId as string)));
      expect(failHolds.length).toBeGreaterThan(0);
      expect(failHolds.every((r) => r.consumedAt === null)).toBe(true);
    },
    LONG,
  );

  // ── SC-004: two forks are independent; the listed original is never mutated ──
  it(
    "two travelers fork the same listing into independent copies; booking one leaves the listing and the other copy intact",
    async () => {
      const seller = await makeAgency("Fjord & Co");
      await vet(seller.agencyId);
      const t1 = await makeTraveler();
      const t2 = await makeTraveler();
      const { listingId, sourceItineraryId } = await listTrip(seller, { quoteAtMarkup: SELLER_MARKUP_BPS });

      const f1 = await callerFor(t1).clientView.marketplace.fork({ listingId });
      const f2 = await callerFor(t2).clientView.marketplace.fork({ listingId });
      expect(f1.status).toBe("forked");
      expect(f2.status).toBe("forked");
      if (f1.status !== "forked" || f2.status !== "forked") return;
      expect(f1.token).not.toBe(f2.token);

      // t1 books their copy in full.
      const booked = await callerFor(t1).clientView.selfBook({ token: f1.token });
      expect(booked.status).toBe("confirmed");

      // The SOURCE listed itinerary has ZERO booking components (never mutated).
      const [srcComponents] = await handle.db
        .select({ n: count() })
        .from(bookingComponentTable)
        .where(eq(bookingComponentTable.itineraryId, sourceItineraryId));
      expect(Number(srcComponents?.n ?? 0)).toBe(0);

      // t2's copy is still fully bookable (its items are un-booked).
      const booked2 = await callerFor(t2).clientView.selfBook({ token: f2.token });
      expect(booked2.status).toBe("confirmed");
    },
    LONG,
  );

  // ── FR-014: request-agent on a fork routes to the SELLER (reused handoff) ────
  it(
    "requesting an agent on a forked copy records a handoff for the seller agency (Constitution I)",
    async () => {
      const seller = await makeAgency("Solstice Voyages");
      await vet(seller.agencyId);
      const traveler = await makeTraveler();
      const { listingId } = await listTrip(seller);

      const forked = await callerFor(traveler).clientView.marketplace.fork({ listingId });
      expect(forked.status).toBe("forked");
      if (forked.status !== "forked") return;

      // The fork copy is seller-owned, so the UNCHANGED request-agent handoff
      // (keyed on the itinerary's current owner) routes to the seller.
      const submitted = await callerFor(traveler).clientView.requestHandoff({
        token: forked.token,
        contactName: "Theo Traveler",
      });
      expect(submitted.status).toBe("submitted");

      const rows = await handle.db
        .select({ agencyId: tripHandoffRequestTable.agencyId, contactName: tripHandoffRequestTable.contactName })
        .from(tripHandoffRequestTable)
        .where(eq(tripHandoffRequestTable.agencyId, seller.agencyId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.contactName).toBe("Theo Traveler");
    },
    LONG,
  );

  // ── FR-009 + auth: neutral refusal, no existence oracle, anonymous blocked ───
  it(
    "fork refuses a deactivated/unknown listing neutrally (writes nothing) and is UNAUTHORIZED for anonymous",
    async () => {
      const seller = await makeAgency("Ash & Oak Travel");
      await vet(seller.agencyId);
      const traveler = await makeTraveler();
      const { listingId } = await listTrip(seller);

      // Deactivate → fork is neutral not_available and writes no fork row.
      const deact = await callerFor(seller).workspace.marketplace.deactivateListing({ listingId });
      expect(deact.status).toBe("deactivated");
      const afterDeact = await callerFor(traveler).clientView.marketplace.fork({ listingId });
      expect(afterDeact).toEqual({ status: "not_available" });

      // Unknown listing id → same neutral surface.
      const unknown = await callerFor(traveler).clientView.marketplace.fork({ listingId: randomUUID() });
      expect(unknown).toEqual({ status: "not_available" });

      const [forkCount] = await handle.db
        .select({ n: count() })
        .from(marketplaceForkTable)
        .where(eq(marketplaceForkTable.listingId, listingId));
      expect(Number(forkCount?.n ?? 0)).toBe(0);

      // Anonymous callers cannot fork (protectedProcedure → UNAUTHORIZED).
      await expect(callerFor(null).clientView.marketplace.fork({ listingId })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    },
    LONG,
  );
});
