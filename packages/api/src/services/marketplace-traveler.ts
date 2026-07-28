// Traveler marketplace surface (spec 041; GOAL.md D2.7): a signed-in traveler
// browses agent-listed trips and forks one into their own working copy, then
// self-books it or requests an agent — all reached from the existing
// /view/[token] flow.
//
// LAYERING: this orchestration lives in packages/api (like listTravelerTrips /
// resolveShareLink) because it folds the client-facing total via
// toClientItineraryView and writes several rows in one transaction. The pure,
// supplier-agnostic pieces stay in packages/marketplace (travelerForkCopy,
// vettedAgencyIds). No new money math is introduced (INV-010) — the fork is a
// copy + provenance; the money movement happens later through the UNCHANGED
// selfBook path, priced at the source listing's markup (bound b).
//
// TENANCY (INV-004/INV-024): the forked copy is owned by the SELLER agency; the
// traveler is attached via client_trip_link only. The browse is the one
// deliberate cross-tenant read (research D7, marketplace precedent), projected
// to client-safe fields only (INV-020) — never the agent license price, net
// rate, markup, or revenue-share bps.
import { randomUUID } from "node:crypto";
import { parseItinerary, type Itinerary } from "@tripforge/itinerary-schema";
import { travelerForkCopy, vettedAgencyIds } from "@tripforge/marketplace";
import {
  desc,
  eq,
  clientTripLink as clientTripLinkTable,
  itinerary as itineraryTable,
  itineraryShareLink as itineraryShareLinkTable,
  marketplaceFork as marketplaceForkTable,
  marketplaceListing,
  organization,
} from "@tripforge/db";
import { createLogger } from "@tripforge/shared";
import type { Container, SessionContext } from "../context.js";
import { toClientItineraryView } from "./client-view.js";
import { isItineraryValidationError, summarizeItineraryValidationError } from "./itinerary-read-guard.js";

const logger = createLogger({ bindings: { component: "marketplace-traveler" } });

// ─── Browse (traveler-safe projection; contract §1) ──────────────────────────

/** One marketplace card a traveler may see — client-safe fields ONLY (INV-020).
 * Never the agent license price, net rate, markup, or revenue-share bps. */
export interface TravelerMarketplaceCard {
  listingId: string;
  title: string;
  agencyName: string;
  sellerVetted: boolean;
  currency: string;
  /** Client-facing "from" total, computed identically to the trip view
   * (toClientItineraryView); null when nothing is priced. */
  fromTotalMinor: number | null;
}

/**
 * Active marketplace listings, projected for a traveler. Cross-tenant read of
 * `status = 'active'` listings joined to itinerary + selling agency; the "from"
 * total is folded by the SAME projection the trip view uses, so a traveler card
 * can never show a figure the trip page wouldn't. A listing whose document
 * fails re-validation is skipped (same neutral posture as resolveShareLink),
 * never crashing the whole browse.
 */
export async function browseMarketplaceForTraveler(container: Container): Promise<TravelerMarketplaceCard[]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  const rows = await db
    .select({
      listingId: marketplaceListing.id,
      currency: marketplaceListing.currency,
      sellerAgencyId: marketplaceListing.sellerAgencyId,
      agencyName: organization.name,
      document: itineraryTable.document,
    })
    .from(marketplaceListing)
    .innerJoin(organization, eq(marketplaceListing.sellerAgencyId, organization.id))
    .innerJoin(itineraryTable, eq(marketplaceListing.itineraryId, itineraryTable.id))
    .where(eq(marketplaceListing.status, "active"))
    .orderBy(desc(marketplaceListing.createdAt));
  if (rows.length === 0) return [];

  const vetted = await vettedAgencyIds(db, [...new Set(rows.map((r) => r.sellerAgencyId))]);

  const cards: TravelerMarketplaceCard[] = [];
  for (const r of rows) {
    const agencyName = r.agencyName ?? "Your travel agency";
    let document: Itinerary;
    try {
      document = parseItinerary(r.document);
    } catch (err) {
      if (!isItineraryValidationError(err)) throw err;
      logger.warn("marketplace_traveler.browse.itinerary_invalid", {
        listingId: r.listingId,
        issue: summarizeItineraryValidationError(err),
      });
      continue;
    }
    // Empty booked-price map: a listing is a template; the card shows the
    // unbooked "from" estimate, exactly as an unbooked /view/[token] does.
    const view = toClientItineraryView(document, agencyName, new Map());
    cards.push({
      listingId: r.listingId,
      title: view.title,
      agencyName,
      sellerVetted: vetted.has(r.sellerAgencyId),
      currency: view.currency,
      fromTotalMinor: view.totalSellMinor,
    });
  }
  return cards;
}

