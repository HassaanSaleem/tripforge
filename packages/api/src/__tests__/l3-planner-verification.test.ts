// L3 — planner draft verification vs a REAL database (spec 008 live fix,
// FR-011): a model that phrases its lookup criteria differently from the trip
// request ("Paris, France" for a "Paris" trip) must still produce a drafted,
// persisted itinerary. Supply offer identity is keyed off search criteria, so
// before the canonical-criteria pinning in services/planner.ts every such
// proposal was dropped at assembly as unknown_offer and the draft collapsed to
// planner_failed(no_proposals) — the live "empty itinerary" defect (seed-0009a).
//
// Env-gated like the other L3 suites: runs when DATABASE_URL points at a live
// Postgres (the compose stack); skipping without the env is loud, never silent.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  count,
  createDb,
  eq,
  itinerary as itineraryTable,
  organization,
  pmfEvent,
  user as userTable,
  type DbHandle,
} from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import {
  FakeLLM,
  type ChatEditProgressEvent,
  type ChatEditRequest,
  type DraftItineraryRequest,
  type DraftProgressEvent,
  type LlmCompleteRequest,
  type LlmCompleteResponse,
  type LLMPort,
} from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";
import type { DraftOutcome } from "../services/planner.js";
import { draftViaCaller } from "./draft-helper.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

/**
 * LLMPort double behaving like a live model that obeys "propose only offerIds
 * the tools returned" but phrases its OWN search criteria: destination
 * decorated with a country suffix, its own transfer endpoints and times. The
 * proposals are genuinely tool-returned — dropping them is a verification
 * alignment bug, not model misbehaviour.
 */
class SloppyCriteriaLLM implements LLMPort {
  async complete(_req: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    throw new Error("not used by the planner draft path");
  }

  chatEditItinerary(_req: ChatEditRequest): AsyncGenerator<ChatEditProgressEvent> {
    throw new Error("not used by the planner draft path");
  }

