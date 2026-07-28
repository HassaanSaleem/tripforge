// SELF-BOOK flow (spec 036; GOAL.md D2.4 — the traveler self-drive money path).
// A signed-in traveler holding a share token books the shared itinerary's
// bookable, un-booked items through the SAME quote-then-book path an agent uses.
//
// TENANCY (INV-004/INV-024): the traveler has no agency. The owning agency (the
// money-path tenant) is resolved from the share LINK — never the traveler's
// session — and the traveler is recorded only as the booking ACTOR
// (pmf_event.actor_user_id). So every row this writes (booking, component,
// markup_ledger, pmf) carries the itinerary's agencyId exactly as an
// agent-initiated booking would; revenue attribution is byte-identical (research
// D2/D3). No new revenue-share or client-ownership row; no schema change.
//
// MARKUP (research D3): derived server-side — the itinerary's most recent quote
// markup, or the platform default. NEVER traveler-controlled (a traveler could
// otherwise set 0 and pay net, disintermediating the agent).
//
// REDACTION (INV-020, research D5): the returned outcome is client-safe — per-leg
// title/kind/booked/sellMinor + a mapped safe reason only. Net rate, markup,
// merchant-of-record, and supplier ids never cross the boundary.
//
// CONSERVATION (FR-006/INV-011): inherited unchanged from bookItinerary — a
// failed leg is never charged, a fully-failed self-book writes nothing, holds
// released. This module adds NO new money math (INV-010).
import { desc, eq, bookingQuote as bookingQuoteTable, marketplaceFork as marketplaceForkTable } from "@tripforge/db";
import type { Container, SessionContext } from "../../context.js";
import { resolveShareLinkTenant } from "../client-view.js";
import { logger, loadItinerary } from "./shared.js";
import type { BookingActor } from "./actor.js";
import { quoteItinerary } from "./quote.js";
import { bookItinerary, type BookOutcome } from "./book.js";

/** Mirrors the agent quote schema's default (quote.ts `.default(1500)`): an
 * itinerary never quoted self-books at the same platform-default markup the
 * agent path applies by default. NOT a new revenue rule. */
const DEFAULT_MARKUP_BPS = 1500;

type ItemKind = "stay" | "activity" | "transfer";

/** Why a leg the traveler tried to book didn't book — the client-safe surface
 * of the internal booking reasons (research D5). */
export type SelfBookFailureReason = "price_changed" | "supplier_unavailable" | "already_booked";

export type SelfBookLeg =
  | { itemId: string; title: string; kind: ItemKind; outcome: "confirmed"; sellMinor: number; currency: string }
  | { itemId: string; title: string; kind: ItemKind; outcome: "failed"; reason: SelfBookFailureReason };

export type SelfBookOutcome =
  | { status: "not_found" }
  | { status: "nothing_to_book" }
  | {
      status: "confirmed" | "partially_confirmed" | "failed";
      legs: SelfBookLeg[];
      totalChargedMinor: number;
      currency: string;
    };

/** Map an internal book/quote failure reason to the client-safe enum. */
function safeReason(
  reason: "quote_expired" | "supplier_rejected" | "unknown_quote" | "already_consumed" | "item_already_booked",
): SelfBookFailureReason {
  switch (reason) {
    case "quote_expired":
      return "price_changed";
    case "item_already_booked":
    case "already_consumed":
      return "already_booked";
    case "supplier_rejected":
    case "unknown_quote":
      return "supplier_unavailable";
  }
}

/** The most recent quote markup for this itinerary (the agent's established
 * pricing), or the platform default when it has never been quoted.
 *
 * FORK-AWARE (spec 041, bound b): a traveler's marketplace-fork copy has no
 * quotes of its own, so it is priced at its SOURCE listing's established markup
 * — the seller's existing sell price — never the flat default (a traveler must
 * not accidentally pay a cheaper-than-the-seller price). One extra indexed hop
 * on marketplace_fork; unchanged for every non-fork itinerary. Still never
 * returns 0 (FR-011): if the source was itself never quoted, the platform
 * default applies. No new money math — the markup is read, then applied by the
 * unchanged quoteItinerary path. */
async function deriveMarkupBps(container: Container, itineraryId: string): Promise<number> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const forks = await db
    .select({ sourceItineraryId: marketplaceForkTable.sourceItineraryId })
    .from(marketplaceForkTable)
    .where(eq(marketplaceForkTable.copyItineraryId, itineraryId))
    .limit(1);
  const effectiveId = forks[0]?.sourceItineraryId ?? itineraryId;
  const rows = await db
    .select({ markupBps: bookingQuoteTable.markupBps })
    .from(bookingQuoteTable)
    .where(eq(bookingQuoteTable.itineraryId, effectiveId))
    .orderBy(desc(bookingQuoteTable.createdAt))
    .limit(1);
  return rows[0]?.markupBps ?? DEFAULT_MARKUP_BPS;
}

