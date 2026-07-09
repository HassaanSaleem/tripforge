// The who-may-list gate (spec 006 FR-001/002, research D2): an agency is
// vetted iff its agency_vetting row exists. Rows are written ONLY by the
// platform operator action (packages/db/scripts/vet-agency.mjs) — this module
// only reads. Both sides of a marketplace transaction must pass at v0.
import { agencyVetting, eq, type Db } from "@tripforge/db";

export async function isVetted(db: Db, agencyId: string): Promise<boolean> {
  const rows = await db
    .select({ agencyId: agencyVetting.agencyId })
    .from(agencyVetting)
    .where(eq(agencyVetting.agencyId, agencyId))
    .limit(1);
  return rows.length === 1;
}
