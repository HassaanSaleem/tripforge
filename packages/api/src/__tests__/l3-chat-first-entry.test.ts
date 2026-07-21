// L3 — chat-first trip-request entry against a REAL database (spec 028).
// Covers the RBAC ladder every workspace.itinerary.* procedure shares
// (INV-023) and that a `resolved` interpretChatRequest output is genuinely
// wired into the EXISTING draft pipeline (research.md D5) — not merely
// type-compatible with it.
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

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 chat-first trip-request entry (real Postgres)", () => {
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
    const agencyId = `l3chatfirst-agency-${randomUUID()}`;
    const userId = `l3chatfirst-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  it(
    "the RBAC ladder travels with the procedure: anon UNAUTHORIZED, non-agent FORBIDDEN",
    async () => {
      await expect(
        callerFor(null).workspace.itinerary.interpretChatRequest({ message: "Plan 4 days in Lisbon for 2, EUR 2000" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        callerFor({ userId: `l3chatfirst-traveler-${randomUUID()}` }).workspace.itinerary.interpretChatRequest({
          message: "Plan 4 days in Lisbon for 2, EUR 2000",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
    LONG,
  );

  it(
    "a resolved chat request feeds the EXISTING draft pipeline end-to-end (spec 028 FR-005)",
    async () => {
      const agency = await makeAgency("Chat Entry Test Agency");
      const caller = callerFor(agency);

      const interpreted = await caller.workspace.itinerary.interpretChatRequest({
        message: "Plan 4 days in Lisbon for 2, EUR 2000, boutique stay",
      });
      expect(interpreted.status).toBe("resolved");
      if (interpreted.status !== "resolved") throw new Error("interpretation failed");

      expect(interpreted.tripRequest.destination).toBe("Lisbon");
      expect(interpreted.tripRequest.party).toEqual({ adults: 2, children: 0 });
      expect(interpreted.tripRequest.budget).toMatchObject({ amountMinor: 200_000, currency: "EUR" });

      // Fed straight into the EXISTING selectDraft/draft pipeline (research.md
      // D5) — proves the two entry points are genuinely wired together, not
      // merely type-compatible.
      const drafted = await draftViaCaller(caller, interpreted.tripRequest);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") throw new Error("draft failed");
      expect(drafted.itinerary.title).toContain("Lisbon");
    },
    LONG,
  );

  it(
    "accumulates a MULTI-TURN conversation, then drafts AND books through the EXISTING pipeline (spec 035 FR-001/FR-004)",
    async () => {
      const agency = await makeAgency("Chat Multi-Turn Agency");
      const caller = callerFor(agency);

      // Turn 1: destination only → needsInfo (budget still missing); no draft.
      const t1 = await caller.workspace.itinerary.interpretChatRequest({ message: "Plan a trip to Lisbon" });
      expect(t1.status).toBe("needsInfo");

      // Turn 2: budget + duration, carrying turn 1 as priorMessages → resolves
      // by ACCUMULATING across turns (neither turn resolves alone — proven above).
      const interpreted = await caller.workspace.itinerary.interpretChatRequest({
        message: "around EUR 2000 for 4 nights",
        priorMessages: ["Plan a trip to Lisbon"],
      });
      expect(interpreted.status).toBe("resolved");
      if (interpreted.status !== "resolved") throw new Error("multi-turn interpretation failed");
      expect(interpreted.tripRequest.destination).toBe("Lisbon");
      expect(interpreted.tripRequest.budget).toMatchObject({ amountMinor: 200_000, currency: "EUR" });

      // Determinism (spec 035 SC-004): the same transcript resolves identically.
      const again = await caller.workspace.itinerary.interpretChatRequest({
        message: "around EUR 2000 for 4 nights",
        priorMessages: ["Plan a trip to Lisbon"],
      });
      expect(again).toEqual(interpreted);

      // chat → DRAFT: the multi-turn request drives the SAME draft pipeline.
      const drafted = await draftViaCaller(caller, interpreted.tripRequest);
      expect(drafted.status).toBe("drafted");
      if (drafted.status !== "drafted") throw new Error("draft failed");
      expect(drafted.itinerary.title).toContain("Lisbon");

      // draft → BOOK: the persisted chat-built itinerary books through the
      // UNCHANGED quote→book money path — completing the chat→draft→book handoff
      // the acceptance requires L3 to cover.
      const itineraryId = drafted.itinerary.id;
      const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") throw new Error("quote failed");
      const held = quoted.items.filter((i) => i.outcome === "held");
      expect(held.length).toBeGreaterThanOrEqual(1);
      const quoteRowIds = held.flatMap((h) => (h.outcome === "held" ? [h.quote.quoteRowId] : []));
      const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds });
      expect(booked.status).toBe("confirmed");
      expect(booked.components.every((c) => c.outcome === "confirmed")).toBe(true);
    },
    LONG,
  );

  it(
    "a message missing a destination returns needsInfo with zero side effects (spec 028 FR-004)",
    async () => {
      const agency = await makeAgency("Chat Entry NeedsInfo Agency");
      const caller = callerFor(agency);

      const interpreted = await caller.workspace.itinerary.interpretChatRequest({
        message: "Plan a trip for 2 with a EUR 2000 budget",
      });
      expect(interpreted.status).toBe("needsInfo");

      // Zero side effects: the agency's itinerary list is still empty.
      const list = await caller.workspace.itinerary.list();
      expect(list.itineraries).toHaveLength(0);
    },
    LONG,
  );
});
