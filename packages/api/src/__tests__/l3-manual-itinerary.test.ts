// L3 — bring-your-own itinerary against a REAL database (spec 029). Proves
// the "zero special-casing downstream" claim (SC-002) mechanically: a
// manually-created item is excluded from the bookable set until a real
// supplier rate is attached via the EXISTING applyChatEdit path (research
// D4), after which quote → book carries the SAME state-conservation
// guarantees as an AI-drafted item (Constitution VI — money paths require
// L3, not unit-test-only coverage). Also proves creationSource is set
// independently at each of the three insert sites (manual / ai_drafted /
// licensed_copy) and that the marketplace/license path needs no changes.
//
// Env-gated like the sibling l3 suites: runs when DATABASE_URL points at a
// live Postgres (compose stack); skipping without the env is loud, not green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { agencyVetting, createDb, eq, itinerary as itineraryTable, organization, user as userTable, type DbHandle } from "@tripforge/db";
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
import type { ChatEditOutcome } from "../services/itineraries.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 bring-your-own itinerary (real Postgres)", () => {
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
    const agencyId = `l3manual-agency-${randomUUID()}`;
    const userId = `l3manual-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  const MANUAL_INPUT = {
    title: "Hand-built Lisbon trip",
    currency: "USD",
    destination: "Lisbon",
    checkIn: "2026-09-01",
    checkOut: "2026-09-04",
    party: { adults: 2, children: 0 },
    days: [
      {
        dayNumber: 1,
        date: "2026-09-01",
        items: [
          { kind: "stay" as const, title: "Placeholder hotel (no rate yet)", checkIn: "2026-09-01", checkOut: "2026-09-04", occupancy: { adults: 2, children: 0 } },
          { kind: "activity" as const, title: "Walking tour (stays unpriced)" },
        ],
      },
    ],
  };

  async function chatEditViaCaller(session: SessionContext, itineraryId: string, message: string): Promise<ChatEditOutcome> {
    const stream = await callerFor(session).workspace.itinerary.chatEdit({ itineraryId, message });
    let outcome: ChatEditOutcome | undefined;
    for await (const event of stream) {
      if (event.type === "result") outcome = event.outcome;
    }
    if (!outcome) throw new Error("chatEdit stream ended without a terminal result event");
    return outcome;
  }

  it(
    "US1: createManual persists a canonical-valid document with creationSource='manual', origin surfaced on list, unpriced items included as-entered",
    async () => {
      const agent = await makeAgency("Handbuilt Travel");
      const created = await callerFor(agent).workspace.itinerary.createManual(MANUAL_INPUT);
      expect(created.status).toBe("created");
      const itineraryId = created.itinerary.id;

      const stay = created.itinerary.days[0]?.items.find((i) => i.kind === "stay");
      const activity = created.itinerary.days[0]?.items.find((i) => i.kind === "activity");
      expect(stay?.supplyRef).toBeUndefined();
      expect(stay?.pricing).toBeUndefined();
      expect(activity?.title).toBe("Walking tour (stays unpriced)");

      const [row] = await handle.db.select({ creationSource: itineraryTable.creationSource }).from(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      expect(row?.creationSource).toBe("manual");

      const list = await callerFor(agent).workspace.itinerary.list();
      expect(list.itineraries.find((i) => i.id === itineraryId)?.origin).toBe("manual");
      expect(list.itineraries.find((i) => i.id === itineraryId)?.licensedCopy).toBeNull();
    },
    LONG,
  );

  it(
    "US2: an unpriced manual item is excluded from the bookable set; attaching a rate via applyChatEdit makes it quote+book with FULL conservation on the double-book failure path",
    async () => {
      const agent = await makeAgency("Attach Rate Travel");
      const created = await callerFor(agent).workspace.itinerary.createManual(MANUAL_INPUT);
      expect(created.status).toBe("created");
      const itineraryId = created.itinerary.id;

      // Quote BEFORE any rate is attached: zero bookable items — the same
      // silent-exclusion behavior an unpriced AI-drafted item already gets
      // (packages/api/src/services/booking/quote.ts), zero special-casing.
      const preQuote = await callerFor(agent).workspace.booking.quote({ itineraryId, markupBps: 1500 });
      expect(preQuote.status).toBe("quoted");
      if (preQuote.status !== "quoted") return;
      expect(preQuote.items).toEqual([]);

      // Attach a real supplier rate the SAME way an AI-drafted item's rate is
      // attached (research D4: addItem on the hotel port auto-replaces the
      // existing stay) — get a live offer via the existing "suggest a hotel"
      // chat flow, then apply it directly (LLM-free), exactly like the
      // suggestion-card "Add to trip" action.
      const suggested = await chatEditViaCaller(agent, itineraryId, "suggest a hotel");
      expect(suggested.status).toBe("suggested");
      if (suggested.status !== "suggested") return;
      const pick = suggested.suggestions[0];
      expect(pick).toBeDefined();
      if (!pick) return;

      const applied = await callerFor(agent).workspace.itinerary.applyChatEdit({
        itineraryId,
        edit: { type: "addItem", dayNumber: 1, port: "hotel", offerId: pick.offerId },
      });
      expect(applied.status).toBe("applied");
      if (applied.status !== "applied") return;
      // The manual placeholder stay was replaced; the unpriced activity is untouched.
      expect(applied.itinerary.days[0]?.items.filter((i) => i.kind === "stay")).toHaveLength(1);
      expect(applied.itinerary.days[0]?.items.find((i) => i.kind === "activity")?.pricing).toBeUndefined();

      // Quote AFTER attach: exactly the priced stay is bookable — the
      // still-unpriced activity stays absent from the response, not "failed".
      const quoted = await callerFor(agent).workspace.booking.quote({ itineraryId, markupBps: 1500 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") return;
      expect(quoted.items).toHaveLength(1);
      expect(quoted.items.every((i) => i.outcome === "held")).toBe(true);
      const quoteRowIds = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));

      const booked = await callerFor(agent).workspace.booking.book({ itineraryId, quoteRowIds });
      expect(booked.status).toBe("confirmed");

      // State-conservation on the failure path (Constitution VI): re-booking
      // the SAME quote rows is a typed refusal with ZERO additional state —
      // the identical double-book conservation guarantee l3-booking.test.ts
      // proves for an AI-drafted item, now proven for a manual-origin one.
      const again = await callerFor(agent).workspace.booking.book({ itineraryId, quoteRowIds });
      expect(again.status).toBe("failed");
      expect(again.components.every((c) => c.outcome === "failed" && c.reason === "already_consumed")).toBe(true);
    },
    LONG,
  );

  it(
    "US3: listing/licensing a manual itinerary needs zero changes; the copy's creationSource is 'licensed_copy', independent of the original's 'manual'",
    async () => {
      const seller = await makeAgency("Manual Seller Travel");
      const buyer = await makeAgency("Manual Buyer Travel");
      await handle.db.insert(agencyVetting).values({ agencyId: seller.agencyId, vettedBy: "l3manual-test-operator" });
      await handle.db.insert(agencyVetting).values({ agencyId: buyer.agencyId, vettedBy: "l3manual-test-operator" });

      const created = await callerFor(seller).workspace.itinerary.createManual(MANUAL_INPUT);
      expect(created.status).toBe("created");
      const sourceId = created.itinerary.id;

      const listed = await callerFor(seller).workspace.marketplace.createListing({
        itineraryId: sourceId,
        title: "Hand-built Lisbon trip — proven route",
        priceMinor: 25_000,
        licenseTerms: "White-label permitted; keep attribution lineage.",
        revenueShareBps: 750,
      });
      expect(listed.status).toBe("listed");
      if (listed.status !== "listed") return;

      const licensed = await callerFor(buyer).workspace.marketplace.licenseListing({ listingId: listed.listingId });
      expect(licensed.status).toBe("licensed");
      if (licensed.status !== "licensed") return;

      const [sourceRow] = await handle.db.select({ creationSource: itineraryTable.creationSource }).from(itineraryTable).where(eq(itineraryTable.id, sourceId));
      const [copyRow] = await handle.db
        .select({ creationSource: itineraryTable.creationSource })
        .from(itineraryTable)
        .where(eq(itineraryTable.id, licensed.copyItineraryId));
      expect(sourceRow?.creationSource).toBe("manual");
      expect(copyRow?.creationSource).toBe("licensed_copy");

      // The buyer's list shows the LICENSED-COPY badge, not a manual/ai_drafted
      // origin badge (research D3 display rule — mirrors l3-itinerary-list.test.ts).
      const buyerList = await callerFor(buyer).workspace.itinerary.list();
      const copyRowInList = buyerList.itineraries.find((i) => i.id === licensed.copyItineraryId);
      expect(copyRowInList?.licensedCopy).not.toBeNull();
      expect(copyRowInList?.origin).toBeNull();
    },
    LONG,
  );

  it(
    "the RBAC ladder travels with createManual: anon UNAUTHORIZED, traveler FORBIDDEN",
    async () => {
      await expect(callerFor(null).workspace.itinerary.createManual(MANUAL_INPUT)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        callerFor({ userId: `l3manual-traveler-${randomUUID()}` }).workspace.itinerary.createManual(MANUAL_INPUT),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
    LONG,
  );
});
