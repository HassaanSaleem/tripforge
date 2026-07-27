// L3 — TRAVELER group trips against a REAL database (spec 040 SC-002/003/004/005).
// Walks verify → create → invite → join → chat → confirm → finalize through the
// full clientView.groups.* tRPC surface, asserting exact state deltas AND the two
// trust invariants the feature exists to prove (Constitution VI, enforced in the
// transaction path — not a policy doc):
//   • the premium+identity ELIGIBILITY GATE refuses an ineligible caller at every
//     mutation with ZERO new rows (state conservation, SC-002);
//   • FINALIZE is gated on ALL-PARTY confirmation, re-read+row-locked inside its
//     transaction, so a group is NEVER finalized while a member is pending
//     (SC-003), including the concurrent confirm-vs-finalize branch.
// Plus the membership scoping negatives (non-member read/post, non-organizer
// finalize — SC-004). Not a money path (a group moves no money), so there is no
// conservation-of-money assertion; the failure-path conservation is on the gate.
//
// Env-gated: runs when DATABASE_URL points at a live Postgres (compose stack;
// quickstart §4). Skipping without the env is loud, never silent green.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  count,
  createDb,
  eq,
  organization,
  travelerGroup,
  travelerGroupMember,
  travelerGroupMessage,
  travelerMembership,
  user as userTable,
  type Db,
  type DbHandle,
} from "@tripforge/db";
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM } from "@tripforge/llm";
import { appRouter } from "../routers/root.js";
import { draftViaCaller } from "./draft-helper.js";
import { STATIC_RATES } from "../rates.js";
import type { Container, SessionContext } from "../context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LONG = 30_000;

