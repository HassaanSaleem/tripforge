// Trip handoff requests (spec 022, contracts/request-agent-fork.md): the
// request-an-agent half of the client-view fork. A traveler on /view/[token]
// asks that an agent take over; the agent sees it in a tenant-scoped inbox
// and can accept it. NOT a money path (no payment/markup/revenue-share) — no
// L3 concurrency treatment required, unlike booking/group-travel. Named
// `TripHandoffRequest`, never `TripRequest` — that name already belongs to
// the unrelated planner-criteria type (research D5).
import {
  and,
  desc,
  eq,
  itinerary as itineraryTable,
  itineraryShareLink as itineraryShareLinkTable,
  scopedWhere,
  tripHandoffRequest as tripHandoffRequestTable,
} from "@tripforge/db";
import { z } from "zod";
import type { AgentSessionContext, Container } from "../context.js";

function requireDb(container: Container): NonNullable<Container["db"]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  return db;
}

// ─── Submit (public; contract §1) ────────────────────────────────────────────

export const submitTripHandoffRequestInputSchema = z.strictObject({
  token: z.uuid(),
  contactName: z.string().min(1).max(200),
  contactEmail: z.email().optional(),
  notes: z.string().max(2000).optional(),
});
export type SubmitTripHandoffRequestInput = z.infer<typeof submitTripHandoffRequestInputSchema>;

export type SubmitTripHandoffOutcome = { status: "not_found" } | { status: "submitted"; requestId: string };

/**
 * Token → a new trip handoff request, tenant-stamped with the itinerary's
 * CURRENT owning agency (research D4) — never any provenance/authorship
 * field. A typed not_found (never a thrown error) covers an unknown token,
 * mirroring resolveShareLink's existing no-existence-oracle discipline
 * (client-view.ts). No session is read: possession of the token is the grant.
 */
export async function submitTripHandoffRequest(
  container: Container,
  input: SubmitTripHandoffRequestInput,
): Promise<SubmitTripHandoffOutcome> {
  const db = requireDb(container);

  const links = await db
    .select()
    .from(itineraryShareLinkTable)
    .where(eq(itineraryShareLinkTable.token, input.token))
    .limit(1);
  const link = links[0];
  if (!link) return { status: "not_found" };

  const owned = await db
    .select({ id: itineraryTable.id })
    .from(itineraryTable)
    .where(scopedWhere(itineraryTable.agencyId, link.agencyId, eq(itineraryTable.id, link.itineraryId)))
    .limit(1);
  if (!owned[0]) return { status: "not_found" };

  const inserted = await db
    .insert(tripHandoffRequestTable)
    .values({
      itineraryId: link.itineraryId,
      agencyId: link.agencyId,
      contactName: input.contactName,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
      status: "new",
    })
    .returning({ id: tripHandoffRequestTable.id });
  const row = inserted[0];
  if (!row) throw new Error("trip handoff request insert returned no row");

  return { status: "submitted", requestId: row.id };
}

// ─── Inbox (agent-gated; contract §2) ────────────────────────────────────────

export interface TripHandoffRequestSummary {
  id: string;
  itineraryId: string;
  itineraryTitle: string;
  contactName: string;
  contactEmail: string | null;
  notes: string | null;
  status: "new" | "accepted";
  createdAt: string;
}

export interface ListTripHandoffRequestsOutcome {
  requests: TripHandoffRequestSummary[];
}

/** The signed-in agency's own requests, newest-first — never another agency's (INV-004). */
export async function listTripHandoffRequests(
  container: Container,
  session: AgentSessionContext,
): Promise<ListTripHandoffRequestsOutcome> {
  const db = requireDb(container);

  const rows = await db
    .select({
      id: tripHandoffRequestTable.id,
      itineraryId: tripHandoffRequestTable.itineraryId,
      itineraryTitle: itineraryTable.title,
      contactName: tripHandoffRequestTable.contactName,
      contactEmail: tripHandoffRequestTable.contactEmail,
      notes: tripHandoffRequestTable.notes,
      status: tripHandoffRequestTable.status,
      createdAt: tripHandoffRequestTable.createdAt,
    })
    .from(tripHandoffRequestTable)
    .innerJoin(itineraryTable, eq(itineraryTable.id, tripHandoffRequestTable.itineraryId))
    .where(eq(tripHandoffRequestTable.agencyId, session.agencyId))
    .orderBy(desc(tripHandoffRequestTable.createdAt));

  return {
    requests: rows.map((row) => ({
      ...row,
      status: row.status as "new" | "accepted",
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

// ─── Accept (agent-gated; contract §3) ───────────────────────────────────────

export const acceptTripHandoffRequestInputSchema = z.strictObject({ requestId: z.uuid() });
export type AcceptTripHandoffRequestInput = z.infer<typeof acceptTripHandoffRequestInputSchema>;

export type AcceptTripHandoffOutcome = { status: "not_found" } | { status: "accepted"; requestId: string };

/**
 * new -> accepted, tenant-scoped (a cross-tenant id is indistinguishable from
 * a missing one). Idempotent (research D3): accepting an already-accepted
 * request is a no-op that still returns "accepted" — not an error.
 */
export async function acceptTripHandoffRequest(
  container: Container,
  session: AgentSessionContext,
  input: AcceptTripHandoffRequestInput,
): Promise<AcceptTripHandoffOutcome> {
  const db = requireDb(container);

  const rows = await db
    .update(tripHandoffRequestTable)
    .set({ status: "accepted" })
    .where(and(eq(tripHandoffRequestTable.id, input.requestId), eq(tripHandoffRequestTable.agencyId, session.agencyId)))
    .returning({ id: tripHandoffRequestTable.id });

  if (!rows[0]) return { status: "not_found" };
  return { status: "accepted", requestId: rows[0].id };
}
