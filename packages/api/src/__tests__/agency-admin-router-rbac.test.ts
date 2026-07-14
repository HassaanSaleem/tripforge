// L2 contract test — the workspace.agencyAdmin.* authorization ladder
// (seed-0009, INV-023/024) for the real router (not the throwaway one in
// agency-admin-rbac.test.ts, which pins the middleware contract in isolation).
// anonymous → UNAUTHORIZED and a plain agent-gate reject (traveler, no
// agency) → FORBIDDEN both fire before any database access (the container
// here has no db); a MEMBER role additionally proves the admin-tier gate
// itself rejects, distinct from the agent gate. Business-path behavior
// (owner/admin ALLOWED, INV-004 tenant scoping) is covered by
// l3-agency-admin.test.ts against a real Postgres, since it requires
// real member rows to assert on.
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const traveler: SessionContext = { userId: "u-traveler" }; // no agency membership
const member: SessionContext = { userId: "u-member", agencyId: "org-1", agencyRole: "member" };

describe("workspace.agencyAdmin.* authorization ladder (INV-023)", () => {
  it("members: anonymous → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.workspace.agencyAdmin.members()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("members: traveler (no agency) → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(ctxFor(traveler));
    await expect(caller.workspace.agencyAdmin.members()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: /agency membership/i,
    });
  });

  it("members: agency MEMBER (role too low) → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(ctxFor(member));
    await expect(caller.workspace.agencyAdmin.members()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: /owner or admin/i,
    });
  });
});
