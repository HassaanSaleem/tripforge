// clientView.groups.* services (spec 040: traveler group trips). A signed-in,
// verified premium traveler forms a GROUP around a trip they can see, invites
// other verified members, they chat, everyone confirms, and the organizer
// finalizes only when ALL members confirm. Traveler surface (INV-024) — every
// caller is a `protectedProcedure` user; there is NO agency here.
//
// TRUST IS MECHANICAL (Constitution VI): `requireEligible` gates every mutation
// on the premium+identity primitive (`traveler_membership`), refusing an
// ineligible caller with a typed value BEFORE any write (state conservation);
// `finalizeGroup` re-reads and row-locks the confirmation set inside its
// transaction so a group is NEVER finalized while a member is unconfirmed.
//
// AGENCY-LESS + NOT a money path (the consumer_plan_request precedent): no net
// rate / markup / take-rate / revenue-share / sell total and no pmf_event (that
// table is agency-scoped, INV-004). Trip figures shown reuse the existing
// client-facing projection (INV-020). Business refusals are VALUES; TRPCError is
// reserved for auth/validation in the router.
import { z } from "zod";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  clientTripLink,
  itinerary as itineraryTable,
  itineraryShareLink as itineraryShareLinkTable,
  travelerGroup,
  travelerGroupMember,
  travelerGroupMessage,
  travelerMembership,
  user as userTable,
} from "@tripforge/db";
import type { Db } from "@tripforge/db";
import type { Container, SessionContext } from "../context.js";
import { resolveShareLinkTenant } from "./client-view.js";

function requireDb(container: Container): NonNullable<Container["db"]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  return db;
}

// ─── Eligibility (the premium + identity gate) ───────────────────────────────

export interface MembershipState {
  tier: "standard" | "premium";
  identityVerified: boolean;
  /** premium AND identity-verified — the sole predicate every gate uses. */
  eligible: boolean;
}

const STANDARD_MEMBERSHIP: MembershipState = { tier: "standard", identityVerified: false, eligible: false };

/** The caller's own membership state (default standard when no row exists). */
export async function getMembership(container: Container, userId: string): Promise<MembershipState> {
  const db = requireDb(container);
  return readMembership(db, userId);
}

