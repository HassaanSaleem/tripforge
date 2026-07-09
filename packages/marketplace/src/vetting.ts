// The who-may-list gate (spec 006 FR-001/002, research D2): an agency is
// vetted iff its agency_vetting row exists. Rows are written ONLY by the
// platform operator action (packages/db/scripts/vet-agency.mjs) — this module
// only reads. Both sides of a marketplace transaction must pass at v0.
import { agencyVetting, eq, type Db } from "@tripforge/db";

/** The caller's read capability — a Db or a Drizzle transaction handle, so the
 * check can run INSIDE a money-path transaction (the PmfEventExecutor pattern). */
type VettingReader = Pick<Db, "select">;

export async function isVetted(db: VettingReader, agencyId: string): Promise<boolean> {
  const rows = await db
    .select({ agencyId: agencyVetting.agencyId })
    .from(agencyVetting)
    .where(eq(agencyVetting.agencyId, agencyId))
    .limit(1);
  return rows.length === 1;
}
