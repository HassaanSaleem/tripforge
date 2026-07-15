// Membership queries — encapsulate the Drizzle query so the app layer never builds
// ORM predicates itself (keeps drizzle-orm inside packages/db). Used to resolve an
// agent's agency role for the request session context (INV-023/004).
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { member, organization, user } from "./schema.js";

/** The agency (org) role for a user in an organization, or undefined if not a member. */
export async function getMemberRole(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return rows[0]?.role;
}

/**
 * The user's PRIMARY agency membership — oldest by creation (P0 single-agency
 * assumption, spec 007 research D1). Session creation uses this to auto-activate
 * the agency so agent-gated procedures pass without a manual selection step;
 * undefined for users with no membership (traveler).
 */
export async function getPrimaryMembership(
  db: Db,
  userId: string,
): Promise<{ organizationId: string; role: string } | undefined> {
  const rows = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  return rows[0];
}

/** The agency (organization) display name, or undefined if the org does not exist. */
export async function getOrganizationName(
  db: Db,
  organizationId: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return rows[0]?.name;
}

/**
 * A user's own display name + email (spec 030) — used to echo a signed-in caller's
 * identity back to them (e.g. request-agent form pre-fill). Not tenant-scoped: a
 * user's own row is, by construction, exactly what a `protectedProcedure` caller is
 * allowed to see.
 */
export async function getUserIdentity(
  db: Db,
  userId: string,
): Promise<{ name: string; email: string } | undefined> {
  const rows = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0];
}
