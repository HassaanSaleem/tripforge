// Agency admin: member roster (seed-0009 — the first consumer of
// agencyAdminProcedure, spec-less improvement ticket). Read-only projection
// over Better Auth's organization/member/user tables, scoped by agencyId AT
// THE QUERY ITSELF (INV-004), mirroring dashboard-stats.ts's convention.
// Billing admin is out of scope here (no billing data model exists yet);
// member management is the real op this ticket lands.
import { asc, eq, member, user, type Db } from "@tripforge/db";

export interface AgencyMemberSummary {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

export async function listAgencyMembers(db: Db, agencyId: string): Promise<AgencyMemberSummary[]> {
  const rows = await db
    .select({
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, agencyId))
    .orderBy(asc(member.createdAt));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
  }));
}
