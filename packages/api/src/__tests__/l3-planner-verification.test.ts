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
import { createDb, eq, itinerary as itineraryTable, organization, user as userTable, type DbHandle } from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import type {
  DraftItineraryRequest,
  DraftProgressEvent,
  LlmCompleteRequest,
  LlmCompleteResponse,
  LLMPort,
} from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";
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

  function makeContainer(): Container {
    return {
      hotel: new SandboxHotelAdapter(),
      activity: new SandboxActivityAdapter(),
      transfer: new SandboxTransferAdapter(),
      carRental: new SandboxCarRentalAdapter(),
      mediaStore: new SandboxMediaStoreAdapter(handle.db),
      llm: new SloppyCriteriaLLM(),
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
});
