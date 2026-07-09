// L3 — client-view share against a REAL database (spec 010 SC-003/004/005/006).
// Walks draft → share → anonymous resolve → book → booked-mark through the full
// tRPC surface. The trust boundary is verified against the SERIALIZED PAYLOAD an
// anonymous caller receives (not rendered pixels): every confidential value read
// back from the stored row — net rates, supplier refs, tenant/document/item ids —
// must be absent from what the traveler is served (FR-007).
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §2). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  count,
  createDb,
  eq,
  itinerary as itineraryTable,
  itineraryShareLink,
  organization,
  user as userTable,
  type Db,
  type DbHandle,
} from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { parseItinerary } from "@tripforge/itinerary-schema";
import { appRouter } from "../routers/root.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 client-view share (real Postgres)", () => {
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
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: db ?? handle.db,
    };
  }

  async function makeAgency(name: string): Promise<SessionContext & { agencyId: string }> {
    const agencyId = `l3cv-agency-${randomUUID()}`;
    const userId = `l3cv-user-${randomUUID()}`;
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

  /** Draft a real itinerary through the product path. */
  async function draftItinerary(session: SessionContext): Promise<string> {
    const drafted = await callerFor(session).workspace.itinerary.draft(DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  /** Every string/number leaf of a JSON-serializable value. */
  function leaves(value: unknown, acc: Array<string | number> = []): Array<string | number> {
    if (typeof value === "string" || typeof value === "number") acc.push(value);
    else if (Array.isArray(value)) for (const v of value) leaves(v, acc);
    else if (value && typeof value === "object") for (const v of Object.values(value)) leaves(v, acc);
    return acc;
  }

  it(
    "US2: share mints THE durable link — idempotent and race-converging (FR-004/SC-006)",
    async () => {
      const agent = await makeAgency("Wanderlust Travel Co");
      const itineraryId = await draftItinerary(agent);

      const first = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(first.status).toBe("shared");
      expect(first.token).toMatch(/^[0-9a-f-]{36}$/i);
      expect(first.path).toBe(`/view/${first.token}`);

      // Re-share converges on the same link.
      const again = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(again).toEqual(first);

      // Concurrent shares: UNIQUE(itinerary_id) is the arbiter — one row, one token.
      const [a, b] = await Promise.all([
        callerFor(agent).workspace.itinerary.share({ itineraryId }),
        callerFor(agent).workspace.itinerary.share({ itineraryId }),
      ]);
      expect(a).toEqual(first);
      expect(b).toEqual(first);
      const [links] = await handle.db
        .select({ n: count() })
        .from(itineraryShareLink)
        .where(eq(itineraryShareLink.itineraryId, itineraryId));
      expect(Number(links?.n ?? 0)).toBe(1);
    },
    LONG,
  );

  it(
    "US2: tenancy + role ladder — cross-tenant NOT_FOUND (no oracle), anon UNAUTHORIZED, traveler FORBIDDEN",
    async () => {
      const owner = await makeAgency("Atlas Journeys");
      const other = await makeAgency("Rival Tours");
      const itineraryId = await draftItinerary(owner);

      // Cross-tenant share is indistinguishable from an unknown itinerary (FR-002).
      await expect(callerFor(other).workspace.itinerary.share({ itineraryId })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        callerFor(owner).workspace.itinerary.share({ itineraryId: randomUUID() }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // INV-023 ladder on the mutation.
      await expect(callerFor(null).workspace.itinerary.share({ itineraryId })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      const traveler: SessionContext = { userId: `l3cv-traveler-${randomUUID()}` };
      await expect(callerFor(traveler).workspace.itinerary.share({ itineraryId })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
    LONG,
  );

  it(
    "US1: anonymous resolve serves the redacted view — full-payload confidentiality scan (SC-003)",
    async () => {
      const agent = await makeAgency("Coastal Escapes");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");

      // ANONYMOUS caller — no session of any kind (FR-005).
      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;
      const view = resolved.view;

      expect(view.agencyName).toBe("Coastal Escapes");
      expect(view.days.length).toBeGreaterThan(0);
      const items = view.days.flatMap((d) => d.items);
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((i) => i.sellMinor !== null && i.sellMinor > 0)).toBe(true);
      expect(items.every((i) => i.booked === false)).toBe(true);

      // The total the traveler sees is exactly the sum of the item prices shown
      // (FR-008 — server-computed, display-consistent).
      const shownSum = items.reduce((sum, i) => sum + (i.sellMinor ?? 0), 0);
      expect(view.totalSellMinor).toBe(shownSum);

      // Confidentiality: no forbidden KEY anywhere in the payload…
      const payload = JSON.stringify(resolved);
      for (const forbiddenKey of [
        "netRate",
        "netMinor",
        "markup",
        "supplyRef",
        "externalId",
        "provenance",
        "budgetMode",
        "allocated",
        "tripRequest",
        "agencyId",
        "schemaVersion",
      ]) {
        expect(payload).not.toContain(forbiddenKey);
      }

      // …and no confidential VALUE read back from the stored row (exact-leaf
      // comparison — immune to substring coincidences).
      const [row] = await handle.db.select().from(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      const document = parseItinerary(row?.document);
      const viewLeaves = new Set(leaves(resolved));
      const confidential: Array<string | number> = [document.id, document.agencyId];
      for (const day of document.days) {
        for (const item of day.items) {
          confidential.push(item.id);
          // Draft-time documents set sellPrice = netRate (markup applies at
          // quote time — assemble.ts FR-007), so the net AMOUNT is only a
          // scannable secret when it differs from the item's own sell price.
          // The distinct-value redaction case is pinned by the L1 projection
          // suite with separate net/sell sentinels; here the KEY scan above
          // plus ids/refs/budget cover the stored-row side.
          if (item.pricing && item.pricing.netRate.amountMinor !== item.pricing.sellPrice.amountMinor) {
            confidential.push(item.pricing.netRate.amountMinor);
          }
          if (item.supplyRef) confidential.push(item.supplyRef.externalId);
        }
      }
      confidential.push(document.pricing.total.amountMinor);
      for (const secret of confidential) {
        expect(viewLeaves.has(secret), `confidential value leaked: ${String(secret)}`).toBe(false);
      }
    },
    LONG,
  );

  it(
    "US1: unknown token and deleted itinerary resolve not_found (FR-003) — no oracle",
    async () => {
      const anon = callerFor(null);
      const unknown = await anon.clientView.itinerary({ token: randomUUID() });
      expect(unknown).toEqual({ status: "not_found" });

      const agent = await makeAgency("Ephemeral Trips");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");

      // Deleting the itinerary cascades the link away — same not_found surface.
      await handle.db.delete(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      const gone = await anon.clientView.itinerary({ token: shared.token });
      expect(gone).toEqual({ status: "not_found" });
    },
    LONG,
  );

  it(
    "US3: booking through the real money path marks exactly the booked item (FR-009)",
    async () => {
      const agent = await makeAgency("Harbor & Vine Travel");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");

      // Real quote → book of ONE held item (spec 005 surface, sandbox suppliers).
      const quoted = await callerFor(agent).workspace.booking.quote({ itineraryId, markupBps: 1500 });
      const held = quoted.items.flatMap((i) => (i.outcome === "held" ? [i] : []));
      expect(held.length).toBeGreaterThan(0);
      const target = held[0]!;
      const booked = await callerFor(agent).workspace.booking.book({
        itineraryId,
        quoteRowIds: [target.quote.quoteRowId],
      });
      expect(booked.status).toBe("confirmed");

      // Identify the booked item's title via the stored document (the view
      // deliberately carries no item ids).
      const [row] = await handle.db.select().from(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      const document = parseItinerary(row?.document);
      const bookedTitle = document.days
        .flatMap((d) => d.items)
        .find((i) => i.id === target.itemId)?.title;
      expect(bookedTitle).toBeTruthy();

      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;
      const items = resolved.view.days.flatMap((d) => d.items);
      expect(items.filter((i) => i.booked)).toHaveLength(1);
      expect(items.find((i) => i.booked)?.title).toBe(bookedTitle);
    },
    LONG,
  );
});
