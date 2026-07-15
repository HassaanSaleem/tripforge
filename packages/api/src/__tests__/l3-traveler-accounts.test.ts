// L3 — traveler client accounts against a REAL database (spec 030 SC-001-004).
// Covers `clientView.me` (identity echo, own-row-only), the INV-024 ladder (a
// traveler session is barred from every workspace.* procedure), cross-traveler
// isolation, and a regression witness that anonymous itinerary/handoff behavior
// and the INV-020 redacted projection are UNCHANGED by this feature. NOT a money
// path — no concurrency/conservation treatment required (same class as
// l3-trip-handoffs.test.ts).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §3). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createDb,
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

describe.skipIf(!DATABASE_URL)("L3 traveler client accounts (real Postgres)", () => {
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
    const agencyId = `l3ta-agency-${randomUUID()}`;
    const userId = `l3ta-user-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name, slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: `${name} User`, email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  /** A traveler: a `user` row with NO `member` row (research D1) — the same
   * org-less shape `getSessionContext` already treats as a traveler session. */
  async function makeTraveler(name: string, email: string): Promise<SessionContext> {
    const userId = `l3ta-traveler-${randomUUID()}`;
    await handle.db.insert(userTable).values({ id: userId, name, email });
    return { userId };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  const DRAFT_INPUT = {
    destination: "Lisbon",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
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

  it(
    "US1: anonymous caller is UNAUTHORIZED on clientView.me (FR-003)",
    async () => {
      await expect(callerFor(null).clientView.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
    LONG,
  );

  it(
    "US1: a signed-in traveler's clientView.me returns exactly their own identity, never another traveler's (FR-004)",
    async () => {
      const amina = await makeTraveler("Amina Yusuf", `amina-${randomUUID()}@example.test`);
      const priya = await makeTraveler("Priya Shah", `priya-${randomUUID()}@example.test`);

      const aminaIdentity = await callerFor(amina).clientView.me();
      expect(aminaIdentity).toEqual({ name: "Amina Yusuf", email: expect.stringContaining("amina-") });

      const priyaIdentity = await callerFor(priya).clientView.me();
      expect(priyaIdentity).toEqual({ name: "Priya Shah", email: expect.stringContaining("priya-") });
      expect(priyaIdentity?.email).not.toBe(aminaIdentity?.email);
    },
    LONG,
  );

  it(
    "US1: a signed-in AGENT's own clientView.me also succeeds (FR-005) — identity echo is session-tier-agnostic",
    async () => {
      const agent = await makeAgency("Wanderlust Travel Co");
      const identity = await callerFor(agent).clientView.me();
      expect(identity).toEqual({ name: "Wanderlust Travel Co User", email: expect.any(String) });
    },
    LONG,
  );

  it(
    "US3: a traveler session is FORBIDDEN from every workspace.* procedure (INV-024) — sign-in never grants workspace access",
    async () => {
      const traveler = await makeTraveler("Jonas Berg", `jonas-${randomUUID()}@example.test`);

      await expect(callerFor(traveler).workspace.whoami()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        callerFor(traveler).workspace.itinerary.share({ itineraryId: randomUUID() }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(callerFor(traveler).workspace.tripHandoffs.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
    LONG,
  );

  it(
    "US3: anonymous clientView.itinerary + requestHandoff are BYTE-IDENTICAL to pre-feature behavior (regression, INV-018)",
    async () => {
      const agent = await makeAgency("Atlas Journeys");
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
    },
    LONG,
  );

  it(
    "US3: ClientItineraryView carries NO name/email/identity field regardless of caller session state (INV-020) — identity lives ONLY behind clientView.me",
    async () => {
      const agent = await makeAgency("Kaido Journeys");
      const traveler = await makeTraveler("Rosa Lima", `rosa-${randomUUID()}@example.test`);
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      for (const session of [null, traveler, agent] as const) {
        const view = await callerFor(session).clientView.itinerary({ token });
        expect(view.status).toBe("found");
        const serialized = JSON.stringify(view);
        expect(serialized).not.toMatch(/rosa-|Rosa Lima|Kaido Journeys User/);
        expect(serialized.toLowerCase()).not.toContain("email");
        expect(serialized.toLowerCase()).not.toContain("netminor");
        expect(serialized.toLowerCase()).not.toContain("markup");
      }
    },
    LONG,
  );
});
