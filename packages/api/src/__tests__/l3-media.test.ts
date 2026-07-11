// L3 — content library v0 against a REAL database (spec 015). Covers the
// media library (register/list/get, tenant-scoped INV-004, closed-enum
// refusal) and itinerary attach/detach (gallery + per-item, round-trip
// through workspace.itinerary.get, cross-tenant refusal, unknown-item
// refusal) through the full tRPC surface.
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
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 content library v0 (real Postgres)", () => {
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
    const agencyId = `l3media-agency-${randomUUID()}`;
    const userId = `l3media-user-${randomUUID()}`;
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
    const drafted = await callerFor(session).workspace.itinerary.draft(DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    return drafted.itinerary.id;
  }

  const VALID_MEDIA = {
    source: "agent-upload" as const,
    kind: "image" as const,
    url: "https://images.example.test/lisbon-view.jpg",
    alt: "View over the Tagus river",
  };

  it(
    "US1: register + list is tenant-scoped — cross-tenant list/get never leak (INV-004)",
    async () => {
      const a = await makeAgency("Coastal Escapes");
      const b = await makeAgency("Rival Tours");

      const registered = await callerFor(a).workspace.media.register(VALID_MEDIA);
      expect(registered.status).toBe("registered");
      if (registered.status !== "registered") return;
      expect(registered.asset.source).toBe(VALID_MEDIA.source);
      expect(registered.asset.alt).toBe(VALID_MEDIA.alt);

      const ownList = await callerFor(a).workspace.media.list();
      expect(ownList.assets.map((asset) => asset.id)).toContain(registered.asset.id);

      // Cross-tenant: B's library never contains A's asset (SC-003).
      const otherList = await callerFor(b).workspace.media.list();
      expect(otherList.assets.map((asset) => asset.id)).not.toContain(registered.asset.id);

      const ownGet = await callerFor(a).workspace.media.get({ mediaAssetId: registered.asset.id });
      expect(ownGet).toEqual({ status: "found", asset: registered.asset });
      const otherGet = await callerFor(b).workspace.media.get({ mediaAssetId: registered.asset.id });
      expect(otherGet).toEqual({ status: "not_found" });
    },
    LONG,
  );

  it(
    "US1: a source outside the closed set is refused at the tRPC boundary — nothing persists",
    async () => {
      const agent = await makeAgency("Ephemeral Trips");
      await expect(
        callerFor(agent).workspace.media.register({
          ...VALID_MEDIA,
          // @ts-expect-error — deliberately outside the closed MediaSource set
          source: "scraped-web",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      const list = await callerFor(agent).workspace.media.list();
      expect(list.assets).toHaveLength(0);
    },
    LONG,
  );

  it(
    "US2: attach to gallery AND a specific item round-trips through workspace.itinerary.get",
    async () => {
      const agent = await makeAgency("Harbor & Vine Travel");
      const itineraryId = await draftItinerary(agent);
      const registered = await callerFor(agent).workspace.media.register(VALID_MEDIA);
      expect(registered.status).toBe("registered");
      if (registered.status !== "registered") return;

      const before = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      const firstItemId = before.itinerary.days.flatMap((d) => d.items)[0]?.id;
      expect(firstItemId).toBeTruthy();
      if (!firstItemId) return;

      const galleryAttach = await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: registered.asset.id,
        target: { scope: "gallery" },
      });
      expect(galleryAttach).toEqual({ status: "attached", media: expect.objectContaining({ id: registered.asset.id }) });

      const itemAttach = await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: registered.asset.id,
        target: { scope: "item", itemId: firstItemId },
      });
      expect(itemAttach.status).toBe("attached");

      const after = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(after.itinerary.media.map((m) => m.id)).toContain(registered.asset.id);
      const afterItem = after.itinerary.days.flatMap((d) => d.items).find((i) => i.id === firstItemId);
      expect(afterItem?.media.map((m) => m.id)).toContain(registered.asset.id);

      // Re-attaching the same asset to the same target is a no-op, not a duplicate (research D4).
      await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: registered.asset.id,
        target: { scope: "gallery" },
      });
      const afterDupe = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(afterDupe.itinerary.media.filter((m) => m.id === registered.asset.id)).toHaveLength(1);

      // Detach from the gallery only — the item attachment is untouched.
      const detached = await callerFor(agent).workspace.itinerary.detachMedia({
        itineraryId,
        mediaRefId: registered.asset.id,
        target: { scope: "gallery" },
      });
      expect(detached).toEqual({ status: "detached" });
      const afterDetach = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(afterDetach.itinerary.media.map((m) => m.id)).not.toContain(registered.asset.id);
      const afterDetachItem = afterDetach.itinerary.days.flatMap((d) => d.items).find((i) => i.id === firstItemId);
      expect(afterDetachItem?.media.map((m) => m.id)).toContain(registered.asset.id);
    },
    LONG,
  );

  it(
    "US2: cross-tenant attach (either the itinerary or the media asset) is refused — no state change",
    async () => {
      const owner = await makeAgency("Atlas Journeys");
      const other = await makeAgency("Outsider Agency");
      const itineraryId = await draftItinerary(owner);
      const ownerMedia = await callerFor(owner).workspace.media.register(VALID_MEDIA);
      expect(ownerMedia.status).toBe("registered");
      if (ownerMedia.status !== "registered") return;
      const otherMedia = await callerFor(other).workspace.media.register(VALID_MEDIA);
      expect(otherMedia.status).toBe("registered");
      if (otherMedia.status !== "registered") return;

      // Other agency cannot attach ITS OWN media to the owner's itinerary.
      await expect(
        callerFor(other).workspace.itinerary.attachMedia({
          itineraryId,
          mediaAssetId: otherMedia.asset.id,
          target: { scope: "gallery" },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // Owner cannot attach the OTHER agency's media to their own itinerary.
      await expect(
        callerFor(owner).workspace.itinerary.attachMedia({
          itineraryId,
          mediaAssetId: otherMedia.asset.id,
          target: { scope: "gallery" },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const after = await callerFor(owner).workspace.itinerary.get({ itineraryId });
      expect(after.itinerary.media).toHaveLength(0);
    },
    LONG,
  );

  it(
    "US2: an unknown item id under target.scope==='item' is a typed item_not_found, not a thrown error",
    async () => {
      const agent = await makeAgency("Half Booked Holidays");
      const itineraryId = await draftItinerary(agent);
      const registered = await callerFor(agent).workspace.media.register(VALID_MEDIA);
      expect(registered.status).toBe("registered");
      if (registered.status !== "registered") return;

      const outcome = await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: registered.asset.id,
        target: { scope: "item", itemId: "no-such-item" },
      });
      expect(outcome).toEqual({ status: "item_not_found" });
    },
    LONG,
  );

  it(
    "US2: detaching an absent ref is idempotent (still 'detached', no error)",
    async () => {
      const agent = await makeAgency("Marginal Gains Travel");
      const itineraryId = await draftItinerary(agent);
      const outcome = await callerFor(agent).workspace.itinerary.detachMedia({
        itineraryId,
        mediaRefId: randomUUID(),
        target: { scope: "gallery" },
      });
      expect(outcome).toEqual({ status: "detached" });
    },
    LONG,
  );
});
