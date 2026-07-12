// Tenant-scoped itinerary reads (spec 011 contract §2). The marketplace
// listing form's picker projection — id/title/currency only; canonical
// documents stay behind itineraryOverview. Deliberately NOT in
// services/booking.ts (research D3): that module is past the split threshold
// with an open quality-sweep ticket.
import { and, desc, eq, itinerary as itineraryTable, marketplaceListing, scopedWhere, type Db } from "@tripforge/db";
import { ItinerarySchema, parseItinerary, type Itinerary, type MediaRef } from "@tripforge/itinerary-schema";
import type { AgentSessionContext, Container } from "../context.js";

interface MyItineraryListing {
  listingId: string;
  priceMinor: number;
  currency: string;
}

export interface MyItinerary {
  id: string;
  title: string;
  currency: string;
  createdAt: string;
  /** Active marketplace listing for this trip, if any (spec 014 US2). */
  listing: MyItineraryListing | null;
}

/**
 * The caller agency's own itineraries, newest first. Every row is pinned to
 * the session's tenant (INV-004) — cross-tenant rows are unreachable by
 * construction, witnessed by the L3 suite. LEFT JOINs the itinerary's own
 * active listing (research D4) — the partial unique active-listing index
 * (marketplace_listing_active_itinerary_idx) guarantees at most one match per
 * itinerary, so the join cannot multiply rows.
 */
export async function listItineraries(
  container: Container,
  session: AgentSessionContext,
): Promise<{ itineraries: MyItinerary[] }> {
  const db: Db | undefined = container.db;
  if (!db) throw new Error("database not configured");
  const rows = await db
    .select({
      id: itineraryTable.id,
      title: itineraryTable.title,
      currency: itineraryTable.currency,
      createdAt: itineraryTable.createdAt,
      listingId: marketplaceListing.id,
      listingPriceMinor: marketplaceListing.priceMinor,
      listingCurrency: marketplaceListing.currency,
    })
    .from(itineraryTable)
    .leftJoin(
      marketplaceListing,
      and(eq(marketplaceListing.itineraryId, itineraryTable.id), eq(marketplaceListing.status, "active")),
    )
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId))
    .orderBy(desc(itineraryTable.createdAt));
  return {
    itineraries: rows.map((row) => ({
      id: row.id,
      title: row.title,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      listing:
        row.listingId === null
          ? null
          : {
              listingId: row.listingId,
              priceMinor: row.listingPriceMinor as number,
              currency: row.listingCurrency as string,
            },
    })),
  };
}

// ─── Media attach/detach (spec 015: content library v0) ──────────────────────
//
// The FIRST mutation to the stored `document` column after initial draft
// (research D3) — booking never rewrites it. A single agent editing their own
// trip through the UI is not a money path or a multi-writer race (unlike
// quote/book's claim gate), so a plain read-modify-write with no optimistic
// locking is the v0 simplicity default (Constitution's "simplicity default...
// YAGNI"); a version column is a documented follow-up if concurrent itinerary
// editing is ever introduced.

export type MediaTarget = { scope: "gallery" } | { scope: "item"; itemId: string };

export type AttachMediaOutcome =
  | { status: "attached"; media: MediaRef }
  | { status: "not_found" }
  | { status: "item_not_found" };

export type DetachMediaOutcome = { status: "detached" } | { status: "not_found" } | { status: "item_not_found" };

async function loadOwnedItinerary(
  db: Db,
  session: AgentSessionContext,
  itineraryId: string,
): Promise<Itinerary | null> {
  const rows = await db
    .select({ document: itineraryTable.document })
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId, eq(itineraryTable.id, itineraryId)))
    .limit(1);
  const row = rows[0];
  return row ? parseItinerary(row.document) : null;
}

async function persistDocument(db: Db, itineraryId: string, document: Itinerary): Promise<void> {
  const validated = ItinerarySchema.parse(document); // INV-001: canonical on write, not just on draft
  await db
    .update(itineraryTable)
    .set({ document: validated, updatedAt: new Date() })
    .where(eq(itineraryTable.id, itineraryId));
}

/** Push `mediaRef` onto `target`'s array, deduping by id (research D4) — attaching
 * an already-attached asset to the same target is a no-op, not a duplicate. */
function withMediaAttached(
  document: Itinerary,
  target: MediaTarget,
  mediaRef: MediaRef,
): { document: Itinerary; itemFound: boolean } {
  if (target.scope === "gallery") {
    const already = document.media.some((m) => m.id === mediaRef.id);
    return { document: already ? document : { ...document, media: [...document.media, mediaRef] }, itemFound: true };
  }
  let itemFound = false;
  const days = document.days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      if (item.id !== target.itemId) return item;
      itemFound = true;
      const already = item.media.some((m) => m.id === mediaRef.id);
      return already ? item : { ...item, media: [...item.media, mediaRef] };
    }),
  }));
  return { document: { ...document, days }, itemFound };
}

/** Filter `mediaRefId` out of `target`'s array — absent id is a no-op (detach
 * is idempotent, the caller's desired end state already holds). */
function withMediaDetached(
  document: Itinerary,
  target: MediaTarget,
  mediaRefId: string,
): { document: Itinerary; itemFound: boolean } {
  if (target.scope === "gallery") {
    return { document: { ...document, media: document.media.filter((m) => m.id !== mediaRefId) }, itemFound: true };
  }
  let itemFound = false;
  const days = document.days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      if (item.id !== target.itemId) return item;
      itemFound = true;
      return { ...item, media: item.media.filter((m) => m.id !== mediaRefId) };
    }),
  }));
  return { document: { ...document, days }, itemFound };
}

/**
 * Attach a library media asset to an itinerary's gallery or a specific item
 * (contracts §4). Refuses (typed `not_found`) for any itinerary OR media
 * asset not owned by the caller's agency — cross-tenant and unknown-id
 * collapse to the same outcome (INV-004, no existence oracle).
 */
export async function attachMedia(
  container: Container,
  session: AgentSessionContext,
  input: { itineraryId: string; mediaAssetId: string; target: MediaTarget },
): Promise<AttachMediaOutcome> {
  const db: Db | undefined = container.db;
  if (!db) throw new Error("database not configured");

  const asset = await container.mediaStore.get(session.agencyId, input.mediaAssetId);
  if (!asset) return { status: "not_found" };

  const document = await loadOwnedItinerary(db, session, input.itineraryId);
  if (!document) return { status: "not_found" };

  const mediaRef: MediaRef = {
    id: asset.id,
    kind: asset.kind,
    url: asset.url,
    source: asset.source,
    alt: asset.alt,
    ...(asset.attribution !== undefined ? { attribution: asset.attribution } : {}),
  };
  const { document: updated, itemFound } = withMediaAttached(document, input.target, mediaRef);
  if (!itemFound) return { status: "item_not_found" };

  await persistDocument(db, input.itineraryId, updated);
  return { status: "attached", media: mediaRef };
}

/** Detach a media ref from an itinerary's gallery or a specific item (contracts §5). */
export async function detachMedia(
  container: Container,
  session: AgentSessionContext,
  input: { itineraryId: string; mediaRefId: string; target: MediaTarget },
): Promise<DetachMediaOutcome> {
  const db: Db | undefined = container.db;
  if (!db) throw new Error("database not configured");

  const document = await loadOwnedItinerary(db, session, input.itineraryId);
  if (!document) return { status: "not_found" };

  const { document: updated, itemFound } = withMediaDetached(document, input.target, input.mediaRefId);
  if (!itemFound) return { status: "item_not_found" };

  await persistDocument(db, input.itineraryId, updated);
  return { status: "detached" };
}
