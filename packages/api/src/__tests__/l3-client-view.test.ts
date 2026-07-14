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
  bookingComponent as bookingComponentTable,
  count,
  createDb,
  eq,
  itinerary as itineraryTable,
  itineraryShareLink,
  markupLedger as markupLedgerTable,
  organization,
  user as userTable,
  type Db,
  type DbHandle,
} from "@tripforge/db";
import type { Itinerary } from "@tripforge/itinerary-schema";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { parseItinerary } from "@tripforge/itinerary-schema";
import { appRouter } from "../routers/root.js";
import { draftViaCaller } from "./draft-helper.js";
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
      mediaStore: new SandboxMediaStoreAdapter(db ?? handle.db),
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
    const drafted = await draftViaCaller(callerFor(session), DRAFT_INPUT);
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
          // quote time — assemble.ts FR-007), so on this UN-BOOKED trip the
          // net AMOUNT is only a scannable secret when it differs from the
          // item's own sell price. BOOKED items project the booking record's
          // sell instead (spec 013) — that case is pinned by the seed-0025
          // tests below and the L1 suite's distinct net/sell sentinels; here
          // the KEY scan above plus ids/refs/budget cover the stored-row side.
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
    "spec 015: attached media crosses the allowlist as {kind,url,alt} ONLY — no internal id/source/attribution leak",
    async () => {
      const agent = await makeAgency("Picture Perfect Travel");
      const itineraryId = await draftItinerary(agent);
      const registered = await callerFor(agent).workspace.media.register({
        source: "agent-upload",
        kind: "image",
        url: "https://images.example.test/lisbon-view.jpg",
        alt: "View over the Tagus river",
        attribution: "Photo by Jane Agent — internal-only, must never reach the client",
      });
      expect(registered.status).toBe("registered");
      if (registered.status !== "registered") return;

      const before = await callerFor(agent).workspace.itinerary.get({ itineraryId });
      expect(before.status).toBe("found");
      if (before.status !== "found") return;
      const firstItemId = before.itinerary.days.flatMap((d) => d.items)[0]?.id;
      expect(firstItemId).toBeTruthy();
      if (!firstItemId) return;

      await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: registered.asset.id,
        target: { scope: "gallery" },
      });
      await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: registered.asset.id,
        target: { scope: "item", itemId: firstItemId },
      });

      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");
      if (shared.status !== "shared") return;
      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;

      // Positive: the projected media is exactly {kind,url,alt}.
      expect(resolved.view.media).toEqual([
        { kind: "image", url: registered.asset.url, alt: registered.asset.alt },
      ]);
      // Views preserve day+item order (no ids carried) — index positionally
      // to find the view item matching the attached document item.
      const docItems = before.itinerary.days.flatMap((d) => d.items);
      const viewItems = resolved.view.days.flatMap((d) => d.items);
      const matchingViewItem = viewItems[docItems.findIndex((i) => i.id === firstItemId)];
      expect(matchingViewItem?.media).toEqual([
        { kind: "image", url: registered.asset.url, alt: registered.asset.alt },
      ]);

      // Negative: the internal media-asset id, its `source`, and its
      // `attribution` string appear NOWHERE in the serialized payload
      // (FR-010, SC-004) — a stronger check than a shape assertion, since it
      // catches a leak through any field, not just the expected one.
      const payload = JSON.stringify(resolved);
      expect(payload).not.toContain(registered.asset.id);
      expect(payload).not.toContain("agent-upload");
      expect(payload).not.toContain("internal-only");
    },
    LONG,
  );

  it(
    "spec 027 US3: an uploaded asset crosses the client-view allowlist exactly like a URL-registered one — no agencyId/attribution leak",
    async () => {
      const agent = await makeAgency("Snapshot Sharers");
      const itineraryId = await draftItinerary(agent);
      const uploaded = await callerFor(agent).workspace.media.upload({
        source: "agent-upload",
        kind: "image",
        mimeType: "image/jpeg",
        alt: "A photo from my phone",
        attribution: "Photo by Jane Agent — internal-only, must never reach the client",
        dataBase64: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
      });
      expect(uploaded.status).toBe("uploaded");
      if (uploaded.status !== "uploaded") return;
      expect(uploaded.asset.url).toBe(`http://localhost:3000/api/media/${uploaded.asset.id}`);

      await callerFor(agent).workspace.itinerary.attachMedia({
        itineraryId,
        mediaAssetId: uploaded.asset.id,
        target: { scope: "gallery" },
      });

      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");
      if (shared.status !== "shared") return;
      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;

      // Positive: the projected media is exactly {kind,url,alt} — the url IS
      // the public serving path (`/api/media/{id}`), meant to be fetched with
      // no session (research D3); unlike spec 015's URL-registered case, the
      // asset id legitimately appears here (it addresses the serving route),
      // so it is NOT a leak the way it would be for a registered asset.
      expect(resolved.view.media).toEqual([{ kind: "image", url: uploaded.asset.url, alt: uploaded.asset.alt }]);

      // Negative: agencyId and the confidential attribution string never
      // leak — the one thing that WOULD be a real trust-boundary break.
      const payload = JSON.stringify(resolved);
      expect(payload).not.toContain(agent.agencyId);
      expect(payload).not.toContain("internal-only");
    },
    LONG,
  );

  it(
    "spec 015: an itinerary with no attached media renders media: [] everywhere (SC-005, no regression)",
    async () => {
      const agent = await makeAgency("Text Only Travel");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");
      if (shared.status !== "shared") return;
      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;

      expect(resolved.view.media).toEqual([]);
      for (const item of resolved.view.days.flatMap((d) => d.items)) {
        expect(item.media).toEqual([]);
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
    "a stored document that fails canonical re-validation resolves the SAME not_found — no crash, no existence oracle (seed-0021)",
    async () => {
      const anon = callerFor(null);
      const agent = await makeAgency("Brittle Document Co");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");
      if (shared.status !== "shared") return;

      const before = await handle.db
        .select({ document: itineraryTable.document })
        .from(itineraryTable)
        .where(eq(itineraryTable.id, itineraryId));
      const validDocument = before[0]?.document as Record<string, unknown>;

      // Same repro the ticket describes: a media source outside the closed
      // licensed enum — INV-001 correctly refuses it; this test pins that the
      // refusal is the typed not_found payload, never a thrown 500.
      await handle.db
        .update(itineraryTable)
        .set({
          document: {
            ...validDocument,
            media: [{ id: "m1", kind: "image", url: "https://example.test/x.jpg", alt: "x", source: "scraped-web" }],
          },
        })
        .where(eq(itineraryTable.id, itineraryId));

      const resolved = await anon.clientView.itinerary({ token: shared.token });
      expect(resolved).toEqual({ status: "not_found" }); // indistinguishable from an unknown/deleted token
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

  /** Zip the redacted view's items with the stored document's items — the
   * projection preserves day order (sorted by dayNumber) and item order, and
   * the view deliberately carries no item ids, so positional pairing is the
   * association. Returns [documentItem, viewItem] pairs. */
  function zipViewWithDocument(document: Itinerary, view: { days: Array<{ items: unknown[] }> }) {
    const docItems = [...document.days].sort((a, b) => a.dayNumber - b.dayNumber).flatMap((d) => d.items);
    const viewItems = view.days.flatMap((d) => d.items) as Array<{ booked: boolean; sellMinor: number | null }>;
    expect(viewItems).toHaveLength(docItems.length);
    return docItems.map((doc, i) => [doc, viewItems[i]!] as const);
  }

  /** The persisted per-item booked sells for an itinerary (booking_component
   * ground truth), plus the markup_ledger sell sum for the same components. */
  async function persistedBookedMoney(itineraryId: string) {
    const componentRows = await handle.db
      .select({
        itemId: bookingComponentTable.itemId,
        sellMinor: bookingComponentTable.sellMinor,
        componentId: bookingComponentTable.id,
      })
      .from(bookingComponentTable)
      .where(eq(bookingComponentTable.itineraryId, itineraryId));
    const ledgerRows = await handle.db
      .select({ sellMinor: markupLedgerTable.sellMinor, componentId: markupLedgerTable.bookingComponentId })
      .from(markupLedgerTable);
    const componentIds = new Set(componentRows.map((c) => c.componentId));
    const ledgerSellSum = ledgerRows
      .filter((l) => componentIds.has(l.componentId))
      .reduce((sum, l) => sum + l.sellMinor, 0);
    return { sellByItemId: new Map(componentRows.map((c) => [c.itemId, c.sellMinor])), ledgerSellSum };
  }

  it(
    "seed-0025: a fully booked trip is priced from the booking record — view equals ledger exactly (spec 013 FR-001/FR-002/SC-001)",
    async () => {
      const agent = await makeAgency("Marginal Gains Travel");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");
      if (shared.status !== "shared") return;

      // Quote EVERY bookable item at a deliberately non-default markup, then
      // book all holds — the exact live repro (quickstart §4, 2200 bps).
      const quoted = await callerFor(agent).workspace.booking.quote({ itineraryId, markupBps: 2200 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") return;
      const held = quoted.items.flatMap((i) => (i.outcome === "held" ? [i] : []));
      expect(held.length).toBeGreaterThan(1);
      const booked = await callerFor(agent).workspace.booking.book({
        itineraryId,
        quoteRowIds: held.map((h) => h.quote.quoteRowId),
      });
      expect(booked.status).toBe("confirmed");

      // Ground truth: the persisted booking_component sells (net × 1.22).
      const { sellByItemId, ledgerSellSum } = await persistedBookedMoney(itineraryId);
      expect(sellByItemId.size).toBe(held.length);

      const [row] = await handle.db.select().from(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      const document = parseItinerary(row?.document);

      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;

      // Per item: the traveler sees the BOOKED sell (never the document's
      // draft placeholder, which equals the confidential net rate).
      for (const [docItem, viewItem] of zipViewWithDocument(document, resolved.view)) {
        const bookedSell = sellByItemId.get(docItem.id);
        if (bookedSell !== undefined) {
          expect(viewItem.booked).toBe(true);
          expect(viewItem.sellMinor, `item ${docItem.id} must show the booked sell`).toBe(bookedSell);
          // …and therefore never the confidential net (the document's
          // draft placeholder) — the margin-exposure defect this pins.
          expect(viewItem.sellMinor).not.toBe(docItem.pricing?.netRate.amountMinor);
        }
      }

      // Total: exact minor-unit equality with the markup ledger (SC-001) —
      // every bookable item was booked and unbookable items carry no price at
      // draft time only if unpriced; fold both sources like the view does.
      const unbookedDocSum = [...document.days]
        .flatMap((d) => d.items)
        .filter((i) => !sellByItemId.has(i.id) && i.pricing)
        .reduce((sum, i) => sum + (i.pricing?.sellPrice.amountMinor ?? 0), 0);
      expect(resolved.view.totalSellMinor).toBe(ledgerSellSum + unbookedDocSum);
    },
    LONG,
  );

  it(
    "seed-0025: a mixed trip folds booked sells with document estimates (spec 013 FR-002/FR-003)",
    async () => {
      const agent = await makeAgency("Half Booked Holidays");
      const itineraryId = await draftItinerary(agent);
      const shared = await callerFor(agent).workspace.itinerary.share({ itineraryId });
      expect(shared.status).toBe("shared");
      if (shared.status !== "shared") return;

      const quoted = await callerFor(agent).workspace.booking.quote({ itineraryId, markupBps: 2200 });
      expect(quoted.status).toBe("quoted");
      if (quoted.status !== "quoted") return;
      const held = quoted.items.flatMap((i) => (i.outcome === "held" ? [i] : []));
      expect(held.length).toBeGreaterThan(1);

      // Book ONLY the first hold — the rest stay estimates.
      const target = held[0]!;
      const booked = await callerFor(agent).workspace.booking.book({
        itineraryId,
        quoteRowIds: [target.quote.quoteRowId],
      });
      expect(booked.status).toBe("confirmed");

      const { sellByItemId } = await persistedBookedMoney(itineraryId);
      expect(sellByItemId.size).toBe(1);
      const bookedSell = sellByItemId.get(target.itemId);
      expect(bookedSell).toBe(target.quote.sellMinor);

      const [row] = await handle.db.select().from(itineraryTable).where(eq(itineraryTable.id, itineraryId));
      const document = parseItinerary(row?.document);

      const resolved = await callerFor(null).clientView.itinerary({ token: shared.token });
      expect(resolved.status).toBe("found");
      if (resolved.status !== "found") return;

      let expectedTotal = 0;
      for (const [docItem, viewItem] of zipViewWithDocument(document, resolved.view)) {
        if (docItem.id === target.itemId) {
          // The one booked item shows the realized client price…
          expect(viewItem.booked).toBe(true);
          expect(viewItem.sellMinor).toBe(bookedSell);
          expectedTotal += bookedSell ?? 0;
        } else {
          // …while un-booked items keep the document's stored estimate,
          // untouched (FR-003 — no re-quote, no drift).
          expect(viewItem.booked).toBe(false);
          expect(viewItem.sellMinor).toBe(docItem.pricing?.sellPrice.amountMinor ?? null);
          expectedTotal += docItem.pricing?.sellPrice.amountMinor ?? 0;
        }
      }
      expect(resolved.view.totalSellMinor).toBe(expectedTotal);
    },
    LONG,
  );
});