/**
 * A traveler self-books a shared itinerary. `session` is any authenticated
 * user (the caller); the tenant is resolved from `token`. Quotes all bookable
 * un-booked items at the server-derived markup, books the held holds, and
 * returns a redacted per-leg outcome.
 */
export async function selfBookItinerary(
  container: Container,
  session: SessionContext,
  token: string,
): Promise<SelfBookOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  // Owning agency (money-path tenant) from the link — same neutral not_found
  // surface as resolveShareLink for an unknown/deleted token (no existence oracle).
  const link = await resolveShareLinkTenant(db, token);
  if (!link) return { status: "not_found" };

  const actor: BookingActor = { agencyId: link.agencyId, userId: session.userId };

  // Load the document once for the item title/kind map (also confirms the
  // itinerary is loadable under the resolved tenant — INV-004).
  const row = await loadItinerary(container, actor, link.itineraryId);
  if (!row) return { status: "not_found" };
  const itemMeta = new Map<string, { title: string; kind: ItemKind }>();
  for (const day of row.document.days) {
    for (const item of day.items) itemMeta.set(item.id, { title: item.title, kind: item.kind });
  }
  const currency = row.document.currency;

  const markupBps = await deriveMarkupBps(container, link.itineraryId);

  const quoted = await quoteItinerary(container, actor, { itineraryId: link.itineraryId, markupBps });
  if (quoted.status === "not_found") return { status: "not_found" };

  const held = quoted.items.flatMap((i) => (i.outcome === "held" ? [i.quote.quoteRowId] : []));
  // Quote-level failures that are NOT "already booked" (e.g. an item that can't
  // be priced) surface as failed legs so the traveler sees every leg's fate;
  // "already_booked" items are silently skipped (the agent already booked them).
  const quoteFailedLegs: SelfBookLeg[] = quoted.items.flatMap((i) => {
    if (i.outcome !== "failed" || i.reason === "already_booked") return [];
    const meta = itemMeta.get(i.itemId) ?? { title: "This item", kind: "activity" as const };
    return [{ itemId: i.itemId, title: meta.title, kind: meta.kind, outcome: "failed", reason: "supplier_unavailable" }];
  });

  if (held.length === 0) {
    // Nothing to book, and nothing that failed to price → everything is already
    // booked (or there is nothing bookable): a clean no-op, not an error.
    if (quoteFailedLegs.length === 0) return { status: "nothing_to_book" };
    return { status: "failed", legs: quoteFailedLegs, totalChargedMinor: 0, currency };
  }

  const booked = await bookItinerary(container, actor, { itineraryId: link.itineraryId, quoteRowIds: held });
  if (booked.status === "not_found") return { status: "not_found" };

  const legs = redactLegs(booked, itemMeta).concat(quoteFailedLegs);
  const confirmed = legs.filter((l) => l.outcome === "confirmed");
  const totalChargedMinor = confirmed.reduce((sum, l) => sum + (l.outcome === "confirmed" ? l.sellMinor : 0), 0);
  const status =
    confirmed.length === 0 ? "failed" : confirmed.length === legs.length ? "confirmed" : "partially_confirmed";

  logger.info("booking.self_book.completed", {
    agencyId: actor.agencyId,
    itineraryId: link.itineraryId,
    actorUserId: actor.userId,
    status,
    confirmedLegs: confirmed.length,
    totalLegs: legs.length,
  });

  return { status, legs, totalChargedMinor, currency };
}

/** BookOutcome components → redacted per-leg SelfBookLegs (drops net/markup/MoR/
 * supplier ids; joins the document title/kind). */
function redactLegs(
  booked: BookOutcome,
  itemMeta: ReadonlyMap<string, { title: string; kind: ItemKind }>,
): SelfBookLeg[] {
  return booked.components.map((c) => {
    const meta = itemMeta.get(c.itemId) ?? { title: "This item", kind: "activity" as const };
    if (c.outcome === "confirmed") {
      return {
        itemId: c.itemId,
        title: meta.title,
        kind: meta.kind,
        outcome: "confirmed",
        sellMinor: c.sellMinor,
        currency: c.currency,
      };
    }
    return { itemId: c.itemId, title: meta.title, kind: meta.kind, outcome: "failed", reason: safeReason(c.reason) };
  });
}
