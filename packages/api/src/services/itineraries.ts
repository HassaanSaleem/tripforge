// Tenant-scoped itinerary reads (spec 011 contract §2). The marketplace
// listing form's picker projection — id/title/currency only; canonical
// documents stay behind itineraryOverview. Deliberately NOT in
// services/booking.ts (research D3): that module is past the split threshold
// with an open quality-sweep ticket.
import { and, desc, eq, itinerary as itineraryTable, marketplaceListing, scopedWhere, type Db } from "@tripforge/db";
import { ItinerarySchema, parseItinerary, type Itinerary, type MediaRef } from "@tripforge/itinerary-schema";
import {
  applyItineraryEdit,
  convertMoney,
  MoneyError,
  type ApplyEditResult,
  type ExchangeRate,
  type ItineraryEditProposal,
} from "@tripforge/domain";
import type {
  ChatEditRequest as LlmChatEditRequest,
  ChatEditResult as LlmChatEditResult,
  ChatEditStep,
  HotelSuggestion,
} from "@tripforge/llm";
import type { AgentSessionContext, Container } from "../context.js";
import { plannerToolDeps, tripRequestSchema, verifiedSupplyCatalog, type TripRequest } from "./planner.js";
import { findRate } from "../rates.js";

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

// ─── Conversational editing (spec 020) ────────────────────────────────────
//
// Reuses this file's own load-mutate-persist pattern (loadOwnedItinerary/
// persistDocument, established above by attachMedia/detachMedia) and the
// planner's existing criteria-pinning/tool-deps helpers (plannerToolDeps,
// verifiedSupplyCatalog) — no new persistence path, no new supply surface.

