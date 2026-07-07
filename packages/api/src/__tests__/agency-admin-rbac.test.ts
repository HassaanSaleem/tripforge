// L2 contract test for the THIRD authorization tier — `agencyAdminProcedure`
// (owner/admin only), INV-023. This middleware is defined in trpc.ts but is not yet
// consumed by any shipping router (the agency-admin surfaces — member management,
// markup policy, billing — arrive in later seeds). rbac.test.ts covers public /
// agent-gated procedures but leaves the admin tier untested, so its authorization
// contract is unpinned: a later refactor could silently drop the owner/admin check
// and every existing test would still pass. This test mounts a throwaway
// admin-gated procedure and pins the full ladder so the future admin surface
// inherits a tested gate — authorization is enforced at the procedure, never by
// hiding UI (INV-023).
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { router, agencyAdminProcedure } from "../trpc.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

// Throwaway router exercising the admin tier via a caller (same tRPC instance as the
// app router, so the middleware behaves identically to production).
const adminTestRouter = router({
  policy: agencyAdminProcedure.query(({ ctx }) => ({
    agencyId: ctx.session.agencyId,
    role: ctx.session.agencyRole,
  })),
});

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const owner: SessionContext = { userId: "u-owner", agencyId: "org-1", agencyRole: "owner" };
const admin: SessionContext = { userId: "u-admin", agencyId: "org-1", agencyRole: "admin" };
const member: SessionContext = { userId: "u-member", agencyId: "org-1", agencyRole: "member" };
const traveler: SessionContext = { userId: "u-traveler" }; // no agency

describe("agencyAdminProcedure (owner/admin-gated tier — INV-023)", () => {
  it("allows an agency OWNER", async () => {
    const caller = adminTestRouter.createCaller(ctxFor(owner));
    await expect(caller.policy()).resolves.toEqual({ agencyId: "org-1", role: "owner" });
  });

  it("allows an agency ADMIN", async () => {
    const caller = adminTestRouter.createCaller(ctxFor(admin));
    await expect(caller.policy()).resolves.toEqual({ agencyId: "org-1", role: "admin" });
  });

  it("rejects an agency MEMBER with FORBIDDEN (role too low, not a session problem)", async () => {
    const caller = adminTestRouter.createCaller(ctxFor(member));
    await expect(caller.policy()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: /owner or admin/i,
    });
  });

  it("rejects a TRAVELER with FORBIDDEN (agency membership required first)", async () => {
    const caller = adminTestRouter.createCaller(ctxFor(traveler));
    // The agent gate fires before the admin gate: a traveler is missing agency membership,
    // a distinct denial reason from a member with an insufficient role.
    await expect(caller.policy()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: /agency membership/i,
    });
  });

  it("rejects an ANONYMOUS caller with UNAUTHORIZED (no session at all)", async () => {
    const caller = adminTestRouter.createCaller(ctxFor(null));
    await expect(caller.policy()).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.policy()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