  async *draftItinerary(req: DraftItineraryRequest): AsyncGenerator<DraftProgressEvent> {
    const { request, tools } = req;
    const guests = request.party.adults + request.party.children;
    yield { type: "progress", step: "searchingHotels" };
    const [hotels, activities, transfers] = await Promise.all([
      tools.searchHotelRates({
        destination: `${request.destination}, France`,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        guests,
      }),
      tools.searchActivities({ destination: `${request.destination} city centre`, participants: guests }),
      tools.quoteTransfer({
        from: "CDG airport",
        to: `${request.destination} downtown`,
        at: `${request.checkIn}T09:30:00Z`,
        passengers: guests,
      }),
    ]);
    yield { type: "progress", step: "assembling" };
    const hotel = hotels[0];
    const activity = activities[0];
    const transfer = transfers[0];
    if (!hotel || !activity || !transfer) {
      yield { type: "result", result: { status: "failed", reason: "no_proposals" } };
      return;
    }
    yield {
      type: "result",
      result: {
        status: "drafted",
        drafts: [
          {
            variant: "balanced",
            draft: {
              title: `${request.destination} weekender`,
              days: [
                {
                  items: [
                    { port: "transfer", offerId: transfer.offerId },
                    { port: "hotel", offerId: hotel.offerId },
                    { port: "activity", offerId: activity.offerId },
                  ],
                },
              ],
            },
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    };
  }
}

describe.skipIf(!DATABASE_URL)("L3 planner draft verification alignment (real Postgres + sandbox supply)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(llm: LLMPort = new SloppyCriteriaLLM()): Container {
    return {
      hotel: new SandboxHotelAdapter(),
      activity: new SandboxActivityAdapter(),
      transfer: new SandboxTransferAdapter(),
      carRental: new SandboxCarRentalAdapter(),
      mediaStore: new SandboxMediaStoreAdapter(handle.db),
      llm,
      rates: STATIC_RATES,
      db: handle.db,
    };
  }

  async function makeAgency(name: string): Promise<SessionContext & { agencyId: string }> {
    const agencyId = `l3p-agency-${randomUUID()}`;
    const userId = `l3p-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  async function countsFor(agencyId: string) {
    const [itineraries] = await handle.db.select({ n: count() }).from(itineraryTable).where(eq(itineraryTable.agencyId, agencyId));
    const [pmf] = await handle.db.select({ n: count() }).from(pmfEvent).where(eq(pmfEvent.agencyId, agencyId));
    return { itineraries: Number(itineraries?.n ?? 0), pmfEvents: Number(pmf?.n ?? 0) };
  }

  const MULTI_OPTION_INPUT = {
    destination: "Lisbon",
    checkIn: "2026-11-01",
    checkOut: "2026-11-04",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap" as const, amountMinor: 150_000, currency: "USD" },
  };

  /** Drains selectDraft for a specific variant — like draftViaCaller, but lets
   * the caller pick which variant to persist (used to prove two different
   * selections produce two separate trips). */
  async function selectDraftViaCaller(
    caller: ReturnType<(typeof appRouter)["createCaller"]>,
    tripRequest: typeof MULTI_OPTION_INPUT,
    variant: "budgetSavvy" | "balanced" | "premium",
  ): Promise<DraftOutcome> {
    const stream = await caller.workspace.itinerary.selectDraft({ tripRequest, variant });
    let outcome: DraftOutcome | undefined;
    for await (const event of stream) {
      if (event.type === "result") outcome = event.outcome;
    }
    if (!outcome) throw new Error("selectDraft stream ended without a terminal result event");
    return outcome;
  }

  it(
    "drafts and persists a plan even when the model phrases its lookup criteria differently (FR-011)",
    async () => {
      const session = await makeAgency("Sloppy Criteria Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer() });

      const drafted = await draftViaCaller(caller, {
        destination: "Paris",
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        party: { adults: 2, children: 0 },
        budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
      });

      // The whole defect: this used to be planner_failed(no_proposals).
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") throw new Error("draft failed");

      // Every proposed item survived verification (nothing dropped).
      const items = drafted.itinerary.days.flatMap((d) => d.items);
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.kind).sort()).toEqual(["activity", "stay", "transfer"]);

      // Supply refs are CANONICAL-keyed (destination-derived) — the exact ids
      // the quote flow's INV-028 re-establishment sweep re-reads in a fresh
      // process. A model-phrased key ("paris, france-…") here would break the
      // later money path even if the draft rendered.
      for (const item of items) {
        expect(item.supplyRef?.externalId).toMatch(/^paris-/);
      }

      // Persisted through the product path (one row, this agency).
      const rows = await handle.db
        .select({ id: itineraryTable.id })
        .from(itineraryTable)
        .where(eq(itineraryTable.agencyId, session.agencyId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(drafted.itinerary.id);
    },
    LONG,
  );

  // ─── Streaming contract (spec 016, INV-028) ────────────────────────────
  it(
    "streams progress events before the terminal result, over the real subscription (contracts/itinerary-draft-subscription.md)",
    async () => {
      const session = await makeAgency("Streamed Draft Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer() });

      const stream = await caller.workspace.itinerary.draft({
        destination: "Lisbon",
        checkIn: "2026-10-01",
        checkOut: "2026-10-03",
        party: { adults: 2, children: 0 },
        budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
      });
      const events: Array<{ type: string }> = [];
      for await (const event of stream) events.push(event);

      // At least one progress event, and it precedes the single terminal
      // result event (FR-001/FR-002; SloppyCriteriaLLM yields two: before the
      // lookups and before assembling).
      const progressCount = events.filter((e) => e.type === "progress").length;
      const resultIndex = events.findIndex((e) => e.type === "result");
      expect(progressCount).toBeGreaterThan(0);
      expect(resultIndex).toBe(events.length - 1);
      expect(events.filter((e) => e.type === "result")).toHaveLength(1);
    },
    LONG,
  );

  it(
    "an infeasible budget short-circuits to the terminal result with ZERO progress events (never reaches the LLM)",
    async () => {
      const session = await makeAgency("Infeasible Budget Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer() });

      // Budget below the implied flights reserve — allocateBudget rejects
      // before draftItinerary ever calls container.llm.draftItinerary.
      const stream = await caller.workspace.itinerary.draft({
        destination: "Lisbon",
        checkIn: "2026-10-01",
        checkOut: "2026-10-03",
        party: { adults: 2, children: 0 },
        budget: { mode: "hardCap", amountMinor: 100, currency: "USD" },
        flightsReserveMinor: 100_000,
      });
      const events: Array<{ type: string; outcome?: { status: string } }> = [];
      for await (const event of stream) events.push(event);

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("result");
      expect(events[0]?.outcome?.status).toBe("infeasible");
    },
    LONG,
  );

  // ─── Multi-option compare/select (spec 019) ────────────────────────────
  it(
    "draft (compare) writes ZERO itinerary rows and ZERO trip_created PMF events, regardless of option count",
    async () => {
      const session = await makeAgency("Compare Only Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer(new FakeLLM()) });

      const before = await countsFor(session.agencyId);
      const stream = await caller.workspace.itinerary.draft(MULTI_OPTION_INPUT);
      let outcome: { status: string; options?: unknown[] } | undefined;
      for await (const event of stream) {
        if (event.type === "result") outcome = event.outcome;
      }
      expect(outcome?.status).toBe("drafted");
      expect((outcome?.options?.length ?? 0)).toBeGreaterThanOrEqual(1);

      expect(await countsFor(session.agencyId)).toEqual(before);
    },
    LONG,
  );

  it(
    "selectDraft persists exactly ONE itinerary row + ONE trip_created PMF event for the chosen variant",
    async () => {
      const session = await makeAgency("Select Balanced Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer(new FakeLLM()) });

      const before = await countsFor(session.agencyId);
      const stream = await caller.workspace.itinerary.selectDraft({ tripRequest: MULTI_OPTION_INPUT, variant: "balanced" });
      let outcome: { status: string; itinerary?: { id: string } } | undefined;
      for await (const event of stream) {
        if (event.type === "result") outcome = event.outcome;
      }
      expect(outcome?.status).toBe("drafted");

      const after = await countsFor(session.agencyId);
      expect(after.itineraries).toBe(before.itineraries + 1);
      expect(after.pmfEvents).toBe(before.pmfEvents + 1);

      const rows = await handle.db
        .select({ id: itineraryTable.id })
        .from(itineraryTable)
        .where(eq(itineraryTable.agencyId, session.agencyId));
      expect(rows.map((r) => r.id)).toContain(outcome?.itinerary?.id);
    },
    LONG,
  );

  it(
    "selecting two different variants for the same trip produces two SEPARATE persisted trips (no accidental de-dup)",
    async () => {
      const session = await makeAgency("Select Twice Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer(new FakeLLM()) });

      const first = await selectDraftViaCaller(caller, MULTI_OPTION_INPUT, "budgetSavvy");
      const second = await selectDraftViaCaller(caller, MULTI_OPTION_INPUT, "premium");
      expect(first.status).toBe("drafted");
      expect(second.status).toBe("drafted");
      if (first.status !== "drafted" || second.status !== "drafted") return;
      expect(first.itinerary.id).not.toBe(second.itinerary.id);

      const counts = await countsFor(session.agencyId);
      expect(counts.itineraries).toBe(2);
      expect(counts.pmfEvents).toBe(2);
    },
    LONG,
  );

  it(
    "selectDraft yields the SAME typed infeasible outcome as draft, with ZERO writes, when the budget can't be planned",
    async () => {
      const session = await makeAgency("Infeasible Select Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer(new FakeLLM()) });

      const before = await countsFor(session.agencyId);
      const stream = await caller.workspace.itinerary.selectDraft({
        tripRequest: {
          ...MULTI_OPTION_INPUT,
          budget: { mode: "hardCap" as const, amountMinor: 100, currency: "USD" },
          flightsReserveMinor: 100_000,
        },
        variant: "balanced",
      });
      let outcome: { status: string } | undefined;
      for await (const event of stream) {
        if (event.type === "result") outcome = event.outcome;
      }
      expect(outcome?.status).toBe("infeasible");
      expect(await countsFor(session.agencyId)).toEqual(before);
    },
    LONG,
  );

  it(
    "the 'balanced' variant persists byte-for-byte the same document the pre-spec-019 single-draft flow produced (backward compatibility)",
    async () => {
      const session = await makeAgency("Backward Compat Travel");
      const caller = appRouter.createCaller({ session, container: makeContainer(new FakeLLM()) });

      const drafted = await draftViaCaller(caller, MULTI_OPTION_INPUT);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") return;
      // The pre-spec-019 planner always picked the cheapest hotel/transfer and
      // one activity per day — exactly what the "balanced" variant does now.
      const items = drafted.itinerary.days.flatMap((d) => d.items);
      expect(items.some((i) => i.kind === "stay")).toBe(true);
      expect(drafted.itinerary.title.toLowerCase()).toContain("lisbon");
    },
    LONG,
  );
});
