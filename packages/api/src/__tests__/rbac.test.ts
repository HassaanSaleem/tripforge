// L2 contract test (tRPC caller) for the role/tenant middleware — INV-023/024.
// Proves authorization is enforced at the procedure, not by hiding UI: an agent
// reaches workspace.whoami; a traveler is rejected FORBIDDEN; health is open to all.
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const agent: SessionContext = { userId: "u-agent", agencyId: "org-1", agencyRole: "member" };
const traveler: SessionContext = { userId: "u-traveler" }; // no agency
const admin: SessionContext = { userId: "u-admin", agencyId: "org-1", agencyRole: "admin" };

describe("health (public procedure)", () => {
  it("is open to an anonymous caller", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.health()).resolves.toEqual({ status: "ok" });
  });

  it("is open to a traveler", async () => {
    const caller = appRouter.createCaller(ctxFor(traveler));
    await expect(caller.health()).resolves.toEqual({ status: "ok" });
  });
});

describe("workspace.whoami (agent-gated procedure — INV-024)", () => {
  it("returns the agent identity + tenant scope for an agent session", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(caller.workspace.whoami()).resolves.toEqual({
      userId: "u-agent",
      agencyId: "org-1",
      role: "member",
    });
  });

  it("rejects a traveler session with FORBIDDEN (not UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller(ctxFor(traveler));
    await expect(caller.workspace.whoami()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.workspace.whoami()).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.workspace.whoami()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("scopes different agencies independently (INV-004)", async () => {
    const other: SessionContext = { userId: "u-2", agencyId: "org-2", agencyRole: "owner" };
    const caller = appRouter.createCaller(ctxFor(other));
    await expect(caller.workspace.whoami()).resolves.toMatchObject({ agencyId: "org-2" });
    // admin from org-1 never sees org-2's scope
    const adminCaller = appRouter.createCaller(ctxFor(admin));
    await expect(adminCaller.workspace.whoami()).resolves.toMatchObject({ agencyId: "org-1" });
  });
});
