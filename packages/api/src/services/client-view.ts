// Client-view share (spec 010): share-link minting + the traveler-facing
// redacted projection.
//
// THE TRUST BOUNDARY (FR-007/SC-003): the traveler is served ClientItineraryView
// and nothing else. The projection is an ALLOWLIST — it copies named safe fields
// off the canonical document (research D2), so agent-confidential values (net
// rates, markup, budget allocation/mode/total, trip request, supplier refs,
// provenance, tenant/document ids) are structurally absent from the payload, not
// deleted from it. A field added to the canonical schema later is confidential
// by default until someone explicitly allowlists it here.
//
// Share links: one durable uuid token per itinerary (research D1/D9). The
// UNIQUE(itinerary_id) constraint is the race arbiter — INSERT … ON CONFLICT DO
// NOTHING then SELECT converges concurrent callers on one surviving row.
// Tenancy (INV-004): share creation is scoped to the agent's agency and a
// cross-tenant probe is indistinguishable from an unknown itinerary (FR-002).
// Resolution is anonymous by design (link-bearer access, spec Assumptions) and
// reads fresh per request (INV-028 — the row is the only state).
import { addMoney, money, MoneyError, type Money } from "@tripforge/domain";
import { parseItinerary, type Itinerary, type MediaRef } from "@tripforge/itinerary-schema";
import {
  desc,
  eq,
  inArray,
  bookingComponent as bookingComponentTable,
  clientTripLink as clientTripLinkTable,
  getOrganizationName,
  getUserIdentity,
  itinerary as itineraryTable,
  itineraryShareLink as itineraryShareLinkTable,
  organization,
  scopedWhere,
} from "@tripforge/db";
import type { Db } from "@tripforge/db";
import { createLogger } from "@tripforge/shared";
import { z } from "zod";
import type { AgentSessionContext, Container, SessionContext } from "../context.js";
import { isItineraryValidationError, summarizeItineraryValidationError } from "./itinerary-read-guard.js";

const logger = createLogger({ bindings: { component: "client-view" } });

export const shareInputSchema = z.strictObject({ itineraryId: z.uuid() });

// ─── The redacted traveler-facing view (data-model §2) ───────────────────────

/** A media ref, reduced to exactly what a client is meant to see (spec 015
 * FR-010, research D5): never the library asset id, `source`, or
 * `attribution` — those are agent-facing trust/compliance metadata. */
export interface ClientViewMedia {
  kind: "image" | "video" | "embed";
  url: string;
  alt: string;
}

/** Per-kind schedule facts + sell price only — never netRate/supplyRef/ids. */
export type ClientViewItem =
  | {
      kind: "stay";
      title: string;
      booked: boolean;
      sellMinor: number | null;
      checkIn: string;
      checkOut: string;
      adults: number;
      children: number;
      media: ClientViewMedia[];
    }
  | {
      kind: "activity";
      title: string;
      booked: boolean;
      sellMinor: number | null;
      startsAt?: string;
      durationMinutes?: number;
      media: ClientViewMedia[];
    }
  | {
      kind: "transfer";
      title: string;
      booked: boolean;
      sellMinor: number | null;
      from: string;
      to: string;
      mode: string;
      media: ClientViewMedia[];
    };

export interface ClientViewDay {
  dayNumber: number;
  date?: string;
  items: ClientViewItem[];
}

export interface ClientItineraryView {
  title: string;
  agencyName: string;
  currency: string;
  /** Server-side addMoney fold over priced items (research D8); null when
   * nothing is priced — an unpriced proposal states no total. */
  totalSellMinor: number | null;
  /** Itinerary-level gallery, allowlist-projected (spec 015 FR-009/FR-010). */
  media: ClientViewMedia[];
  days: ClientViewDay[];
}

/** MediaRef → ClientViewMedia: the allowlist boundary itself (research D5) —
 * only `kind`/`url`/`alt` cross, never `id`/`source`/`attribution`. A ref
 * with no `url` (storageKey-only, unreachable in v0's URL-registration model
 * but structurally legal per MediaRefSchema) is dropped — nothing servable
 * to render. */
function toClientViewMedia(refs: readonly MediaRef[]): ClientViewMedia[] {
  return refs
    .filter((ref): ref is MediaRef & { url: string } => Boolean(ref.url))
    .map((ref) => ({ kind: ref.kind, url: ref.url, alt: ref.alt }));
}

