// Drizzle schema (PostgreSQL — the single system of record, INV-003).
//
// Tables map to Better Auth v1 core (user/session/account/verification) plus the
// organization plugin (organization/member/invitation). An **agency is a Better
// Auth organization**; `organization.id` is the tenant key referenced everywhere
// as `agencyId` (INV-004). Tenant-owned product tables (itineraries, listings,
// ledgers) are added by later seeds and MUST carry `agencyId` referencing
// `organization.id`.
import { pgTable, text, timestamp, boolean, uuid, bigint, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Better Auth organization plugin stores the caller's active org here — this is
  // the source of the agencyId in the request session context (INV-023/004).
  activeOrganizationId: text("active_organization_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Organization plugin (agency = organization) ─────────────────────────────

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Agency org role — kept to owner/admin/member at MVP (architecture §1.4).
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// ─── PMF instrumentation (INV-021, Constitution MVP Scope Discipline) ─────────

// Append-only PMF metric event store. Events are written in the SAME transaction
// as the business action they measure (INV-021) via recordPmfEvent — never
// updated or deleted by application code. Money columns are integer minor units
// + explicit currency (INV-009); the closed type vocabulary and per-type field
// rules live in pmf-events.ts (TS-validated — the itineraries table does not
// exist yet, so itinerary_id is an opaque reference, not an FK).
export const pmfEvent = pgTable(
  "pmf_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    itineraryId: text("itinerary_id"),
    source: text("source"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: text("currency"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    typeAgencyIdx: index("pmf_event_type_agency_idx").on(table.type, table.agencyId),
  }),
);

export const schema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  pmfEvent,
};

export type Schema = typeof schema;