async function loadOwnedItineraryWithRequest(
  db: Db,
  session: AgentSessionContext,
  itineraryId: string,
): Promise<{ document: Itinerary; tripRequest: TripRequest } | null> {
  const rows = await db
    .select({ document: itineraryTable.document, tripRequest: itineraryTable.tripRequest })
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId, eq(itineraryTable.id, itineraryId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { document: parseItinerary(row.document), tripRequest: tripRequestSchema.parse(row.tripRequest) };
}

/** Fresh supply re-verification for an `addItem` edit only — `removeItem`
 * needs no offer catalog (FR-006: every added price comes from live supply). */
async function applyEditToItinerary(
  container: Container,
  document: Itinerary,
  tripRequest: TripRequest,
  edit: ItineraryEditProposal,
): Promise<ApplyEditResult> {
  const offers = edit.type === "addItem" ? await verifiedSupplyCatalog(container, tripRequest) : [];
  return applyItineraryEdit({
    itinerary: document,
    edit,
    offers,
    rates: container.rates,
    mode: document.pricing.budgetMode,
    checkIn: tripRequest.checkIn,
    checkOut: tripRequest.checkOut,
    party: tripRequest.party,
    destination: tripRequest.destination,
  });
}

function editFailureReply(outcome: Exclude<ApplyEditResult["outcome"], "applied">): string {
  switch (outcome) {
    case "item_not_found":
      return "I couldn't find that item to remove — it may have already changed.";
    case "unknown_offer":
      return "That option is no longer available — try asking again.";
    case "no_rate":
      return "I couldn't price that option in your trip's currency.";
    case "invalid_day":
      return "That day isn't part of this trip.";
    case "empty_result":
      return "I can't remove the last item on your trip.";
    case "over_budget":
      return "That would go over budget and there's no room left to rebalance.";
  }
}

/** Hotel suggestions come back priced in whatever currency the offer itself
 * carries (the sandbox/aggregator's native currency) — convert each to the
 * itinerary's own currency so the chat preview matches what will actually be
 * charged if the agent commits (never a raw, unconverted foreign price next
 * to EUR/USD figures everywhere else on the page). An offer with no known
 * rate is dropped from the preview (`applyChatEdit` re-verifies and would
 * refuse it as `no_rate` anyway if picked). */
function convertSuggestions(suggestions: HotelSuggestion[], currency: string, rates: readonly ExchangeRate[]): HotelSuggestion[] {
  return suggestions.flatMap((s) => {
    if (s.currency === currency) return [s];
    const rate = findRate(rates, s.currency, currency);
    if (!rate) return [];
    try {
      const converted = convertMoney({ amountMinor: s.priceMinor, currency: s.currency }, rate);
      return [{ ...s, priceMinor: converted.amountMinor, currency: converted.currency }];
    } catch (err) {
      if (err instanceof MoneyError) return [];
      throw err;
    }
  });
}

function itinerarySummary(document: Itinerary): LlmChatEditRequest["items"] {
  return document.days.flatMap((day) => day.items.map((item) => ({ id: item.id, kind: item.kind, title: item.title, dayNumber: day.dayNumber })));
}

export type ChatEditOutcome =
  | { status: "applied"; itinerary: Itinerary; fit: ApplyEditResult["fit"]; reply: string }
  | { status: "suggested"; suggestions: HotelSuggestion[]; reply: string }
  | { status: "no_change"; reply: string }
  | { status: "not_found" }
  | { status: "failed"; reason: "malformed_output" };

export type ChatEditEvent = { type: "progress"; step: ChatEditStep } | { type: "result"; outcome: ChatEditOutcome };

/**
 * Interpret one chat message against an already-persisted itinerary
 * (contracts/chat-edit-subscription.md). Streamed (INV-028: drives an LLM
 * tool loop). A direct add/remove is applied and persisted in the SAME
 * generator call; a hotel request or a clarifying reply writes nothing.
 */
export async function* interpretChatEdit(
  container: Container,
  session: AgentSessionContext,
  input: { itineraryId: string; message: string },
): AsyncGenerator<ChatEditEvent> {
  const db: Db | undefined = container.db;
  if (!db) throw new Error("database not configured");

  const loaded = await loadOwnedItineraryWithRequest(db, session, input.itineraryId);
  if (!loaded) {
    yield { type: "result", outcome: { status: "not_found" } };
    return;
  }
  const { document, tripRequest } = loaded;

  const chatRequest: LlmChatEditRequest = {
    purpose: "chat.edit",
    message: input.message,
    destination: tripRequest.destination,
    checkIn: tripRequest.checkIn,
    checkOut: tripRequest.checkOut,
    party: tripRequest.party,
    items: itinerarySummary(document),
    tools: plannerToolDeps(container, tripRequest),
  };

  let result: LlmChatEditResult | undefined;
  for await (const event of container.llm.chatEditItinerary(chatRequest)) {
    if (event.type === "progress") {
      yield { type: "progress", step: event.step };
      continue;
    }
    result = event.result;
  }
  if (!result || result.status === "failed") {
    yield { type: "result", outcome: { status: "failed", reason: "malformed_output" } };
    return;
  }

  if (result.suggestions.length > 0) {
    const suggestions = convertSuggestions(result.suggestions, document.currency, container.rates);
    yield { type: "result", outcome: { status: "suggested", suggestions, reply: result.reply } };
    return;
  }
  if (!result.edit) {
    yield { type: "result", outcome: { status: "no_change", reply: result.reply } };
    return;
  }

  const applied = await applyEditToItinerary(container, document, tripRequest, result.edit);
  if (applied.outcome !== "applied") {
    yield { type: "result", outcome: { status: "no_change", reply: editFailureReply(applied.outcome) } };
    return;
  }
  await persistDocument(db, input.itineraryId, applied.itinerary);
  yield { type: "result", outcome: { status: "applied", itinerary: applied.itinerary, fit: applied.fit, reply: result.reply } };
}

export type ApplyChatEditOutcome =
  | { status: "applied"; itinerary: Itinerary; fit: ApplyEditResult["fit"] }
  | { status: "not_found" }
  | { status: "item_not_found" }
  | { status: "invalid_edit" };

/**
 * Direct, LLM-free application of an already-resolved edit
 * (contracts/apply-chat-edit-mutation.md) — used for a suggestion card's
 * "Add to trip" click, and internally by `interpretChatEdit` above for a
 * directly-resolved add/remove. The offer is always re-verified against a
 * fresh supply search here, never trusted from the caller (FR-006/FR-012).
 */
export async function applyChatEdit(
  container: Container,
  session: AgentSessionContext,
  input: { itineraryId: string; edit: ItineraryEditProposal },
): Promise<ApplyChatEditOutcome> {
  const db: Db | undefined = container.db;
  if (!db) throw new Error("database not configured");

  const loaded = await loadOwnedItineraryWithRequest(db, session, input.itineraryId);
  if (!loaded) return { status: "not_found" };
  const { document, tripRequest } = loaded;

  const result = await applyEditToItinerary(container, document, tripRequest, input.edit);
  if (result.outcome === "item_not_found") return { status: "item_not_found" };
  if (result.outcome !== "applied") return { status: "invalid_edit" };

  await persistDocument(db, input.itineraryId, result.itinerary);
  return { status: "applied", itinerary: result.itinerary, fit: result.fit };
}