/**
 * PURE allowlist projection: canonical document → traveler payload. `booked`
 * comes from the caller-supplied map of item ids to their confirmed
 * booking_component sell — the map's key set IS the booked set (spec 013,
 * research D2/D6). Booked items are priced from the booking record (the
 * realized client price, net × markup), never from the document's draft
 * placeholder, whose stored sellPrice equals the confidential net rate until
 * a quote realizes markup (spec 013 FR-001); un-booked items keep the stored
 * estimate (FR-003). Read-only — the document is never modified
 * (Constitution IV); the output leaves the platform toward the traveler's
 * browser and re-enters nothing.
 */
export function toClientItineraryView(
  document: Itinerary,
  agencyName: string,
  bookedPriceByItemId: ReadonlyMap<string, Money>,
): ClientItineraryView {
  let total: Money | undefined;

  const days: ClientViewDay[] = [...document.days]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => ({
      dayNumber: day.dayNumber,
      ...(day.date !== undefined ? { date: day.date } : {}),
      items: day.items.map((item) => {
        const bookedPrice = bookedPriceByItemId.get(item.id);
        if (bookedPrice && bookedPrice.currency !== document.currency) {
          // Tripwire (research D3): quote-time recording guarantees the
          // component currency equals the itinerary currency, so a mismatch
          // is data corruption — fail loudly, never render a wrong total.
          throw new MoneyError(
            `booked component currency ${bookedPrice.currency} does not match itinerary currency ${document.currency}`,
          );
        }
        const sellPrice = bookedPrice ?? item.pricing?.sellPrice;
        if (sellPrice) {
          total = total ? addMoney(total, sellPrice) : sellPrice;
        }
        const base = {
          title: item.title,
          booked: bookedPrice !== undefined,
          sellMinor: sellPrice ? sellPrice.amountMinor : null,
          media: toClientViewMedia(item.media),
        };
        switch (item.kind) {
          case "stay":
            return {
              kind: "stay" as const,
              ...base,
              checkIn: item.checkIn,
              checkOut: item.checkOut,
              adults: item.occupancy.adults,
              children: item.occupancy.children,
            };
          case "activity":
            return {
              kind: "activity" as const,
              ...base,
              ...(item.startsAt !== undefined ? { startsAt: item.startsAt } : {}),
              ...(item.durationMinutes !== undefined ? { durationMinutes: item.durationMinutes } : {}),
            };
          case "transfer":
            return {
              kind: "transfer" as const,
              ...base,
              from: item.from,
              to: item.to,
              mode: item.mode,
            };
        }
      }),
    }));

  return {
    title: document.title,
    agencyName,
    currency: document.currency,
    totalSellMinor: total ? total.amountMinor : null,
    media: toClientViewMedia(document.media),
    days,
  };
}

// ─── Share creation (agent-gated; contract §1) ───────────────────────────────

export type CreateShareLinkOutcome =
  | { status: "not_found" }
  | { status: "shared"; token: string; path: string };

/**
 * Mint (or return) THE share link for an itinerary the caller's agency owns.
 * Idempotent per itinerary (FR-004): repeat and concurrent calls converge on
 * the same token via UNIQUE(itinerary_id). Returns a PATH, never an absolute
 * URL — the serving origin is the browser's business (research D5).
 */
export async function createShareLink(
  container: Container,
  session: AgentSessionContext,
  itineraryId: string,
): Promise<CreateShareLinkOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  // Tenant-scoped ownership check (INV-004): unknown and cross-tenant are the
  // same not_found — no existence oracle (FR-002).
  const owned = await db
    .select({ id: itineraryTable.id })
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, session.agencyId, eq(itineraryTable.id, itineraryId)))
    .limit(1);
  if (!owned[0]) return { status: "not_found" };

  await db
    .insert(itineraryShareLinkTable)
    .values({ agencyId: session.agencyId, itineraryId })
    .onConflictDoNothing({ target: itineraryShareLinkTable.itineraryId });

  const rows = await db
    .select({ token: itineraryShareLinkTable.token })
    .from(itineraryShareLinkTable)
    .where(eq(itineraryShareLinkTable.itineraryId, itineraryId))
    .limit(1);
  const row = rows[0];
  // The insert-or-conflict above guarantees a row exists; a miss here means the
  // itinerary was deleted between the two statements — same not_found surface.
  if (!row) return { status: "not_found" };

  return { status: "shared", token: row.token, path: `/view/${row.token}` };
}

// ─── Anonymous resolution (public; contract §2) ──────────────────────────────

export type ResolveShareLinkOutcome =
  | { status: "not_found" }
  | { status: "found"; view: ClientItineraryView };

/** Token → `{agencyId, itineraryId}`, or undefined for an unknown token. Shared
 * by `resolveShareLink` (anonymous) and `attachTraveler` (spec 031) — the one
 * place either reads `itinerary_share_link` by its token. */
