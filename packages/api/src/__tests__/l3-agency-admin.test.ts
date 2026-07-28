// L3 — workspace.agencyAdmin.members against a REAL database (seed-0009):
// owner/admin ALLOWED with the correct roster, and two-tenant isolation
// (INV-004) — agency A's member list never includes agency B's members.
// The RBAC ladder's reject paths (anon/traveler/member) are covered without
// a database by agency-admin-router-rbac.test.ts; this suite covers what
// only a real Postgres can prove — the ALLOWED path's actual query result.
//
// Env-gated like the sibling l3 suites: runs when DATABASE_URL points at a
// live Postgres (compose stack); skipping without the env is loud, not green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, member, organization, user as userTable, type DbHandle } from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 workspace.agencyAdmin.members (real Postgres)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(): Container {
    return {
      hotel: new SandboxHotelAdapter(),
      activity: new SandboxActivityAdapter(),
      transfer: new SandboxTransferAdapter(),
      carRental: new SandboxCarRentalAdapter(),
      mediaStore: new SandboxMediaStoreAdapter(handle.db),
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: handle.db,
    };
  }

  async function makeAgencyWithMembers(
    agencyName: string,
    roster: Array<{ name: string; role: "owner" | "admin" | "member" }>,
  ): Promise<{ agencyId: string; sessions: Record<string, SessionContext> }> {
    const agencyId = `l3aa-agency-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name: agencyName, slug: agencyId });

    const sessions: Record<string, SessionContext> = {};
    for (const { name, role } of roster) {
      const userId = `l3aa-user-${randomUUID()}`;
      await handle.db.insert(userTable).values({ id: userId, name, email: `${userId}@example.test` });
      await handle.db
        .insert(member)
        .values({ id: `l3aa-member-${randomUUID()}`, organizationId: agencyId, userId, role });
      sessions[name] = { userId, agencyId, agencyRole: role };
    }
    return { agencyId, sessions };
  }

  function callerFor(session: SessionContext | null) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  it(
    "an OWNER sees the full roster with names, emails, and roles",
    async () => {
      const { sessions } = await makeAgencyWithMembers("Roster Owner Co", [
        { name: "Olive Owner", role: "owner" },
        { name: "Amy Admin", role: "admin" },
        { name: "Mo Member", role: "member" },
      ]);

      const roster = await callerFor(sessions["Olive Owner"]!).workspace.agencyAdmin.members();
      expect(roster).toHaveLength(3);
      const byName = new Map(roster.map((m) => [m.name, m]));
      expect(byName.get("Olive Owner")).toMatchObject({ role: "owner" });
      expect(byName.get("Amy Admin")).toMatchObject({ role: "admin" });
      expect(byName.get("Mo Member")).toMatchObject({ role: "member" });
      expect(byName.get("Mo Member")?.email).toMatch(/@example\.test$/);
    },
    LONG,
  );

  it(
    "an ADMIN can also list the roster (owner/admin both ALLOWED)",
    async () => {
      const { sessions } = await makeAgencyWithMembers("Roster Admin Co", [
        { name: "Ada Admin", role: "admin" },
      ]);

      const roster = await callerFor(sessions["Ada Admin"]!).workspace.agencyAdmin.members();
      expect(roster).toHaveLength(1);
      expect(roster[0]?.name).toBe("Ada Admin");
    },
    LONG,
  );

  it(
    "two-tenant isolation: agency A's roster never includes agency B's members (INV-004)",
    async () => {
      const alpha = await makeAgencyWithMembers("Alpha Roster Co", [{ name: "Alpha Owner", role: "owner" }]);
      const beta = await makeAgencyWithMembers("Beta Roster Co", [{ name: "Beta Owner", role: "owner" }]);

      const alphaRoster = await callerFor(alpha.sessions["Alpha Owner"]!).workspace.agencyAdmin.members();
      const betaRoster = await callerFor(beta.sessions["Beta Owner"]!).workspace.agencyAdmin.members();

      expect(alphaRoster.map((m) => m.name)).toEqual(["Alpha Owner"]);
      expect(betaRoster.map((m) => m.name)).toEqual(["Beta Owner"]);
      expect(alphaRoster.some((m) => m.name === "Beta Owner")).toBe(false);
      expect(betaRoster.some((m) => m.name === "Alpha Owner")).toBe(false);
    },
    LONG,
  );
});
