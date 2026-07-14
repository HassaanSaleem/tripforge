// Group-departure flows (spec 021 US1/US2/US3; contracts/group-travel.md
// §1-4). Bolt-on metadata over an itinerary (Constitution IV — no canonical
// schema change), listed/licensed via the UNCHANGED marketplace mechanism
// (licensing.ts extension). Business refusals are typed VALUES (listings.ts
// precedent); the router maps not_found to a TRPCError. Capacity conservation
// (join) is a single-row atomic conditional UPDATE — the same "belt-and-
// braces WHERE re-asserts the invariant" idiom as the booking claim gate's
// Phase-2 UPDATE, just single-row (research D1: only one group_departure row
// is ever touched per join, so the multi-row id-ordered locking discipline
// that pattern exists for does not apply here).
import {
  and,
  desc,
  eq,
  gt,
  groupDeparture,
  groupDepartureSeat,
  itinerary as itineraryTable,
  organization,
  recordPmfEvent,
  scopedWhere,
  sql,
  type Db,
} from "@tripforge/db";
import { z } from "zod";
import { vettedAgencyIds } from "./vetting.js";
import type { MarketplaceActor } from "./types.js";

export const postGroupDepartureInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  departureDate: z.iso.date(),
  capacity: z.number().int().min(1),
  /** Per-seat price in integer minor units of the itinerary's currency (INV-009). */
  pricePerSeatMinor: z.number().int().min(0),
});
export type PostGroupDepartureInput = z.infer<typeof postGroupDepartureInputSchema>;

export type PostGroupDepartureOutcome =
  | { status: "posted"; departureId: string; seatsRemaining: number; capacity: number }
  | { status: "not_found" };

export async function postGroupDeparture(
  db: Db,
  actor: MarketplaceActor,
  input: PostGroupDepartureInput,
): Promise<PostGroupDepartureOutcome> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: itineraryTable.id, currency: itineraryTable.currency })
      .from(itineraryTable)
      .where(scopedWhere(itineraryTable.agencyId, actor.agencyId, eq(itineraryTable.id, input.itineraryId)))
      .limit(1);
    const row = rows[0];
    if (!row) return { status: "not_found" } as const;

    const inserted = await tx
      .insert(groupDeparture)
      .values({
        agencyId: actor.agencyId,
        itineraryId: row.id,
        departureDate: new Date(input.departureDate),
        capacity: input.capacity,
        seatsRemaining: input.capacity,
        pricePerSeatMinor: input.pricePerSeatMinor,
        currency: row.currency,
        status: "active",
      })
      .returning({ id: groupDeparture.id, seatsRemaining: groupDeparture.seatsRemaining });
    const departure = inserted[0];
    if (!departure) throw new Error("group departure insert returned no row");

    await recordPmfEvent(tx, {
      type: "group_departure_posted",
      agencyId: actor.agencyId,
      itineraryId: row.id,
      actorUserId: actor.userId,
    });

    return {
      status: "posted",
      departureId: departure.id,
      seatsRemaining: departure.seatsRemaining,
      capacity: input.capacity,
    } as const;
  });
}

export const cancelGroupDepartureInputSchema = z.strictObject({
  departureId: z.uuid(),
});
export type CancelGroupDepartureInput = z.infer<typeof cancelGroupDepartureInputSchema>;

export type CancelGroupDepartureOutcome =
  | { status: "cancelled"; departureId: string }
  | { status: "already_cancelled"; departureId: string }
  | { status: "not_found" };

export async function cancelGroupDeparture(
  db: Db,
  actor: MarketplaceActor,
  input: CancelGroupDepartureInput,
): Promise<CancelGroupDepartureOutcome> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: groupDeparture.id, status: groupDeparture.status })
      .from(groupDeparture)
      .where(scopedWhere(groupDeparture.agencyId, actor.agencyId, eq(groupDeparture.id, input.departureId)))
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row) return { status: "not_found" } as const;
    if (row.status !== "active") return { status: "already_cancelled", departureId: row.id } as const;
    await tx
      .update(groupDeparture)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(groupDeparture.id, row.id));
    return { status: "cancelled", departureId: row.id } as const;
  });
}

export interface BrowseGroupDeparture {
  departureId: string;
  itineraryTitle: string;
  departureDate: Date;
  capacity: number;
  seatsRemaining: number;
  pricePerSeatMinor: number;
  currency: string;
  postingAgencyId: string;
  postingAgencyName: string;
  sellerVetted: boolean;
  mine: boolean;
}

/** The one deliberate cross-tenant read (marketplace browseListings precedent):
 * active departures only, public fields, no client/traveler data. */
