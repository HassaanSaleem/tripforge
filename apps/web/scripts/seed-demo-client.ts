// Demo TRAVELER (client) seed — creates a client account with a trip already
// shared to it, so the /view/my-trips surface is populated for the deployed
// demo. A traveler is a Better Auth user with NO organization membership
// (spec 030 org-less-user model). Idempotent. Run against the target DB:
//   DATABASE_URL=<url> npx tsx scripts/seed-demo-client.ts
import {
  and,
  eq,
  member,
  itinerary,
  clientTripLink,
  user as userTable,
  type Db,
} from "@tripforge/db";
import {
  buildContainer,
  createAppCaller,
  createContext,
  type AgentSessionContext,
} from "@tripforge/api";
import { auth } from "../lib/auth.js";
import { getDb } from "../lib/db.js";

/** Documented development-only demo credential (mirrors seed-demo's DEMO_PASSWORD). */
const CLIENT_EMAIL = "client@demo.test";
const CLIENT_NAME = "Amelia Traveler";
const CLIENT_PASSWORD = "TravelerDemo!2026";

async function ensureTraveler(db: Db): Promise<string> {
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, CLIENT_EMAIL))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const signedUp = await auth.api.signUpEmail({
    body: { name: CLIENT_NAME, email: CLIENT_EMAIL, password: CLIENT_PASSWORD },
  });
  const id = signedUp.user?.id;
  if (!id) throw new Error(`seed-demo-client: signUpEmail returned no id for ${CLIENT_EMAIL}`);
  return id;
}

async function main(): Promise<void> {
  const handle = getDb();
  const db = handle.db;
  const container = buildContainer({ db });

  // 1. the demo traveler (no org membership → traveler session)
  const travelerId = await ensureTraveler(db);

  // 2. pick a seeded itinerary + the owning agency's owner
  const itin = (
    await db.select({ id: itinerary.id, agencyId: itinerary.agencyId }).from(itinerary).limit(1)
  )[0];
  if (!itin) throw new Error("seed-demo-client: no itinerary found — run db:seed first");
  const owner = (
    await db
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, itin.agencyId), eq(member.role, "owner")))
      .limit(1)
  )[0];
  if (!owner) throw new Error(`seed-demo-client: no owner for agency ${itin.agencyId}`);

  // 3. mint the durable share link as the owning agent (so /view/<token> resolves
  //    AND listTravelerTrips can project the trip)
  const session: AgentSessionContext = {
    userId: owner.userId,
    agencyId: itin.agencyId,
    agencyRole: "owner",
  };
  const caller = createAppCaller(createContext({ session, container }));
  const shared = await caller.workspace.itinerary.share({ itineraryId: itin.id });
  if (shared.status !== "shared") throw new Error(`seed-demo-client: share failed — ${shared.status}`);

  // 4. link the trip to the demo traveler — exactly what "attach on view" does
  //    (spec 031), so My Trips shows it immediately without a manual visit
  await db
    .insert(clientTripLink)
    .values({ userId: travelerId, itineraryId: itin.id, source: "view" })
    .onConflictDoNothing({ target: [clientTripLink.userId, clientTripLink.itineraryId] });

  console.log(`seed-demo-client: traveler ${CLIENT_EMAIL} / ${CLIENT_PASSWORD}`);
  console.log(`seed-demo-client: linked trip ${itin.id} — /view/my-trips is now populated`);
  console.log(`seed-demo-client: share link ${shared.path}`);
  await handle.close();
}

main().catch((err: unknown) => {
  console.error("seed-demo-client: FAILED —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