async function findShareLinkByToken(
  db: Db,
  token: string,
): Promise<{ agencyId: string; itineraryId: string } | undefined> {
  const links = await db
    .select({
      agencyId: itineraryShareLinkTable.agencyId,
      itineraryId: itineraryShareLinkTable.itineraryId,
    })
    .from(itineraryShareLinkTable)
    .where(eq(itineraryShareLinkTable.token, token))
    .limit(1);
  return links[0];
}

/**
 * Token → redacted view. A typed not_found (never a thrown error) covers
 * unknown tokens and deleted itineraries alike — the unavailable state reveals
 * nothing (FR-003). No session is read: possession of the token is the grant.
 */
export async function resolveShareLink(
  container: Container,
  token: string,
): Promise<ResolveShareLinkOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  const link = await findShareLinkByToken(db, token);
  if (!link) return { status: "not_found" };

  const rows = await db
    .select()
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, link.agencyId, eq(itineraryTable.id, link.itineraryId)))
    .limit(1);
  const row = rows[0];
  if (!row) return { status: "not_found" };

  // Boundary re-validation (INV-001): the document is canonical on read too.
  // A document that fails re-validation (legacy shape, bad migration, operator
  // surgery) shares the SAME not_found surface as an unknown/deleted itinerary
  // (spec 010 — "reveals nothing", no existence oracle; seed-0021) instead of
  // crashing the traveler's durable share link.
  let document: Itinerary;
  try {
    document = parseItinerary(row.document);
  } catch (err) {
    if (!isItineraryValidationError(err)) throw err;
    logger.warn("client_view.resolve.itinerary_invalid", {
      itineraryId: link.itineraryId,
      issue: summarizeItineraryValidationError(err),
    });
    return { status: "not_found" };
  }

  // Booked items are priced from the booking record (spec 013): the component
  // sell is the realized client price, recorded in the itinerary currency at
  // quote time. `money()` re-validates; the component's OWN currency is used
  // so a corrupted cross-currency row trips the projection's loud guard.
  const components = await db
    .select({
      itemId: bookingComponentTable.itemId,
      sellMinor: bookingComponentTable.sellMinor,
      currency: bookingComponentTable.currency,
    })
    .from(bookingComponentTable)
    .where(
      scopedWhere(bookingComponentTable.agencyId, link.agencyId, eq(bookingComponentTable.itineraryId, link.itineraryId)),
    );
  const bookedPriceByItemId = new Map(components.map((c) => [c.itemId, money(c.sellMinor, c.currency)]));

  const agencyName = (await getOrganizationName(db, link.agencyId)) ?? "Your travel agency";

  return { status: "found", view: toClientItineraryView(document, agencyName, bookedPriceByItemId) };
}

// ─── Signed-in traveler identity (spec 030, contracts §1) ────────────────────

/** A signed-in caller's own display identity — used ONLY for form pre-fill
 * (e.g. the request-an-agent form). Never folded into ClientItineraryView. */
export interface TravelerIdentity {
  name: string;
  email: string;
}

/**
 * The caller's own name/email — no tenant/session scoping beyond the primary-key
 * lookup, because there is nothing to scope: a user's own row is exactly what a
 * `protectedProcedure` caller (traveler OR agent, spec 030 FR-005) is allowed to
 * see. Returns null if the session's user row is somehow missing (defense in
 * depth; Better Auth guarantees a valid session always has one).
 */
export async function getSignedInIdentity(
  container: Container,
  userId: string,
): Promise<TravelerIdentity | null> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  const identity = await getUserIdentity(db, userId);
  return identity ?? null;
}

// ─── Traveler trip history (spec 031, contracts §1/§2) ───────────────────────

export type AttachTravelerOutcome = { status: "not_found" } | { status: "linked" };

/**
 * Record that the caller has opened this trip's share link (research D1:
 * "attach on view" is the sole v0 trigger). Idempotent — a repeat call for the
 * same (userId, itineraryId) pair is a no-op, never a duplicate row (the
 * UNIQUE(user_id, itinerary_id) constraint is the arbiter, same pattern as
 * `createShareLink`'s UNIQUE(itinerary_id)). An unknown/deleted-itinerary
 * token is the same not_found surface `resolveShareLink` uses — reveals
 * nothing about whether the token ever existed.
 */
export async function attachTraveler(
  container: Container,
  session: SessionContext,
  token: string,
): Promise<AttachTravelerOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  const link = await findShareLinkByToken(db, token);
  if (!link) return { status: "not_found" };

  await db
    .insert(clientTripLinkTable)
    .values({ userId: session.userId, itineraryId: link.itineraryId, source: "view" })
    .onConflictDoNothing({
      target: [clientTripLinkTable.userId, clientTripLinkTable.itineraryId],
    });

  return { status: "linked" };
}