export async function browseGroupDepartures(
  db: Db,
  actor: MarketplaceActor,
): Promise<{ departures: BrowseGroupDeparture[] }> {
  const rows = await db
    .select({
      departureId: groupDeparture.id,
      itineraryTitle: itineraryTable.title,
      departureDate: groupDeparture.departureDate,
      capacity: groupDeparture.capacity,
      seatsRemaining: groupDeparture.seatsRemaining,
      pricePerSeatMinor: groupDeparture.pricePerSeatMinor,
      currency: groupDeparture.currency,
      postingAgencyId: groupDeparture.agencyId,
      postingAgencyName: organization.name,
    })
    .from(groupDeparture)
    .innerJoin(itineraryTable, eq(groupDeparture.itineraryId, itineraryTable.id))
    .innerJoin(organization, eq(groupDeparture.agencyId, organization.id))
    .where(eq(groupDeparture.status, "active"))
    // Newest posted first (itinerary-list.tsx precedent) — without an
    // explicit order, row order is unspecified and a just-posted departure
    // can render anywhere in the grid.
    .orderBy(desc(groupDeparture.createdAt));

  const vetted = await vettedAgencyIds(db, [...new Set(rows.map((r) => r.postingAgencyId))]);
  return {
    departures: rows.map((r) => ({
      ...r,
      sellerVetted: vetted.has(r.postingAgencyId),
      mine: r.postingAgencyId === actor.agencyId,
    })),
  };
}

export const joinGroupDepartureInputSchema = z.strictObject({
  departureId: z.uuid(),
  travelerName: z.string().min(1).max(200),
  travelerEmail: z.email().optional(),
});
export type JoinGroupDepartureInput = z.infer<typeof joinGroupDepartureInputSchema>;

export type JoinGroupDepartureOutcome =
  | { status: "joined"; seatId: string; seatsRemaining: number; seatPriceMinor: number; currency: string }
  | { status: "sold_out" }
  | { status: "not_active" }
  | { status: "not_found" };

/**
 * The capacity-conservation claim gate (spec 021 FR-005/006/007, research D1,
 * SC-002/SC-003). The atomic conditional UPDATE is the ENTIRE race decision —
 * its WHERE clause re-asserts `status = 'active' AND seats_remaining > 0` at
 * the moment of the write, so a concurrent last-seat race resolves to exactly
 * one winner regardless of what any earlier read observed. Zero rows
 * returned means the claim lost; the follow-up read below only decides which
 * REFUSAL message to show (not_found / not_active / sold_out) and never
 * influences the capacity decision itself.
 */
export async function joinGroupDeparture(
  db: Db,
  actor: MarketplaceActor,
  input: JoinGroupDepartureInput,
): Promise<JoinGroupDepartureOutcome> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(groupDeparture)
      .set({ seatsRemaining: sql`${groupDeparture.seatsRemaining} - 1` })
      .where(
        and(
          eq(groupDeparture.id, input.departureId),
          eq(groupDeparture.status, "active"),
          gt(groupDeparture.seatsRemaining, 0),
        ),
      )
      .returning({
        seatsRemaining: groupDeparture.seatsRemaining,
        pricePerSeatMinor: groupDeparture.pricePerSeatMinor,
        currency: groupDeparture.currency,
        agencyId: groupDeparture.agencyId,
        itineraryId: groupDeparture.itineraryId,
      });
    const winner = claimed[0];
    if (!winner) {
      const rows = await tx
        .select({ id: groupDeparture.id, status: groupDeparture.status })
        .from(groupDeparture)
        .where(eq(groupDeparture.id, input.departureId))
        .limit(1);
      const row = rows[0];
      if (!row) return { status: "not_found" } as const;
      if (row.status !== "active") return { status: "not_active" } as const;
      return { status: "sold_out" } as const;
    }

    const inserted = await tx
      .insert(groupDepartureSeat)
      .values({
        groupDepartureId: input.departureId,
        joinedByAgencyId: actor.agencyId,
        travelerName: input.travelerName,
        travelerEmail: input.travelerEmail ?? null,
        seatPriceMinor: winner.pricePerSeatMinor,
        currency: winner.currency,
      })
      .returning({ id: groupDepartureSeat.id });
    const seat = inserted[0];
    if (!seat) throw new Error("group departure seat insert returned no row");

    await recordPmfEvent(tx, {
      type: "group_departure_seat_joined",
      agencyId: winner.agencyId,
      itineraryId: winner.itineraryId,
      amountMinor: winner.pricePerSeatMinor,
      currency: winner.currency,
      actorUserId: actor.userId,
    });

    return {
      status: "joined",
      seatId: seat.id,
      // RETURNING reflects the row AFTER the UPDATE — already post-decrement.
      seatsRemaining: winner.seatsRemaining,
      seatPriceMinor: winner.pricePerSeatMinor,
      currency: winner.currency,
    } as const;
  });
}
