// Membership queries — encapsulate the Drizzle query so the app layer never builds
// ORM predicates itself (keeps drizzle-orm inside packages/db). Used to resolve an
// agent's agency role for the request session context (INV-023/004).
import { and, eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { member } from "./schema.js";

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
