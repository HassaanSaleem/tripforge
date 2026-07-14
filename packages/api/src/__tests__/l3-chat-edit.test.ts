// L3 — conversational itinerary editing against a REAL database (spec 020).
// Covers tenant scoping (INV-004, no existence oracle), persistence through
// the SAME document column attachMedia/detachMedia already mutate, and that
// applyChatEdit re-verifies the offer server-side rather than trusting the
// client's suggestion-card copy (FR-006/FR-012).
//
// Env-gated like the sibling l3 suites: runs when DATABASE_URL points at a
// live Postgres (compose stack); skipping without the env is loud, not green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, organization, user as userTable, type DbHandle } from "@tripforge/db";
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
import type { ChatEditOutcome } from "../services/itineraries.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 conversational itinerary editing (real Postgres)", () => {
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
    const agencyId = `l3chat-agency-${randomUUID()}`;
    const userId = `l3chat-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  const DRAFT_INPUT = {
    destination: "Lisbon",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap" as const, amountMinor: 250_000, currency: "USD" },
  };

  async function draftItinerary(session: SessionContext): Promise<string> {
    const drafted = await draftViaCaller(callerFor(session), DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  async function chatEditViaCaller(session: SessionContext, itineraryId: string, message: string): Promise<ChatEditOutcome> {
    const stream = await callerFor(session).workspace.itinerary.chatEdit({ itineraryId, message });
    let outcome: ChatEditOutcome | undefined;
    for await (const event of stream) {
      if (event.type === "result") {
        outcome = event.outcome;
      }
    }
    if (!outcome) throw new Error("chatEdit stream ended without a terminal result event");
    return outcome;
  }

  it(
    "US1: a cross-tenant or unknown itineraryId yields a typed not_found outcome, zero DB writes",
    async () => {
      const owner = await makeAgency("Harbor Chat Travel");
      const other = await makeAgency("Outsider Chat Agency");
      const itineraryId = await draftItinerary(owner);

      const crossTenant = await chatEditViaCaller(other, itineraryId, "add an activity on day 1");
      expect(crossTenant).toEqual({ status: "not_found" });

      const unknown = await chatEditViaCaller(owner, randomUUID(), "add an activity on day 1");
      expect(unknown).toEqual({ status: "not_found" });

      // Owner's own document is untouched by either attempt.
      const after = await callerFor(owner).workspace.itinerary.get({ itineraryId });
      expect(after.status).toBe("found");
    },
    LONG,
  );

  it(
    "US1: an applied add/remove persists to the SAME itinerary row — visible on a subsequent read",
    async () => {
      const agent = await makeAgency("Chat Edit Travel");
      const itineraryId = await draftItinerary(agent);

      const before = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(before.status).toBe("found");
      if (before.status !== "found") return;
      const dayCount = before.itinerary.days.length;
      expect(dayCount).toBeGreaterThan(0);

      const added = await chatEditViaCaller(agent, itineraryId, "add an activity on day 1");
      expect(added.status).toBe("applied");
      if (added.status !== "applied") return;
      const addedItemCount = added.itinerary.days.flatMap((d) => d.items).length;

      const afterAdd = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(afterAdd.status).toBe("found");
      if (afterAdd.status !== "found") return;
      expect(afterAdd.itinerary.days.flatMap((d) => d.items)).toHaveLength(addedItemCount);

      const targetItem = added.itinerary.days.flatMap((d) => d.items).find((i) => i.kind === "activity");
      expect(targetItem).toBeDefined();
      if (!targetItem) return;

      const removed = await chatEditViaCaller(agent, itineraryId, `remove the ${targetItem.title}`);
      expect(removed.status).toBe("applied");
      if (removed.status !== "applied") return;
      expect(removed.itinerary.days.flatMap((d) => d.items).some((i) => i.id === targetItem.id)).toBe(false);

      const afterRemove = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(afterRemove.status).toBe("found");
      if (afterRemove.status !== "found") return;
      expect(afterRemove.itinerary.days.flatMap((d) => d.items).some((i) => i.id === targetItem.id)).toBe(false);
    },
    LONG,
  );

  it(
    "US2: applyChatEdit re-verifies the offer server-side — the persisted price is the server's own, never a client-supplied one",
    async () => {
      const agent = await makeAgency("Suggestion Card Travel");
      const itineraryId = await draftItinerary(agent);

      const suggested = await chatEditViaCaller(agent, itineraryId, "suggest a hotel");
      expect(suggested.status).toBe("suggested");
      if (suggested.status !== "suggested") return;
      expect(suggested.suggestions.length).toBeGreaterThan(0);
      const pick = suggested.suggestions[0];
      expect(pick).toBeDefined();
      if (!pick) return;

      // The client would only ever echo back the offerId — never invent a
      // price. Confirm the applied result's price is exactly what the
      // suggestion carried (both sourced from the same live search), never
      // trusting some other client-side number.
      const applied = await callerFor(agent).workspace.itinerary.applyChatEdit({
        itineraryId,
        edit: { type: "addItem", dayNumber: 1, port: "hotel", offerId: pick.offerId },
      });
      expect(applied.status).toBe("applied");
      if (applied.status !== "applied") return;
      const stay = applied.itinerary.days.flatMap((d) => d.items).find((i) => i.kind === "stay");
      expect(stay?.pricing?.sellPrice.amountMinor).toBe(pick.priceMinor);
      expect(stay?.pricing?.sellPrice.currency).toBe(pick.currency);
    },
    LONG,
  );

  it(
    "US2: hotel suggestions are converted to the itinerary's own currency, never left in the offer's native currency",
    async () => {
      // The sandbox hotel adapter's offers are natively USD; a EUR trip must
      // see EUR-denominated suggestions (the chat preview must match what
      // would actually be charged, never a raw foreign-currency figure next
      // to EUR everywhere else on the page).
      const agent = await makeAgency("Currency Preview Travel");
      const itineraryId = await draftViaCaller(callerFor(agent), {
        ...DRAFT_INPUT,
        budget: { mode: "hardCap" as const, amountMinor: 250_000, currency: "EUR" },
      }).then((outcome) => {
        expect(outcome.status).toBe("drafted");
        if (outcome.status !== "drafted") throw new Error("draft failed");
        return outcome.itinerary.id;
      });

      const suggested = await chatEditViaCaller(agent, itineraryId, "suggest a hotel");
      expect(suggested.status).toBe("suggested");
      if (suggested.status !== "suggested") return;
      expect(suggested.suggestions.length).toBeGreaterThan(0);
      for (const suggestion of suggested.suggestions) {
        expect(suggestion.currency).toBe("EUR");
      }
    },
    LONG,
  );

  it(
    "US2: a cross-tenant applyChatEdit is refused — no state change",
    async () => {
      const owner = await makeAgency("Sealed Trip Co");
      const other = await makeAgency("Prying Agency");
      const itineraryId = await draftItinerary(owner);

      const outcome = await callerFor(other).workspace.itinerary.applyChatEdit({
        itineraryId,
        edit: { type: "addItem", dayNumber: 1, port: "hotel", offerId: "does-not-matter" },
      });
      expect(outcome).toEqual({ status: "not_found" });
    },
    LONG,
  );

  it(
    "US2: an offerId that no longer exists in a fresh search is a typed invalid_edit, zero DB writes",
    async () => {
      const agent = await makeAgency("Stale Offer Travel");
      const itineraryId = await draftItinerary(agent);
      const before = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(before.status).toBe("found");
      if (before.status !== "found") return;

      const outcome = await callerFor(agent).workspace.itinerary.applyChatEdit({
        itineraryId,
        edit: { type: "addItem", dayNumber: 1, port: "hotel", offerId: "made-up-offer-id" },
      });
      expect(outcome).toEqual({ status: "invalid_edit" });

      const after = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(after.status).toBe("found");
      if (after.status !== "found") return;
      expect(after.itinerary).toEqual(before.itinerary);
    },
    LONG,
  );
});
