// L2 contract test — the traveler group-trips authorization boundary (spec 040,
// INV-023/024). Every clientView.groups.* procedure is protectedProcedure: an
// anonymous caller is rejected with UNAUTHORIZED BEFORE any database access (the
// container here has NO db, so reaching a resolver would throw a different
// "database not configured" error — proving the guard fires first). The
// premium+identity ELIGIBILITY gate and the business paths are covered against a
// real Postgres in l3-group-trips.test.ts.
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const UUID = "00000000-0000-4000-8000-000000000000";

describe("traveler group-trips authorization (INV-023/INV-024)", () => {
  it("anonymous callers get UNAUTHORIZED on every clientView.groups procedure", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.clientView.groups.membership()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.verify()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.create({ token: UUID, title: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.join({ inviteToken: UUID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.get({ groupId: UUID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.message({ groupId: UUID, body: "hi" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.confirm({ groupId: UUID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.finalize({ groupId: UUID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.groups.cancel({ groupId: UUID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
