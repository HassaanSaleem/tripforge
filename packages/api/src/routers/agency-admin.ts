// workspace.agencyAdmin.* — owner/admin-gated agency administration (seed-0009,
// INV-023). First real consumer of agencyAdminProcedure (packages/api/src/trpc.ts):
// member management. Markup-policy admin is tracked separately to seed-0005;
// billing has no data model yet and is not built here.
import { TRPCError } from "@trpc/server";
import { router, agencyAdminProcedure } from "../trpc.js";
import { listAgencyMembers } from "../services/agency-members.js";

export const agencyAdminRouter = router({
  /** The agency's member roster — owner/admin only (spec-less improvement, seed-0009). */
  members: agencyAdminProcedure.query(({ ctx }) => {
    const db = ctx.container.db;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "database not configured" });
    return listAgencyMembers(db, ctx.session.agencyId);
  }),
});
