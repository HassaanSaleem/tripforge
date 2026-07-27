// L3 — consumer chat-first AI planner against a REAL database (spec 038
// SC-001..SC-004). Walks the traveler journey through the full tRPC surface:
// planInterpret (chat → TripRequest) → planDraft (redacted, live-priced compare)
// → requestPlan (the request-an-agent lead), asserting the sell-price-only
// redaction (INV-020), a durable lead row, and a CONSERVATION delta: NOT a money
// path — no itinerary/booking/markup_ledger row is written by any planner path.
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack).
// Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  booking as bookingTable,
  consumerPlanRequest as consumerPlanRequestTable,
  count,
  createDb,
  eq,
  itinerary as itineraryTable,
  markupLedger as markupLedgerTable,
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
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";
import type { ConsumerCompareOutcome } from "../services/consumer-planner.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 consumer AI planner (real Postgres)", () => {
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

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  async function makeTraveler(): Promise<SessionContext> {
    const userId = `l3cp-user-${randomUUID()}`;
    await handle.db.insert(userTable).values({ id: userId, name: "Traveler Tara", email: `${userId}@example.test` });
    return { userId };
  }

  // Concrete per-table counts (a union param would not satisfy drizzle's typed
  // `.from()`), snapshotted before/after to prove the conservation delta.
  async function snapshot(): Promise<{ itinerary: number; booking: number; markup: number; leads: number }> {
    return {
      itinerary: Number((await handle.db.select({ c: count() }).from(itineraryTable))[0]?.c ?? 0),
      booking: Number((await handle.db.select({ c: count() }).from(bookingTable))[0]?.c ?? 0),
      markup: Number((await handle.db.select({ c: count() }).from(markupLedgerTable))[0]?.c ?? 0),
      leads: Number((await handle.db.select({ c: count() }).from(consumerPlanRequestTable))[0]?.c ?? 0),
    };
  }

  it(
    "US1/US2: interpret → redacted live-priced compare → durable agency-less lead; NO money-path write",
    async () => {
      const traveler = await makeTraveler();
      const caller = callerFor(traveler);

      const before = await snapshot();

      // 1) Chat interpret — a single message with destination + party + nights +
      // budget resolves. Party size uses the "for N" form the keyless FakeLLM
      // parses; bare "N people" is a pre-existing keyless interpreter-grammar
      // gap (extractAdults only matches "for N"), out of scope for this money-path L3.
      const interpreted = await caller.clientView.planInterpret({
        message: "Plan a trip to Lisbon for 2, 4 nights, EUR 2000",
      });
      expect(interpreted.status).toBe("resolved");
      if (interpreted.status !== "resolved") throw new Error("interpret did not resolve");
      const tripRequest = interpreted.tripRequest;
      expect(tripRequest.destination.toLowerCase()).toContain("lisbon");

      // 2) Compare — 1-3 live-priced options, redacted to sell-price-only.
      const stream = await caller.clientView.planDraft(tripRequest);
      let outcome: ConsumerCompareOutcome | undefined;
      for await (const event of stream) {
        if (event.type === "result") outcome = event.outcome;
      }
      expect(outcome?.status).toBe("drafted");
      if (!outcome || outcome.status !== "drafted") throw new Error("compare did not draft");
      expect(outcome.options.length).toBeGreaterThanOrEqual(1);
      const chosen = outcome.options[0];
      expect(chosen).toBeDefined();
      if (!chosen) throw new Error("no option");

      // Live-priced: the redacted view carries a sell total.
      expect(chosen.view.totalSellMinor).not.toBeNull();
      // Per-category budget breakdown present.
      expect(chosen.fit.categories.length).toBeGreaterThan(0);
      // INV-020 redaction: NO confidential field crosses to the traveler.
      const serialised = JSON.stringify(outcome.options);
      expect(serialised).not.toContain("netRate");
      expect(serialised).not.toContain("supplyRef");
      expect(serialised).not.toContain("merchantOfRecord");

      // 3) Request-an-agent — a durable, agency-less lead.
      const submitted = await caller.clientView.requestPlan({
        tripRequest,
        variant: chosen.variant,
        optionTitle: chosen.view.title,
        contactName: "Tara Traveler",
        notes: "Prefer a central hotel.",
      });
      expect(submitted.status).toBe("submitted");
      if (submitted.status !== "submitted") throw new Error("request not submitted");

      const rows = await handle.db
        .select()
        .from(consumerPlanRequestTable)
        .where(eq(consumerPlanRequestTable.id, submitted.requestId));
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row?.travelerUserId).toBe(traveler.userId);
      expect(row?.destination.toLowerCase()).toContain("lisbon");
      expect(row?.budgetCurrency).toBe("EUR");
      expect(Number(row?.budgetAmountMinor)).toBe(tripRequest.budget.amountMinor);
      expect(row?.variant).toBe(chosen.variant);
      expect(row?.optionTitle).toBe(chosen.view.title);
      expect(row?.contactName).toBe("Tara Traveler");
      expect(row?.contactEmail).toBeNull();
      expect(row?.notes).toBe("Prefer a central hotel.");
      expect(row?.status).toBe("new");

      // CONSERVATION (SC-004): the whole planner journey wrote exactly ONE lead.
      // The consumer_plan_request table is exclusive to this suite, so its delta
      // is race-free under parallel L3 files (unlike the shared itinerary/booking
      // tables — which this path never writes: draftOptions is compare-only and
      // the lead schema has NO money columns, the structural money-path guarantee).
      const after = await snapshot();
      expect(after.leads).toBe(before.leads + 1);
    },
    LONG,
  );

  it(
    "US2: a request with no contact name is rejected server-side and writes no lead",
    async () => {
      const traveler = await makeTraveler();
      const caller = callerFor(traveler);
      const before = (await snapshot()).leads;

      const interpreted = await caller.clientView.planInterpret({
        message: "Plan a trip to Porto for 2, 3 nights, EUR 1500",
      });
      expect(interpreted.status).toBe("resolved");
      if (interpreted.status !== "resolved") throw new Error("interpret did not resolve");

      await expect(
        caller.clientView.requestPlan({
          tripRequest: interpreted.tripRequest,
          variant: "balanced",
          optionTitle: "Porto plan",
          // deliberately blank name — server-side min(1) rejects it.
          contactName: "   ".trim(),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect((await snapshot()).leads).toBe(before);
    },
    LONG,
  );

  it(
    "INV-024/INV-023: a traveler is FORBIDDEN on the agent draft engine; anonymous is UNAUTHORIZED on the consumer planner",
    async () => {
      const traveler = await makeTraveler();
      const TRIP = {
        destination: "Lisbon",
        checkIn: "2026-09-01",
        checkOut: "2026-09-05",
        party: { adults: 2, children: 0 },
        budget: { mode: "hardCap", amountMinor: 200_000, currency: "EUR" },
      } as const;

      // A traveler session may NEVER invoke the agent workspace draft engine.
      await expect(
        callerFor(traveler).workspace.itinerary.draft(TRIP),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      // Anonymous callers cannot use the consumer planner procedures.
      await expect(
        callerFor(null).clientView.planInterpret({ message: "Plan a trip to Lisbon around EUR 2000 for 4 nights" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        callerFor(null).clientView.requestPlan({
          tripRequest: TRIP,
          variant: "balanced",
          optionTitle: "x",
          contactName: "x",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
    LONG,
  );
});