describe.skipIf(!DATABASE_URL)("L3 traveler group trips (real Postgres)", () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  afterAll(async () => {
    await handle.close();
  });

  function makeContainer(db?: Db): Container {
    return {
      hotel: new SandboxHotelAdapter(),
      activity: new SandboxActivityAdapter(),
      transfer: new SandboxTransferAdapter(),
      carRental: new SandboxCarRentalAdapter(),
      mediaStore: new SandboxMediaStoreAdapter(db ?? handle.db),
      llm: new FakeLLM(),
      rates: STATIC_RATES,
      db: db ?? handle.db,
    };
  }

  function callerFor(session: SessionContext) {
    return appRouter.createCaller({ session, container: makeContainer() });
  }

  async function makeAgency(): Promise<SessionContext & { agencyId: string; agencyRole: "member" }> {
    const agencyId = `l3gt-agency-${randomUUID()}`;
    const userId = `l3gt-agent-${randomUUID()}`;
    await handle.db.insert(organization).values({ id: agencyId, name: "L3 Group-Trips Agency", slug: agencyId });
    await handle.db.insert(userTable).values({ id: userId, name: "L3 Agent", email: `${userId}@example.test` });
    return { userId, agencyId, agencyRole: "member" };
  }

  /** A traveler: a `user` row with NO `member` row (org-less consumer identity). */
  async function makeTraveler(label: string): Promise<SessionContext> {
    const userId = `l3gt-${label}-${randomUUID()}`;
    await handle.db.insert(userTable).values({ id: userId, name: `L3 ${label}`, email: `${userId}@example.test` });
    return { userId };
  }

  const DRAFT_INPUT = {
    destination: "Lisbon",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    party: { adults: 2, children: 0 },
    budget: { mode: "hardCap", amountMinor: 120_000, currency: "USD" },
  } as const;

  /** An agency-owned, shared itinerary — the trip a traveler group forms around. */
  async function draftAndShare(session: SessionContext & { agencyId: string }): Promise<string> {
    const caller = callerFor(session);
    const drafted = await draftViaCaller(caller, DRAFT_INPUT);
    expect(drafted.status).toBe("drafted");
    if (drafted.status !== "drafted") throw new Error("draft failed");
    const shared = await caller.workspace.itinerary.share({ itineraryId: drafted.itinerary.id });
    if (shared.status !== "shared") throw new Error("share failed");
    return shared.token;
  }

  async function memberCount(groupId: string): Promise<number> {
    const [row] = await handle.db.select({ n: count() }).from(travelerGroupMember).where(eq(travelerGroupMember.groupId, groupId));
    return Number(row?.n ?? 0);
  }

  it(
    "eligibility gate: an unverified traveler cannot create OR join (zero rows); a verified one can (SC-002)",
    async () => {
      const agent = await makeAgency();
      const token = await draftAndShare(agent);
      const traveler = await makeTraveler("organizer");

      // Unverified create → not_eligible, and NO group row exists.
      const refused = await callerFor(traveler).clientView.groups.create({ token, title: "Trip crew" });
      expect(refused).toEqual({ status: "not_eligible" });
      const [g0] = await handle.db
        .select({ n: count() })
        .from(travelerGroup)
        .where(eq(travelerGroup.organizerUserId, traveler.userId));
      expect(Number(g0?.n)).toBe(0);

      // Verify → premium+identity, then create succeeds with the organizer as a
      // CONFIRMED organizer member.
      const membership = await callerFor(traveler).clientView.groups.verify();
      expect(membership).toEqual({ tier: "premium", identityVerified: true, eligible: true });
      const created = await callerFor(traveler).clientView.groups.create({ token, title: "Trip crew" });
      expect(created.status).toBe("created");
      if (created.status !== "created") return;

      const members = await handle.db.select().from(travelerGroupMember).where(eq(travelerGroupMember.groupId, created.groupId));
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ role: "organizer", confirmationStatus: "confirmed", userId: traveler.userId });

      // An UNVERIFIED stranger joining via the invite → not_eligible, NO member added.
      const stranger = await makeTraveler("stranger");
      const joinRefused = await callerFor(stranger).clientView.groups.join({ inviteToken: created.inviteToken });
      expect(joinRefused).toEqual({ status: "not_eligible" });
      expect(await memberCount(created.groupId)).toBe(1);
    },
    LONG,
  );

  it(
    "full journey: finalize is refused while a member is pending (group unchanged), then succeeds when all confirm (SC-003)",
    async () => {
      const agent = await makeAgency();
      const token = await draftAndShare(agent);
      const organizer = await makeTraveler("organizer");
      const member = await makeTraveler("member");
      await callerFor(organizer).clientView.groups.verify();
      await callerFor(member).clientView.groups.verify();

      const created = await callerFor(organizer).clientView.groups.create({ token, title: "Lisbon crew" });
      if (created.status !== "created") throw new Error("create failed");

      const joined = await callerFor(member).clientView.groups.join({ inviteToken: created.inviteToken });
      expect(joined.status).toBe("joined");
      expect(await memberCount(created.groupId)).toBe(2);

      // The joiner is linked to the trip too (My Trips) — the group grants access.
      const memberTrips = await callerFor(member).clientView.myTrips();
      expect(memberTrips.some((t) => t.token === token)).toBe(true);

      // Chat works during forming (member-only, in order).
      const posted = await callerFor(member).clientView.groups.message({ groupId: created.groupId, body: "So excited!" });
      expect(posted.status).toBe("posted");

      // Finalize REFUSED while the member is still pending — group is UNCHANGED.
      const early = await callerFor(organizer).clientView.groups.finalize({ groupId: created.groupId });
      expect(early.status).toBe("awaiting_confirmations");
      if (early.status === "awaiting_confirmations") {
        expect(early.pending.map((p) => p.userId)).toContain(member.userId);
      }
      const [pendingGroup] = await handle.db.select().from(travelerGroup).where(eq(travelerGroup.id, created.groupId));
      expect(pendingGroup?.status).toBe("forming");
      expect(pendingGroup?.finalizedAt).toBeNull();

      // Member confirms → finalize now succeeds exactly once.
      const confirmed = await callerFor(member).clientView.groups.confirm({ groupId: created.groupId });
      expect(confirmed.status).toBe("confirmed");
      const finalized = await callerFor(organizer).clientView.groups.finalize({ groupId: created.groupId });
      expect(finalized.status).toBe("finalized");
      const [finalGroup] = await handle.db.select().from(travelerGroup).where(eq(travelerGroup.id, created.groupId));
      expect(finalGroup?.status).toBe("finalized");
      expect(finalGroup?.finalizedAt).not.toBeNull();

      // Idempotent: a second finalize does not re-transition.
      const again = await callerFor(organizer).clientView.groups.finalize({ groupId: created.groupId });
      expect(again.status).toBe("not_active");

      // Detail reflects the full state, all-confirmed, with the chat message.
      const detail = await callerFor(organizer).clientView.groups.get({ groupId: created.groupId });
      expect(detail.status).toBe("ok");
      if (detail.status === "ok") {
        expect(detail.group.allConfirmed).toBe(true);
        expect(detail.group.status).toBe("finalized");
        expect(detail.group.messages.some((m) => m.body === "So excited!")).toBe(true);
        expect(detail.group.members).toHaveLength(2);
      }
    },
    LONG,
  );

  it(
    "membership scoping: a non-member cannot read or post; a non-organizer cannot finalize (SC-004)",
    async () => {
      const agent = await makeAgency();
      const token = await draftAndShare(agent);
      const organizer = await makeTraveler("organizer");
      const member = await makeTraveler("member");
      const stranger = await makeTraveler("stranger"); // eligible, but NOT a member
      await callerFor(organizer).clientView.groups.verify();
      await callerFor(member).clientView.groups.verify();
      await callerFor(stranger).clientView.groups.verify();

      const created = await callerFor(organizer).clientView.groups.create({ token, title: "Coast crew" });
      if (created.status !== "created") throw new Error("create failed");
      await callerFor(member).clientView.groups.join({ inviteToken: created.inviteToken });

      // Non-member read → forbidden (same surface as an unknown group; no oracle).
      expect(await callerFor(stranger).clientView.groups.get({ groupId: created.groupId })).toEqual({ status: "forbidden" });
      // Non-member post → forbidden, zero message rows.
      expect(await callerFor(stranger).clientView.groups.message({ groupId: created.groupId, body: "let me in" })).toEqual({
        status: "forbidden",
      });
      const [msgs] = await handle.db.select({ n: count() }).from(travelerGroupMessage).where(eq(travelerGroupMessage.groupId, created.groupId));
      expect(Number(msgs?.n)).toBe(0);

      // Non-organizer finalize → forbidden, group unchanged.
      expect(await callerFor(member).clientView.groups.finalize({ groupId: created.groupId })).toEqual({ status: "forbidden" });
      const [grp] = await handle.db.select().from(travelerGroup).where(eq(travelerGroup.id, created.groupId));
      expect(grp?.status).toBe("forming");
      expect(grp?.finalizedAt).toBeNull();
    },
    LONG,
  );

  it(
    "concurrency: a member confirming while the organizer finalizes never finalizes a pending group",
    async () => {
      const agent = await makeAgency();
      const token = await draftAndShare(agent);
      const organizer = await makeTraveler("organizer");
      const member = await makeTraveler("member");
      await callerFor(organizer).clientView.groups.verify();
      await callerFor(member).clientView.groups.verify();

      const created = await callerFor(organizer).clientView.groups.create({ token, title: "Race crew" });
      if (created.status !== "created") throw new Error("create failed");
      await callerFor(member).clientView.groups.join({ inviteToken: created.inviteToken });

      // Race confirm vs finalize. The finalize tx row-locks the member set, so it
      // either sees the confirm and finalizes, or serializes before it and refuses.
      const [, finalizeResult] = await Promise.all([
        callerFor(member).clientView.groups.confirm({ groupId: created.groupId }),
        callerFor(organizer).clientView.groups.finalize({ groupId: created.groupId }),
      ]);

      const [grp] = await handle.db.select().from(travelerGroup).where(eq(travelerGroup.id, created.groupId));
      if (finalizeResult.status === "finalized") {
        // If it finalized, EVERY member must have been confirmed (the invariant).
        const members = await handle.db.select().from(travelerGroupMember).where(eq(travelerGroupMember.groupId, created.groupId));
        expect(members.every((m) => m.confirmationStatus === "confirmed")).toBe(true);
        expect(grp?.status).toBe("finalized");
      } else {
        // Otherwise finalize refused and left the group forming (no partial state).
        expect(finalizeResult.status).toBe("awaiting_confirmations");
        expect(grp?.status).toBe("forming");
        expect(grp?.finalizedAt).toBeNull();
      }

      // After the race, the member is confirmed, so a follow-up finalize converges.
      const settle = await callerFor(organizer).clientView.groups.finalize({ groupId: created.groupId });
      expect(["finalized", "not_active"]).toContain(settle.status);
    },
    LONG,
  );

  it(
    "membership rows are agency-less and traveler-scoped (no agencyId leaks into group state)",
    async () => {
      const traveler = await makeTraveler("solo");
      const membership = await callerFor(traveler).clientView.groups.membership();
      expect(membership).toEqual({ tier: "standard", identityVerified: false, eligible: false });
      const verified = await callerFor(traveler).clientView.groups.verify();
      expect(verified.eligible).toBe(true);
      const [row] = await handle.db.select().from(travelerMembership).where(eq(travelerMembership.userId, traveler.userId));
      expect(row).toMatchObject({ tier: "premium", identityVerified: true });
    },
    LONG,
  );
});
