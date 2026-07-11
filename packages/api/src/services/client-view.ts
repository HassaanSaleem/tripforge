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
import { parseItinerary, type Itinerary } from "@tripforge/itinerary-schema";
import {
  eq,
  bookingComponent as bookingComponentTable,
  getOrganizationName,
  itinerary as itineraryTable,
  itineraryShareLink as itineraryShareLinkTable,
  scopedWhere,
} from "@tripforge/db";
import { z } from "zod";
import type { AgentSessionContext, Container } from "../context.js";

export const shareInputSchema = z.strictObject({ itineraryId: z.uuid() });

// ─── The redacted traveler-facing view (data-model §2) ───────────────────────

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
    }
  | {
      kind: "activity";
      title: string;
      booked: boolean;
      sellMinor: number | null;
      startsAt?: string;
      durationMinutes?: number;
    }
  | {
      kind: "transfer";
      title: string;
      booked: boolean;
      sellMinor: number | null;
      from: string;
      to: string;
      mode: string;
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
  days: ClientViewDay[];
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

  const links = await db
    .select()
    .from(itineraryShareLinkTable)
    .where(eq(itineraryShareLinkTable.token, token))
    .limit(1);
  const link = links[0];
  if (!link) return { status: "not_found" };

  const rows = await db
    .select()
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, link.agencyId, eq(itineraryTable.id, link.itineraryId)))
    .limit(1);
  const row = rows[0];
  if (!row) return { status: "not_found" };

  // Boundary re-validation (INV-001): the document is canonical on read too.
  const document = parseItinerary(row.document);

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