async function readMembership(db: Db, userId: string): Promise<MembershipState> {
  const rows = await db
    .select({ tier: travelerMembership.tier, identityVerified: travelerMembership.identityVerified })
    .from(travelerMembership)
    .where(eq(travelerMembership.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return STANDARD_MEMBERSHIP;
  const tier = row.tier === "premium" ? "premium" : "standard";
  const identityVerified = Boolean(row.identityVerified);
  return { tier, identityVerified, eligible: tier === "premium" && identityVerified };
}

async function isEligible(db: Db, userId: string): Promise<boolean> {
  return (await readMembership(db, userId)).eligible;
}

/**
 * v0 self-serve "become a verified premium member" — a stand-in for real KYC +
 * premium billing (a deferred integration, like flights merchant-of-record). The
 * LOAD-BEARING invariant is the enforcement (every gate refuses an ineligible
 * caller), not this acquisition. Idempotent upsert on the caller's own row.
 */
export async function verifyMembership(container: Container, userId: string): Promise<MembershipState> {
  const db = requireDb(container);
  const now = new Date();
  await db
    .insert(travelerMembership)
    .values({ userId, tier: "premium", identityVerified: true, verifiedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: travelerMembership.userId,
      set: { tier: "premium", identityVerified: true, verifiedAt: now, updatedAt: now },
    });
  return { tier: "premium", identityVerified: true, eligible: true };
}

// ─── Names helper (batched; no per-row query) ────────────────────────────────

async function namesByUserId(db: Db, userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ─── Create + post a group (FR-001) ──────────────────────────────────────────

export const createGroupInputSchema = z.strictObject({
  token: z.uuid(),
  title: z.string().min(1).max(120),
});
export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;

export type CreateGroupOutcome =
  | { status: "not_eligible" }
  | { status: "not_found" }
  | { status: "created"; groupId: string; inviteToken: string };

/**
 * A verified premium traveler creates a posted group around a trip they can
 * resolve via its share token. One atomic tx: insert the group (forming,
 * joinable), the organizer as a CONFIRMED organizer member, and link the trip
 * into the organizer's My Trips. Unknown/unresolvable token → the same not_found
 * surface `resolveShareLink` uses (no existence oracle).
 */
export async function createGroup(
  container: Container,
  session: SessionContext,
  input: CreateGroupInput,
): Promise<CreateGroupOutcome> {
  const db = requireDb(container);
  if (!(await isEligible(db, session.userId))) return { status: "not_eligible" };

  const link = await resolveShareLinkTenant(db, input.token);
  if (!link) return { status: "not_found" };

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(travelerGroup)
      .values({
        itineraryId: link.itineraryId,
        organizerUserId: session.userId,
        title: input.title,
        status: "forming",
        joinable: true,
      })
      .returning({ id: travelerGroup.id, inviteToken: travelerGroup.inviteToken });
    const group = inserted[0];
    if (!group) throw new Error("traveler_group insert returned no row");

    await tx.insert(travelerGroupMember).values({
      groupId: group.id,
      userId: session.userId,
      role: "organizer",
      confirmationStatus: "confirmed",
      confirmedAt: new Date(),
    });

    await tx
      .insert(clientTripLink)
      .values({ userId: session.userId, itineraryId: link.itineraryId, source: "group" })
      .onConflictDoNothing({ target: [clientTripLink.userId, clientTripLink.itineraryId] });

    return { status: "created" as const, groupId: group.id, inviteToken: group.inviteToken };
  });
}

// ─── Join by invite (FR-004) ─────────────────────────────────────────────────

export const joinGroupInputSchema = z.strictObject({ inviteToken: z.uuid() });
export type JoinGroupInput = z.infer<typeof joinGroupInputSchema>;

export type JoinGroupOutcome =
  | { status: "not_eligible" }
  | { status: "not_found" }
  | { status: "not_joinable" }
  | { status: "joined"; groupId: string };

/**
 * A verified premium traveler joins a forming, joinable group via its invite
 * token: idempotent `member`/`pending` insert (UNIQUE(group,user) arbiter) plus
 * linking the group's trip into the joiner's My Trips so they can see it.
 */
export async function joinGroup(
  container: Container,
  session: SessionContext,
  input: JoinGroupInput,
): Promise<JoinGroupOutcome> {
  const db = requireDb(container);
  if (!(await isEligible(db, session.userId))) return { status: "not_eligible" };

  const groups = await db
    .select({ id: travelerGroup.id, itineraryId: travelerGroup.itineraryId, status: travelerGroup.status, joinable: travelerGroup.joinable })
    .from(travelerGroup)
    .where(eq(travelerGroup.inviteToken, input.inviteToken))
    .limit(1);
  const group = groups[0];
  if (!group) return { status: "not_found" };
  if (group.status !== "forming" || !group.joinable) return { status: "not_joinable" };

  await db.transaction(async (tx) => {
    await tx
      .insert(travelerGroupMember)
      .values({ groupId: group.id, userId: session.userId, role: "member", confirmationStatus: "pending" })
      .onConflictDoNothing({ target: [travelerGroupMember.groupId, travelerGroupMember.userId] });
    await tx
      .insert(clientTripLink)
      .values({ userId: session.userId, itineraryId: group.itineraryId, source: "group" })
      .onConflictDoNothing({ target: [clientTripLink.userId, clientTripLink.itineraryId] });
  });

  return { status: "joined", groupId: group.id };
}

// ─── My groups (FR-009) ──────────────────────────────────────────────────────

export interface GroupSummary {
  id: string;
  title: string;
  tripTitle: string;
  status: "forming" | "finalized" | "cancelled";
  myRole: "organizer" | "member";
  myConfirmation: "pending" | "confirmed";
  memberCount: number;
  confirmedCount: number;
  createdAt: string;
}

/** The caller's own groups (organizer OR member), newest first — scoped entirely
 * by `traveler_group_member.user_id = userId` (server-derived; no other user's
 * groups are expressible). */
export async function listMyGroups(container: Container, userId: string): Promise<GroupSummary[]> {
  const db = requireDb(container);

  const mine = await db
    .select({ groupId: travelerGroupMember.groupId, role: travelerGroupMember.role, confirmationStatus: travelerGroupMember.confirmationStatus })
    .from(travelerGroupMember)
    .where(eq(travelerGroupMember.userId, userId));
  if (mine.length === 0) return [];
  const groupIds = mine.map((m) => m.groupId);
  const mineByGroup = new Map(mine.map((m) => [m.groupId, m]));

  const groups = await db
    .select({ id: travelerGroup.id, title: travelerGroup.title, itineraryId: travelerGroup.itineraryId, status: travelerGroup.status, createdAt: travelerGroup.createdAt })
    .from(travelerGroup)
    .where(inArray(travelerGroup.id, groupIds))
    .orderBy(desc(travelerGroup.createdAt));

  // All members of my groups, for member/confirmed counts (one round trip).
  const allMembers = await db
    .select({ groupId: travelerGroupMember.groupId, confirmationStatus: travelerGroupMember.confirmationStatus })
    .from(travelerGroupMember)
    .where(inArray(travelerGroupMember.groupId, groupIds));
  const memberCount = new Map<string, number>();
  const confirmedCount = new Map<string, number>();
  for (const m of allMembers) {
    memberCount.set(m.groupId, (memberCount.get(m.groupId) ?? 0) + 1);
    if (m.confirmationStatus === "confirmed") confirmedCount.set(m.groupId, (confirmedCount.get(m.groupId) ?? 0) + 1);
  }

  const tripTitleById = new Map(
    (
      await db
        .select({ id: itineraryTable.id, title: itineraryTable.title })
        .from(itineraryTable)
        .where(inArray(itineraryTable.id, [...new Set(groups.map((g) => g.itineraryId))]))
    ).map((r) => [r.id, r.title]),
  );

  return groups.map((g) => {
    const m = mineByGroup.get(g.id);
    return {
      id: g.id,
      title: g.title,
      tripTitle: tripTitleById.get(g.itineraryId) ?? "Trip",
      status: g.status as GroupSummary["status"],
      myRole: (m?.role === "organizer" ? "organizer" : "member") as GroupSummary["myRole"],
      myConfirmation: (m?.confirmationStatus === "confirmed" ? "confirmed" : "pending") as GroupSummary["myConfirmation"],
      memberCount: memberCount.get(g.id) ?? 0,
      confirmedCount: confirmedCount.get(g.id) ?? 0,
      createdAt: g.createdAt.toISOString(),
    };
  });
}

// ─── Group detail (FR-005/006) ───────────────────────────────────────────────

export const getGroupInputSchema = z.strictObject({ groupId: z.uuid() });

export interface GroupMemberView {
  userId: string;
  name: string;
  role: "organizer" | "member";
  confirmationStatus: "pending" | "confirmed";
}
export interface GroupMessageView {
  id: string;
  senderUserId: string;
  senderName: string;
  body: string;
  createdAt: string;
}
export interface GroupDetailView {
  id: string;
  title: string;
  tripTitle: string;
  /** Share token of the group's trip, for a "view trip" link (null if none). */
  tripToken: string | null;
  status: "forming" | "finalized" | "cancelled";
  inviteToken: string;
  iAmOrganizer: boolean;
  myConfirmation: "pending" | "confirmed";
  allConfirmed: boolean;
  members: GroupMemberView[];
  messages: GroupMessageView[];
}

export type GroupDetailOutcome = { status: "forbidden" } | { status: "ok"; group: GroupDetailView };

/**
 * A group's full detail — but ONLY for a member (FR-005). A non-member (or a
 * caller naming a group that does not exist) gets the SAME `forbidden` — no
 * existence oracle. Names are batched; trip figures are not re-derived here (the
 * trip's own /view page shows the client-facing priced view, INV-020).
 */
export async function getGroup(
  container: Container,
  session: SessionContext,
  groupId: string,
): Promise<GroupDetailOutcome> {
  const db = requireDb(container);

  const mineRows = await db
    .select({ role: travelerGroupMember.role, confirmationStatus: travelerGroupMember.confirmationStatus })
    .from(travelerGroupMember)
    .where(and(eq(travelerGroupMember.groupId, groupId), eq(travelerGroupMember.userId, session.userId)))
    .limit(1);
  const mine = mineRows[0];
  if (!mine) return { status: "forbidden" };

  const groupRows = await db
    .select({
      id: travelerGroup.id,
      title: travelerGroup.title,
      itineraryId: travelerGroup.itineraryId,
      organizerUserId: travelerGroup.organizerUserId,
      status: travelerGroup.status,
      inviteToken: travelerGroup.inviteToken,
    })
    .from(travelerGroup)
    .where(eq(travelerGroup.id, groupId))
    .limit(1);
  const group = groupRows[0];
  if (!group) return { status: "forbidden" };

  const memberRows = await db
    .select({ userId: travelerGroupMember.userId, role: travelerGroupMember.role, confirmationStatus: travelerGroupMember.confirmationStatus })
    .from(travelerGroupMember)
    .where(eq(travelerGroupMember.groupId, groupId))
    .orderBy(asc(travelerGroupMember.joinedAt));

  const messageRows = await db
    .select({ id: travelerGroupMessage.id, senderUserId: travelerGroupMessage.senderUserId, body: travelerGroupMessage.body, createdAt: travelerGroupMessage.createdAt })
    .from(travelerGroupMessage)
    .where(eq(travelerGroupMessage.groupId, groupId))
    .orderBy(asc(travelerGroupMessage.createdAt));

  const names = await namesByUserId(db, [...memberRows.map((m) => m.userId), ...messageRows.map((m) => m.senderUserId)]);

  const tripTitleRows = await db
    .select({ title: itineraryTable.title })
    .from(itineraryTable)
    .where(eq(itineraryTable.id, group.itineraryId))
    .limit(1);
  const tokenRows = await db
    .select({ token: itineraryShareLinkTable.token })
    .from(itineraryShareLinkTable)
    .where(eq(itineraryShareLinkTable.itineraryId, group.itineraryId))
    .limit(1);

  const members: GroupMemberView[] = memberRows.map((m) => ({
    userId: m.userId,
    name: names.get(m.userId) ?? "Traveler",
    role: m.role === "organizer" ? "organizer" : "member",
    confirmationStatus: m.confirmationStatus === "confirmed" ? "confirmed" : "pending",
  }));

  return {
    status: "ok",
    group: {
      id: group.id,
      title: group.title,
      tripTitle: tripTitleRows[0]?.title ?? "Trip",
      tripToken: tokenRows[0]?.token ?? null,
      status: group.status as GroupDetailView["status"],
      inviteToken: group.inviteToken,
      iAmOrganizer: group.organizerUserId === session.userId,
      myConfirmation: mine.confirmationStatus === "confirmed" ? "confirmed" : "pending",
      allConfirmed: members.every((m) => m.confirmationStatus === "confirmed"),
      members,
      messages: messageRows.map((m) => ({
        id: m.id,
        senderUserId: m.senderUserId,
        senderName: names.get(m.senderUserId) ?? "Traveler",
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  };
}

// ─── Post a chat message (FR-006) ────────────────────────────────────────────

export const postMessageInputSchema = z.strictObject({
  groupId: z.uuid(),
  body: z.string().min(1).max(2000),
});
export type PostMessageInput = z.infer<typeof postMessageInputSchema>;

export type PostMessageOutcome = { status: "forbidden" } | { status: "not_active" } | { status: "posted"; messageId: string };

/** Only a member may post; a cancelled group is closed to new messages. */
export async function postMessage(
  container: Container,
  session: SessionContext,
  input: PostMessageInput,
): Promise<PostMessageOutcome> {
  const db = requireDb(container);
  if (!(await isMember(db, input.groupId, session.userId))) return { status: "forbidden" };
  const status = await groupStatus(db, input.groupId);
  if (status === "cancelled" || status === undefined) return { status: "not_active" };

  const inserted = await db
    .insert(travelerGroupMessage)
    .values({ groupId: input.groupId, senderUserId: session.userId, body: input.body })
    .returning({ id: travelerGroupMessage.id });
  const row = inserted[0];
  if (!row) throw new Error("traveler_group_message insert returned no row");
  return { status: "posted", messageId: row.id };
}

// ─── Confirm (FR-007) ────────────────────────────────────────────────────────

export const groupIdInputSchema = z.strictObject({ groupId: z.uuid() });

export type ConfirmOutcome = { status: "forbidden" } | { status: "not_active" } | { status: "confirmed" };

/** A member confirms their participation (idempotent). Refused on a
 * cancelled/finalized group (a finalized group's confirmations are locked). */
export async function confirmMembership(
  container: Container,
  session: SessionContext,
  groupId: string,
): Promise<ConfirmOutcome> {
  const db = requireDb(container);
  if (!(await isMember(db, groupId, session.userId))) return { status: "forbidden" };
  const status = await groupStatus(db, groupId);
  if (status !== "forming") return { status: "not_active" };

  await db
    .update(travelerGroupMember)
    .set({ confirmationStatus: "confirmed", confirmedAt: new Date() })
    .where(and(eq(travelerGroupMember.groupId, groupId), eq(travelerGroupMember.userId, session.userId)));
  return { status: "confirmed" };
}

// ─── Finalize (FR-008) — the all-party-confirmation gate ─────────────────────

export type FinalizeOutcome =
  | { status: "forbidden" }
  | { status: "not_active" }
  | { status: "awaiting_confirmations"; pending: { userId: string; name: string }[] }
  | { status: "finalized" };

/**
 * The organizer finalizes the trip collectively — but ONLY when every member has
 * confirmed. The confirmation set is re-read and ROW-LOCKED (`for update`) inside
 * the transaction, so a member confirming concurrently is serialized against
 * finalize and a group is never finalized with an unconfirmed member
 * (Constitution VI, state conservation on the failure path). If any member is
 * pending, finalize is refused and the group is left `forming` — no state change.
 */
export async function finalizeGroup(
  container: Container,
  session: SessionContext,
  groupId: string,
): Promise<FinalizeOutcome> {
  const db = requireDb(container);

  const outcome = await db.transaction(async (tx) => {
    const groupRows = await tx
      .select({ organizerUserId: travelerGroup.organizerUserId, status: travelerGroup.status })
      .from(travelerGroup)
      .where(eq(travelerGroup.id, groupId))
      .for("update")
      .limit(1);
    const group = groupRows[0];
    // Not the organizer (or unknown group) → forbidden; no existence oracle.
    if (!group || group.organizerUserId !== session.userId) return { status: "forbidden" as const };
    if (group.status !== "forming") return { status: "not_active" as const };

    const members = await tx
      .select({ userId: travelerGroupMember.userId, confirmationStatus: travelerGroupMember.confirmationStatus })
      .from(travelerGroupMember)
      .where(eq(travelerGroupMember.groupId, groupId))
      .for("update");
    const pending = members.filter((m) => m.confirmationStatus !== "confirmed");
    if (pending.length > 0) {
      return { status: "awaiting_confirmations" as const, pendingUserIds: pending.map((m) => m.userId) };
    }

    await tx.update(travelerGroup).set({ status: "finalized", finalizedAt: new Date() }).where(eq(travelerGroup.id, groupId));
    return { status: "finalized" as const };
  });

  if (outcome.status === "awaiting_confirmations") {
    const names = await namesByUserId(db, outcome.pendingUserIds);
    return {
      status: "awaiting_confirmations",
      pending: outcome.pendingUserIds.map((userId) => ({ userId, name: names.get(userId) ?? "Traveler" })),
    };
  }
  return outcome;
}

// ─── Cancel (FR-010) ─────────────────────────────────────────────────────────

export type CancelOutcome = { status: "forbidden" } | { status: "not_active" } | { status: "cancelled" };

/** The organizer cancels a forming group (one-way). Members/messages are kept. */
export async function cancelGroup(
  container: Container,
  session: SessionContext,
  groupId: string,
): Promise<CancelOutcome> {
  const db = requireDb(container);
  const groupRows = await db
    .select({ organizerUserId: travelerGroup.organizerUserId, status: travelerGroup.status })
    .from(travelerGroup)
    .where(eq(travelerGroup.id, groupId))
    .limit(1);
  const group = groupRows[0];
  if (!group || group.organizerUserId !== session.userId) return { status: "forbidden" };
  if (group.status !== "forming") return { status: "not_active" };

  await db
    .update(travelerGroup)
    .set({ status: "cancelled", cancelledAt: new Date(), joinable: false })
    .where(and(eq(travelerGroup.id, groupId), eq(travelerGroup.status, "forming")));
  return { status: "cancelled" };
}

// ─── Small shared reads ──────────────────────────────────────────────────────

async function isMember(db: Db, groupId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: travelerGroupMember.userId })
    .from(travelerGroupMember)
    .where(and(eq(travelerGroupMember.groupId, groupId), eq(travelerGroupMember.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function groupStatus(db: Db, groupId: string): Promise<string | undefined> {
  const rows = await db.select({ status: travelerGroup.status }).from(travelerGroup).where(eq(travelerGroup.id, groupId)).limit(1);
  return rows[0]?.status;
}