/** One row of a signed-in visitor's "My Trips" list — client-facing figures
 * only (INV-020), identical shape to what the trip's own page already shows. */
export interface TravelerTripSummary {
  token: string;
  title: string;
  agencyName: string;
  currency: string;
  totalSellMinor: number | null;
  linkedAt: string;
}

/**
 * The caller's own linked trips, newest-linked-first — scoped ENTIRELY by
 * `client_trip_link.user_id = userId` (a value the session middleware derives
 * server-side, never client input), so no other visitor's trips are
 * expressible in the result (FR-005). Each row is projected the SAME way
 * `resolveShareLink` projects an anonymous visitor's view — a single source
 * of truth for "what a visitor may see about a trip" (research D3) — but
 * batched across every linked trip (perf-031: N sequential per-trip queries
 * regressed to one round trip per lookup kind), so a trip whose share
 * link/itinerary was deleted since it was linked simply drops out (defense
 * in depth; the FK cascade already removes the `client_trip_link` row in
 * that case).
 */
export async function listTravelerTrips(
  container: Container,
  userId: string,
): Promise<TravelerTripSummary[]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  const links = await db
    .select({
      token: itineraryShareLinkTable.token,
      itineraryId: itineraryShareLinkTable.itineraryId,
      agencyId: itineraryShareLinkTable.agencyId,
      linkedAt: clientTripLinkTable.createdAt,
    })
    .from(clientTripLinkTable)
    .innerJoin(itineraryShareLinkTable, eq(itineraryShareLinkTable.itineraryId, clientTripLinkTable.itineraryId))
    .where(eq(clientTripLinkTable.userId, userId))
    .orderBy(desc(clientTripLinkTable.createdAt));
  if (links.length === 0) return [];

  const itineraryIds = [...new Set(links.map((link) => link.itineraryId))];

  // Batched lookups, one extra query each regardless of trip count — same
  // pattern as listItineraries' author-name batching (services/itineraries.ts).
  const itineraryRows = await db.select().from(itineraryTable).where(inArray(itineraryTable.id, itineraryIds));
  const itineraryById = new Map(itineraryRows.map((row) => [row.id, row]));

  const components = await db
    .select({
      itineraryId: bookingComponentTable.itineraryId,
      agencyId: bookingComponentTable.agencyId,
      itemId: bookingComponentTable.itemId,
      sellMinor: bookingComponentTable.sellMinor,
      currency: bookingComponentTable.currency,
    })
    .from(bookingComponentTable)
    .where(inArray(bookingComponentTable.itineraryId, itineraryIds));
  const bookedPricesByItinerary = new Map<string, Map<string, Money>>();
  for (const component of components) {
    // Same ownership guard as the itinerary check below (INV-004 symmetry): a
    // component only prices an itinerary it's actually tenant-owned against.
    const owningItinerary = itineraryById.get(component.itineraryId);
    if (!owningItinerary || owningItinerary.agencyId !== component.agencyId) continue;
    const forItinerary = bookedPricesByItinerary.get(component.itineraryId) ?? new Map<string, Money>();
    forItinerary.set(component.itemId, money(component.sellMinor, component.currency));
    bookedPricesByItinerary.set(component.itineraryId, forItinerary);
  }

  const agencyIds = [...new Set(links.map((link) => link.agencyId))];
  const agencyNameById = new Map(
    (await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, agencyIds))).map(
      (org) => [org.id, org.name] as const,
    ),
  );

  const summaries: TravelerTripSummary[] = [];
  for (const link of links) {
    const row = itineraryById.get(link.itineraryId);
    // Same not_found surface resolveShareLink gives an anonymous visitor: a
    // deleted itinerary, or a share link stamped for a different agency than
    // the itinerary now belongs to (scopedWhere's ownership check, inlined).
    if (!row || row.agencyId !== link.agencyId) continue;

    let document: Itinerary;
    try {
      document = parseItinerary(row.document);
    } catch (err) {
      if (!isItineraryValidationError(err)) throw err;
      logger.warn("client_view.my_trips.itinerary_invalid", {
        itineraryId: link.itineraryId,
        issue: summarizeItineraryValidationError(err),
      });
      continue;
    }

    const agencyName = agencyNameById.get(link.agencyId) ?? "Your travel agency";
    const bookedPriceByItemId = bookedPricesByItinerary.get(link.itineraryId) ?? new Map<string, Money>();
    const view = toClientItineraryView(document, agencyName, bookedPriceByItemId);
    summaries.push({
      token: link.token,
      title: view.title,
      agencyName: view.agencyName,
      currency: view.currency,
      totalSellMinor: view.totalSellMinor,
      linkedAt: link.linkedAt.toISOString(),
    });
  }
  return summaries;
}
