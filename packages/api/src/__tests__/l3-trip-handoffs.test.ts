// L3 — trip handoff requests against a REAL database (spec 022 SC-001-004).
// Walks submit (via the public share token) → tenant-scoped inbox list →
// accept through the full tRPC surface, asserting exact state deltas and
// INV-004 tenant scoping. NOT a money path — no concurrency/conservation
// treatment required (unlike l3-group-travel.test.ts/l3-booking.test.ts).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §3). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createDb,
  eq,
  organization,
  tripHandoffRequest as tripHandoffRequestTable,
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

describe.skipIf(!DATABASE_URL)("L3 trip handoff requests (real Postgres)", () => {
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
    const agencyId = `l3th-agency-${randomUUID()}`;
    const userId = `l3th-user-${randomUUID()}`;
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
    "US1: anonymous submit creates a request stamped with the itinerary's CURRENT owning agency (FR-003/011)",
    async () => {
      const agent = await makeAgency("Coastal Escapes");
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      const outcome = await callerFor(null).clientView.requestHandoff({
        token,
        contactName: "Priya Shah",
        notes: "Would love help with the transfers.",
      });
      expect(outcome.status).toBe("submitted");
      if (outcome.status !== "submitted") return;

      const rows = await handle.db
        .select()
        .from(tripHandoffRequestTable)
        .where(eq(tripHandoffRequestTable.id, outcome.requestId));
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row?.agencyId).toBe(agent.agencyId);
      expect(row?.itineraryId).toBe(itineraryId);
      expect(row?.contactName).toBe("Priya Shah");
      expect(row?.contactEmail).toBeNull();
      expect(row?.notes).toBe("Would love help with the transfers.");
      expect(row?.status).toBe("new");
    },
    LONG,
  );

  it(
    "US1: missing contactName is rejected, unknown token is not_found — neither creates a row",
    async () => {
      const agent = await makeAgency("Atlas Journeys");
      const itineraryId = await draftItinerary(agent);
      const token = await shareToken(agent, itineraryId);

      await expect(
        // @ts-expect-error — deliberately omitting the required field to prove server-side validation.
        callerFor(null).clientView.requestHandoff({ token, notes: "no name given" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      const unknown = await callerFor(null).clientView.requestHandoff({
        token: randomUUID(),
        contactName: "Someone",
      });
      expect(unknown.status).toBe("not_found");

      const [rows] = await handle.db
        .select()
        .from(tripHandoffRequestTable)
        .where(eq(tripHandoffRequestTable.itineraryId, itineraryId));
      expect(rows).toBeUndefined();
    },
    LONG,
  );

  it(
    "US2: tenant-scoped inbox — an agency's requests are invisible to a different agency (INV-004)",
    async () => {
      const owner = await makeAgency("Kaido Journeys");
      const other = await makeAgency("Rival Tours");
      const itineraryId = await draftItinerary(owner);
      const token = await shareToken(owner, itineraryId);

      await callerFor(null).clientView.requestHandoff({ token, contactName: "Jonas Berg" });

      const ownerInbox = await callerFor(owner).workspace.tripHandoffs.list();
      expect(ownerInbox.requests.some((r) => r.contactName === "Jonas Berg")).toBe(true);

      const otherInbox = await callerFor(other).workspace.tripHandoffs.list();
      expect(otherInbox.requests.some((r) => r.contactName === "Jonas Berg")).toBe(false);
    },
    LONG,
  );

  it(
    "US2: accept is a tenant-scoped, idempotent new -> accepted transition (FR-008)",
    async () => {
      const owner = await makeAgency("Meridian DMC");
      const other = await makeAgency("Outsider Travel");
      const itineraryId = await draftItinerary(owner);
      const token = await shareToken(owner, itineraryId);

      const submitted = await callerFor(null).clientView.requestHandoff({
        token,
        contactName: "Lena Marsh",
      });
      expect(submitted.status).toBe("submitted");
      if (submitted.status !== "submitted") return;

      // Cross-tenant accept is refused (NOT_FOUND, no existence oracle).
      await expect(
        callerFor(other).workspace.tripHandoffs.accept({ requestId: submitted.requestId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const accepted = await callerFor(owner).workspace.tripHandoffs.accept({ requestId: submitted.requestId });
      expect(accepted).toEqual({ status: "accepted", requestId: submitted.requestId });

      const inboxAfter = await callerFor(owner).workspace.tripHandoffs.list();
      const row = inboxAfter.requests.find((r) => r.id === submitted.requestId);
      expect(row?.status).toBe("accepted");

      // Re-accepting an already-accepted request is idempotent, not an error.
      const acceptedAgain = await callerFor(owner).workspace.tripHandoffs.accept({
        requestId: submitted.requestId,
      });
      expect(acceptedAgain).toEqual({ status: "accepted", requestId: submitted.requestId });
    },
    LONG,
  );

  it(
    "US2/INV-023: anonymous is UNAUTHORIZED and a traveler (no agency) is FORBIDDEN on the inbox",
    async () => {
      await expect(appRouter.createCaller({ session: null, container: makeContainer() }).workspace.tripHandoffs.list()).rejects.toMatchObject(
        { code: "UNAUTHORIZED" },
      );
      const traveler: SessionContext = { userId: `l3th-traveler-${randomUUID()}` };
      await expect(
        appRouter.createCaller({ session: traveler, container: makeContainer() }).workspace.tripHandoffs.list(),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
    LONG,
  );
});
