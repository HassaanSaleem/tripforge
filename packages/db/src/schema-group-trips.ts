// Traveler group-trips domain module (spec 040: consumer-side group travel —
// verified premium travelers create a group around a trip they can see, invite
// other verified members, chat, confirm, and the organizer finalizes only when
// ALL members confirm). Bolt-on metadata over an itinerary — NOT a canonical
// schema change (Constitution IV) — the same pattern as group_departure
// (schema-group-travel.ts) and consumer_plan_request (schema-consumer-planner.ts).
//
// AGENCY-LESS by design (the consumer_plan_request precedent): a traveler group
// has no owning agency; attributing one would be an operator ownership/revenue
// decision (ALWAYS-HALT, DIRECTIVE §2). NOT a money path: no net rate / markup /
// take-rate / revenue-share / sell columns — a group is free coordination; each
// member still books through the existing per-traveler self-book path (spec 036).
// Scoping is by user.id (INV-024 traveler surface), never agencyId.
import { pgTable, text, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
// See schema.ts for why these sibling imports omit the `.js` extension.
import { user } from "./schema-auth";
import { itineraryFk } from "./schema-itinerary";

// The traveler eligibility primitive (spec 040 FR-002/003). Models agency_vetting
// (an existence + flag gated trust record) but keyed to user.id instead of an
// agency. Eligible ⇔ tier == 'premium' && identity_verified. In v0 the flags are
// set by a self-serve stub standing in for real KYC / premium billing; the
// mechanically-enforced NEGATIVE (an ineligible user is refused every gated
// action) is the load-bearing invariant (Constitution VI), not the acquisition.
export const travelerMembership = pgTable("traveler_membership", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier").notNull(), // standard | premium
  identityVerified: boolean("identity_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A traveler-created group over one itinerary (spec 040 FR-001/010/011). The
// invite_token is an unguessable uuid — possession of it is the join grant, the
// same link-bearer pattern as itinerary_share_link.token. status is one-way
// forming → finalized | cancelled (mirrors group_departure's active → cancelled).
export const travelerGroup = pgTable(
  "traveler_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itineraryId: itineraryFk(), // the trip the group forms around (cascade)
    organizerUserId: text("organizer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull(), // forming | finalized | cancelled
    joinable: boolean("joinable").notNull(),
    inviteToken: uuid("invite_token").notNull().defaultRandom(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at"),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    organizerIdx: index("traveler_group_organizer_idx").on(table.organizerUserId),
    // The join lookup is always by invite token — unique so it is an unambiguous
    // handle (and so a re-issue would collide rather than silently duplicate).
    inviteTokenIdx: uniqueIndex("traveler_group_invite_token_idx").on(table.inviteToken),
  }),
);

// One participant in a group (spec 040 FR-004/005/007). UNIQUE(group, user) is
// both the idempotent-join arbiter (INSERT ... ON CONFLICT DO NOTHING) and the
// sole predicate that scopes a group's reads/writes to its members (INV-024
// spirit at the row level). The organizer is inserted as a `confirmed`
// `organizer` at group creation.
export const travelerGroupMember = pgTable(
  "traveler_group_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => travelerGroup.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // organizer | member
    confirmationStatus: text("confirmation_status").notNull(), // pending | confirmed
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
  },
  (table) => ({
    groupUserUnique: uniqueIndex("traveler_group_member_group_user_idx").on(table.groupId, table.userId),
    userIdx: index("traveler_group_member_user_idx").on(table.userId),
    groupIdx: index("traveler_group_member_group_idx").on(table.groupId),
  }),
);

// One in-group chat message (spec 040 FR-006). Postgres-backed (INV-003 — no new
// datastore/broker without an ADR); group-scoped, read chronologically. Authored
// by a member; never updated or deleted by application code in v0.
export const travelerGroupMessage = pgTable(
  "traveler_group_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => travelerGroup.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    groupCreatedIdx: index("traveler_group_message_group_created_idx").on(table.groupId, table.createdAt),
  }),
);