// ─── Fork (bound a; contract §2) ─────────────────────────────────────────────

export type ForkListingOutcome =
  | { status: "forked"; token: string; path: string }
  | { status: "not_available" };

/**
 * A signed-in traveler forks an active listing into a SELLER-agency-owned copy
 * attached to them, in ONE transaction: copy itinerary → share link → My-Trips
 * link → marketplace_fork provenance. Returns the copy's /view token so the
 * traveler lands on the existing trip flow (self-book or request-agent). A
 * missing/inactive listing (or missing source) returns a NEUTRAL not_available
 * (FR-009 — no existence oracle) and writes nothing. Each call mints a fresh
 * copy id, so concurrent forks of one listing never collide and one traveler's
 * bookings never touch another's copy (FR-004/SC-004); the listed original is
 * never mutated.
 */
export async function forkListingForTraveler(
  container: Container,
  session: SessionContext,
  listingId: string,
): Promise<ForkListingOutcome> {
  const db = container.db;
  if (!db) throw new Error("database not configured");

  return db.transaction(async (tx) => {
    const listings = await tx
      .select()
      .from(marketplaceListing)
      .where(eq(marketplaceListing.id, listingId))
      .limit(1);
    const listing = listings[0];
    if (!listing || listing.status !== "active") return { status: "not_available" } as const;

    const sources = await tx.select().from(itineraryTable).where(eq(itineraryTable.id, listing.itineraryId)).limit(1);
    const source = sources[0];
    // FK-impossible outside a torn migration; a neutral not_available conserves
    // state and reveals nothing (same posture as resolveShareLink).
    if (!source) return { status: "not_available" } as const;

    const copyId = randomUUID();
    const copyDocument = travelerForkCopy(parseItinerary(source.document), { copyId });
    // Boundary re-validation before the write (INV-001) — the fork copy is
    // canonical on write like any other itinerary.
    const validatedCopy = parseItinerary(copyDocument);

    // Copy first (the share link + fork FK-reference it), then the share link,
    // the My-Trips link, and the fork provenance. The copy is owned by the
    // SELLER agency (bound a) — every downstream money row will carry it.
    await tx.insert(itineraryTable).values({
      id: copyId,
      agencyId: listing.sellerAgencyId,
      title: validatedCopy.title,
      currency: validatedCopy.currency,
      document: validatedCopy,
      // Inherited so the copy is re-quotable/bookable like the source (D8).
      tripRequest: source.tripRequest,
      // Inherited: the fork's OWN provenance lives in marketplace_fork, so the
      // closed creation_source vocabulary is untouched (no schema-gate change).
      creationSource: source.creationSource,
    });

    const insertedLink = await tx
      .insert(itineraryShareLinkTable)
      .values({ agencyId: listing.sellerAgencyId, itineraryId: copyId })
      .returning({ token: itineraryShareLinkTable.token });
    const token = insertedLink[0]?.token;
    if (!token) throw new Error("share link insert returned no token");

    await tx
      .insert(clientTripLinkTable)
      .values({ userId: session.userId, itineraryId: copyId, source: "fork" })
      .onConflictDoNothing({ target: [clientTripLinkTable.userId, clientTripLinkTable.itineraryId] });

    await tx.insert(marketplaceForkTable).values({
      copyItineraryId: copyId,
      listingId: listing.id,
      sourceItineraryId: source.id,
      sellerAgencyId: listing.sellerAgencyId,
      travelerUserId: session.userId,
    });

    logger.info("marketplace_traveler.fork.completed", {
      listingId: listing.id,
      sellerAgencyId: listing.sellerAgencyId,
      copyItineraryId: copyId,
      travelerUserId: session.userId,
    });

    return { status: "forked", token, path: `/view/${token}` } as const;
  });
}
