// L3 — membership helpers against a REAL database (spec 007 research D9).
// getPrimaryMembership backs the session-creation hook that auto-activates an
// agent's agency (D1); getOrganizationName backs the human-name workspace
// greeting (D5/IMP-2). Both are read-only lookups, so the witness is exact
// row-level behavior: none / one / oldest-of-two memberships.
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §2). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { createDb, type Db, type DbHandle } from "../client.js";
import { member, organization, user } from "../schema.js";
import { getOrganizationName, getPrimaryMembership } from "../membership.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 membership helpers (real Postgres)", () => {
  let handle: DbHandle;
  let db: Db;

  const suffix = randomUUID().slice(0, 8);
  const userId = `u-membership-${suffix}`;
  const orgOldId = `org-old-${suffix}`;
  const orgNewId = `org-new-${suffix}`;

  beforeAll(async () => {
    handle = createDb(DATABASE_URL as string);
    db = handle.db;
    await db.insert(user).values({
      id: userId,
      name: "Membership Helper Probe",
      email: `membership-${suffix}@example.test`,
    });
    await db.insert(organization).values([
      { id: orgOldId, name: `Oldest Agency ${suffix}`, slug: `oldest-${suffix}` },
      { id: orgNewId, name: `Newest Agency ${suffix}`, slug: `newest-${suffix}` },
    ]);
  }, LONG);

  afterAll(async () => {
    // FKs cascade member rows; organizations are not user-owned, delete explicitly.
    await db.delete(member).where(eq(member.userId, userId));
    await db.delete(organization).where(inArray(organization.id, [orgOldId, orgNewId]));
    await db.delete(user).where(eq(user.id, userId));
    await handle.close();
  }, LONG);

  it(
    "getPrimaryMembership: no membership → undefined (traveler stays traveler)",
    async () => {
      expect(await getPrimaryMembership(db, userId)).toBeUndefined();
    },
    LONG,
  );

  it(
    "getPrimaryMembership: single membership → that organization + role",
    async () => {
      await db.insert(member).values({
        id: `m-old-${suffix}`,
        organizationId: orgOldId,
        userId,
        role: "owner",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      expect(await getPrimaryMembership(db, userId)).toEqual({
        organizationId: orgOldId,
        role: "owner",
      });
    },
    LONG,
  );

  it(
    "getPrimaryMembership: two memberships → oldest wins (P0 primary-agency rule)",
    async () => {
      await db.insert(member).values({
        id: `m-new-${suffix}`,
        organizationId: orgNewId,
        userId,
        role: "member",
        createdAt: new Date("2026-06-01T00:00:00Z"),
      });
      expect(await getPrimaryMembership(db, userId)).toEqual({
        organizationId: orgOldId,
        role: "owner",
      });
    },
    LONG,
  );

  it(
    "getOrganizationName: round-trips the display name; unknown id → undefined",
    async () => {
      expect(await getOrganizationName(db, orgOldId)).toBe(`Oldest Agency ${suffix}`);
      expect(await getOrganizationName(db, `org-missing-${suffix}`)).toBeUndefined();
    },
    LONG,
  );
});
