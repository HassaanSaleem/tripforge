// Idempotent demo seed (spec 017 "demo-seed-data", ticket demo-01-seed). Runs
// as the final step of the Docker migrate stage (after db:push && db:views,
// before the web service is allowed to start — see apps/web/Dockerfile /
// docker-compose.yml). Populates vetted demo agencies, sign-in-capable demo
// users, drafted itineraries across the curated hero cities, one attached
// media asset, marketplace listings, completed licenses, and ratings — so a
// fresh `docker compose up --build --wait` shows a populated product instead
// of an empty shell (contracts/seed-script.md is this script's contract).
//
// Reuses the REAL application layer throughout (research.md D1-D3): Better
// Auth's server API for password accounts (this is the only package that
// owns a Better Auth instance), direct Drizzle inserts for organization/
// member/agency_vetting (mirroring packages/api's L3 test helpers — the same
// operator-class action as packages/db/scripts/vet-agency.mjs), and the real
// tRPC application router (buildContainer/createContext/createAppCaller) for
// every itinerary/marketplace/media mutation — so seeded data is produced by
// the exact same code path a live user's actions would be.
import { randomUUID } from "node:crypto";
import {
  agencyVetting,
  and,
  eq,
  member,
  organization,
  user as userTable,
  type Db,
} from "@tripforge/db";
import {
  buildContainer,
  createAppCaller,
  createContext,
  type AgentSessionContext,
  type Container,
  type DraftOutcome,
} from "@tripforge/api";
import { auth } from "../lib/auth.js";
import { getDb } from "../lib/db.js";

type AppCaller = ReturnType<typeof createAppCaller>;
type DraftInput = Parameters<AppCaller["workspace"]["itinerary"]["draft"]>[0];
type SelectDraftInput = Parameters<AppCaller["workspace"]["itinerary"]["selectDraft"]>[0];

/** Not secret — a documented, development-only demo credential (spec 017 Assumptions). */
const DEMO_PASSWORD = "TripForgeDemo!2026";
/** Comfortably covers the curated catalog's realistic pricing (research.md D7). */
const BUDGET_HARD_CAP_MINOR = 500_000; // $5,000

interface DemoAgencyFixture {
  slug: string;
  name: string;
  userName: string;
  email: string;
}

const AGENCIES: DemoAgencyFixture[] = [
  {
    slug: "demo-azure-travel-co",
    name: "Azure Travel Co",
    userName: "Priya Shah",
    email: "owner@azure-travel-demo.test",
  },
  {
    slug: "demo-meridian-dmc",
    name: "Meridian DMC",
    userName: "Diego Marín",
    email: "owner@meridian-dmc-demo.test",
  },
  {
    slug: "demo-lisbon-and-co",
    name: "Lisbon & Co",
    userName: "Inês Carvalho",
    email: "owner@lisbon-and-co-demo.test",
  },
  {
    slug: "demo-kaido-journeys",
    name: "Kaido Journeys",
    userName: "Haruto Kaido",
    email: "owner@kaido-journeys-demo.test",
  },
  {
    slug: "demo-nordlight-adventures",
    name: "Nordlight Adventures",
    userName: "Sigrún Jóns",
    email: "owner@nordlight-adventures-demo.test",
  },
];

interface SeededItineraryFixture {
  agencySlug: string;
  destination: string;
  checkIn: string;
  checkOut: string;
}

// Spread across all 5 agencies and all 4 curated hero cities (FR-003, SC-004).
const ITINERARIES: SeededItineraryFixture[] = [
  { agencySlug: "demo-azure-travel-co", destination: "Lisbon", checkIn: "2026-09-10", checkOut: "2026-09-15" },
  { agencySlug: "demo-azure-travel-co", destination: "Tokyo", checkIn: "2026-10-05", checkOut: "2026-10-10" },
  { agencySlug: "demo-meridian-dmc", destination: "Marrakech", checkIn: "2026-09-20", checkOut: "2026-09-25" },
  { agencySlug: "demo-lisbon-and-co", destination: "Lisbon", checkIn: "2026-11-02", checkOut: "2026-11-07" },
  { agencySlug: "demo-kaido-journeys", destination: "Tokyo", checkIn: "2026-10-15", checkOut: "2026-10-20" },
  { agencySlug: "demo-nordlight-adventures", destination: "Reykjavik", checkIn: "2026-09-28", checkOut: "2026-10-03" },
  { agencySlug: "demo-meridian-dmc", destination: "Reykjavik", checkIn: "2026-11-10", checkOut: "2026-11-15" },
];

interface ListingFixture {
  itineraryIndex: number; // index into ITINERARIES
  title: string;
  priceMinor: number;
  licenseTerms: string;
  revenueShareBps: number;
}

const LISTING_TERMS = "Resale and white-label permitted; original branding must be removed.";

const LISTINGS: ListingFixture[] = [
  {
    itineraryIndex: 0,
    title: "Lisbon Getaway — white-label ready",
    priceMinor: 45_000,
    licenseTerms: LISTING_TERMS,
    revenueShareBps: 1_000,
  },
  {
    itineraryIndex: 2,
    title: "Marrakech Escape — white-label ready",
    priceMinor: 38_000,
    licenseTerms: LISTING_TERMS,
    revenueShareBps: 1_200,
  },
  {
    itineraryIndex: 3,
    title: "Lisbon Heritage Week — white-label ready",
    priceMinor: 52_000,
    licenseTerms: LISTING_TERMS,
    revenueShareBps: 1_000,
  },
  {
    itineraryIndex: 5,
    title: "Reykjavik Northern Lights — white-label ready",
    priceMinor: 61_000,
    licenseTerms: LISTING_TERMS,
    revenueShareBps: 1_500,
  },
];

interface LicenseFixture {
  listingIndex: number; // index into LISTINGS
  resellerSlug: string;
  stars: number;
  comment: string;
}

// 4 completed licenses across 3 distinct listings/sellers (FR-006/007) — more
// than the 3 required, and distributed so at least two sellers (Azure,
// Meridian) show non-zero earnings.
const LICENSES: LicenseFixture[] = [
  {
    listingIndex: 0,
    resellerSlug: "demo-kaido-journeys",
    stars: 5,
    comment: "Beautifully curated — our clients loved it.",
  },
  {
    listingIndex: 1,
    resellerSlug: "demo-kaido-journeys",
    stars: 4,
    comment: "Great itinerary; minor tweaks needed for family groups.",
  },
  {
    listingIndex: 3,
    resellerSlug: "demo-azure-travel-co",
    stars: 5,
    comment: "Stunning aurora-hunting itinerary, easy to white-label.",
  },
  {
    listingIndex: 1,
    resellerSlug: "demo-lisbon-and-co",
    stars: 5,
    comment: "Fantastic Atlas Mountains day trip inclusion.",
  },
];

const DEMO_MEDIA = {
  url: "https://images.unsplash.com/photo-1548707309-dcebeab9ea9b?q=80&w=1200&auto=format&fit=crop",
  alt: "A narrow street in Lisbon's Alfama neighborhood",
  attribution: "Photo by Claudio Schwarz on Unsplash",
};

// ─── Identity + tenancy scaffolding (direct insert — the seed script is an
// operator-class action, same class as packages/db/scripts/vet-agency.mjs;
// research.md D2) ────────────────────────────────────────────────────────

/** Insert-or-reuse by slug; `organization.id` IS the slug (both deterministic). */
async function ensureAgency(db: Db, slug: string, name: string): Promise<string> {
  await db.insert(organization).values({ id: slug, name, slug }).onConflictDoNothing();
  const rows = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`ensureAgency: failed to read back agency "${slug}" after insert`);
  return row.id;
}

/** Returns true only if THIS call newly vetted the agency. */
async function ensureVetted(db: Db, agencyId: string): Promise<boolean> {
  const result = await db.insert(agencyVetting).values({ agencyId, vettedBy: "seed-demo" }).onConflictDoNothing();
  return (result.rowCount ?? 0) > 0;
}

/** Insert-or-reuse by email; the account (password) is owned entirely by Better Auth. */
async function ensureDemoUser(db: Db, email: string, name: string): Promise<{ userId: string; created: boolean }> {
  const existing = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  const found = existing[0];
  if (found) return { userId: found.id, created: false };
  const signedUp = await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } });
  const userId = signedUp.user?.id;
  if (!userId) throw new Error(`ensureDemoUser: signUpEmail returned no user id for ${email}`);
  return { userId, created: true };
}

/** member.id has no unique constraint of its own — gate on an explicit existence check. */
async function ensureMembership(db: Db, agencyId: string, userId: string, role: string): Promise<void> {
  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, agencyId), eq(member.userId, userId)))
    .limit(1);
  if (existing[0]) return;
  await db.insert(member).values({ id: randomUUID(), organizationId: agencyId, userId, role });
}

// ─── Application-layer flows (real tRPC callers — the same in-process
// pattern packages/api's L3 tests use; research.md D3) ─────────────────────

function sessionFor(agencyId: string, userId: string): AgentSessionContext {
  return { userId, agencyId, agencyRole: "owner" };
}

function callerFor(container: Container, session: AgentSessionContext): AppCaller {
  return createAppCaller(createContext({ session, container }));
}

/**
 * Drains the selectDraft SSE-style subscription (spec 019) to its terminal
 * outcome. `selectDraft` re-runs the full planner pipeline for the given
 * variant and persists it in one step — there is no need to drain the
 * (non-persisting) `draft` compare subscription first.
 */
async function drainSelectDraft(caller: AppCaller, input: SelectDraftInput): Promise<DraftOutcome> {
  const stream = await caller.workspace.itinerary.selectDraft(input);
  let outcome: DraftOutcome | undefined;
  for await (const event of stream) {
    if (event.type === "result") outcome = event.outcome;
  }
  if (!outcome) throw new Error("workspace.itinerary.selectDraft stream ended without a terminal result event");
  return outcome;
}

/**
 * Idempotency key: FakeLLM's draft title is the deterministic
 * "<destination> <variant label> trip" string (packages/llm/src/fake.ts) —
 * since this fixture set drafts each destination at most once per agency, a
 * title match is a reliable "already seeded" signal (data-model.md's
 * Idempotency Keys section).
 */
async function ensureSeededItinerary(
  caller: AppCaller,
  destination: string,
  checkIn: string,
  checkOut: string,
): Promise<{ itineraryId: string; created: boolean }> {
  const predictedTitle = `${destination} balanced trip`;
  const { itineraries } = await caller.workspace.itinerary.list();
  const existing = itineraries.find((it) => it.title === predictedTitle);
  if (existing) return { itineraryId: existing.id, created: false };

  const tripRequest: DraftInput = {
    destination,
    checkIn,
    checkOut,
    party: { adults: 2, children: 0 },
    tripStyle: "balanced",
    budget: { mode: "hardCap", amountMinor: BUDGET_HARD_CAP_MINOR, currency: "USD" },
  };
  const outcome = await drainSelectDraft(caller, { tripRequest, variant: "balanced" });
  if (outcome.status !== "drafted") {
    const reason = "reason" in outcome ? outcome.reason : undefined;
    throw new Error(`draft failed for "${destination}": ${outcome.status} (${reason ?? "no reason given"})`);
  }
  return { itineraryId: outcome.itinerary.id, created: true };
}

/** Attaches ONE licensed media asset to the itinerary's gallery, once. */
async function ensureGalleryMedia(caller: AppCaller, itineraryId: string): Promise<boolean> {
  const overview = await caller.workspace.itinerary.get({ itineraryId });
  if (overview.status !== "found") {
    throw new Error(`ensureGalleryMedia: itinerary ${itineraryId} not found`);
  }
  if (overview.itinerary.media.length > 0) return false;

  const registered = await caller.workspace.media.register({
    source: "licensed-stock",
    kind: "image",
    url: DEMO_MEDIA.url,
    alt: DEMO_MEDIA.alt,
    attribution: DEMO_MEDIA.attribution,
  });
  if (registered.status !== "registered") {
    throw new Error(`ensureGalleryMedia: register failed — ${registered.status}`);
  }
  const attached = await caller.workspace.itinerary.attachMedia({
    itineraryId,
    mediaAssetId: registered.asset.id,
    target: { scope: "gallery" },
  });
  if (attached.status !== "attached") {
    throw new Error(`ensureGalleryMedia: attachMedia failed — ${attached.status}`);
  }
  return true;
}

/** `createListing` is idempotent by construction — `already_listed` is success. */
async function ensureListing(
  caller: AppCaller,
  itineraryId: string,
  fixture: ListingFixture,
): Promise<{ listingId: string; created: boolean }> {
  const result = await caller.workspace.marketplace.createListing({
    itineraryId,
    title: fixture.title,
    priceMinor: fixture.priceMinor,
    licenseTerms: fixture.licenseTerms,
    revenueShareBps: fixture.revenueShareBps,
  });
  if (result.status === "listed") return { listingId: result.listingId, created: true };
  if (result.status === "already_listed") return { listingId: result.listingId, created: false };
  throw new Error(`ensureListing: createListing failed for "${fixture.title}" — ${result.status}`);
}

/** `licenseListing` is idempotent by construction — `already_licensed` is success. */
async function ensureLicense(caller: AppCaller, listingId: string): Promise<boolean> {
  const result = await caller.workspace.marketplace.licenseListing({ listingId });
  if (result.status === "licensed") return true;
  if (result.status === "already_licensed") return false;
  throw new Error(`ensureLicense: licenseListing failed for listing ${listingId} — ${result.status}`);
}

/** `rateListing` is an upsert — always safe to re-call. */
async function ensureRating(caller: AppCaller, listingId: string, stars: number, comment: string): Promise<void> {
  const result = await caller.workspace.marketplace.rateListing({ listingId, stars, comment });
  if (result.status !== "rated") {
    throw new Error(`ensureRating: rateListing failed for listing ${listingId} — ${result.status}`);
  }
}

async function main(): Promise<void> {
  const handle = getDb();
  const db = handle.db;
  const container = buildContainer({ db });

  const agencyIds = new Map<string, string>();
  const ownerUserIds = new Map<string, string>();

  for (const agency of AGENCIES) {
    const agencyId = await ensureAgency(db, agency.slug, agency.name);
    agencyIds.set(agency.slug, agencyId);
    const newlyVetted = await ensureVetted(db, agencyId);
    console.log(
      `seed-demo: agency "${agency.name}" (${agency.slug}) — ${newlyVetted ? "VETTED" : "already vetted"}, skipping`,
    );

    const { userId, created } = await ensureDemoUser(db, agency.email, agency.userName);
    ownerUserIds.set(agency.slug, userId);
    await ensureMembership(db, agencyId, userId, "owner");
    console.log(`seed-demo: user ${agency.email} / ${DEMO_PASSWORD} — ${created ? "created" : "already exists"}`);
  }

  const itineraryIds: string[] = [];
  for (const fixture of ITINERARIES) {
    const agencyId = agencyIds.get(fixture.agencySlug);
    const userId = ownerUserIds.get(fixture.agencySlug);
    if (!agencyId || !userId) throw new Error(`main: unknown agency slug "${fixture.agencySlug}"`);
    const caller = callerFor(container, sessionFor(agencyId, userId));
    const { itineraryId, created } = await ensureSeededItinerary(
      caller,
      fixture.destination,
      fixture.checkIn,
      fixture.checkOut,
    );
    itineraryIds.push(itineraryId);
    console.log(
      `seed-demo: itinerary "${fixture.destination}" (agency ${fixture.agencySlug}) — ${created ? "drafted, budget fits" : "already exists, skipping"}`,
    );
  }

  const firstItineraryId = itineraryIds[0];
  const firstAgencySlug = ITINERARIES[0]?.agencySlug;
  if (firstItineraryId && firstAgencySlug) {
    const agencyId = agencyIds.get(firstAgencySlug);
    const userId = ownerUserIds.get(firstAgencySlug);
    if (agencyId && userId) {
      const caller = callerFor(container, sessionFor(agencyId, userId));
      const attached = await ensureGalleryMedia(caller, firstItineraryId);
      console.log(`seed-demo: gallery media for itinerary ${firstItineraryId} — ${attached ? "attached" : "already present, skipping"}`);
    }
  }

  const listingIds: string[] = [];
  for (const fixture of LISTINGS) {
    const itinerary = ITINERARIES[fixture.itineraryIndex];
    const itineraryId = itineraryIds[fixture.itineraryIndex];
    if (!itinerary || !itineraryId) throw new Error(`main: unknown itinerary index ${fixture.itineraryIndex}`);
    const agencyId = agencyIds.get(itinerary.agencySlug);
    const userId = ownerUserIds.get(itinerary.agencySlug);
    if (!agencyId || !userId) throw new Error(`main: unknown agency slug "${itinerary.agencySlug}"`);
    const caller = callerFor(container, sessionFor(agencyId, userId));
    const { listingId, created } = await ensureListing(caller, itineraryId, fixture);
    listingIds.push(listingId);
    console.log(`seed-demo: listing "${fixture.title}" — ${created ? "LISTED" : "already_listed, skipping"}`);
  }

  for (const fixture of LICENSES) {
    const listingId = listingIds[fixture.listingIndex];
    if (!listingId) throw new Error(`main: unknown listing index ${fixture.listingIndex}`);
    const resellerAgencyId = agencyIds.get(fixture.resellerSlug);
    const resellerUserId = ownerUserIds.get(fixture.resellerSlug);
    if (!resellerAgencyId || !resellerUserId) throw new Error(`main: unknown reseller slug "${fixture.resellerSlug}"`);
    const caller = callerFor(container, sessionFor(resellerAgencyId, resellerUserId));

    const licensed = await ensureLicense(caller, listingId);
    console.log(
      `seed-demo: license (listing ${listingId}, reseller ${fixture.resellerSlug}) — ${licensed ? "LICENSED" : "already_licensed, skipping"}`,
    );
    await ensureRating(caller, listingId, fixture.stars, fixture.comment);
    console.log(`seed-demo: rating (listing ${listingId}, rater ${fixture.resellerSlug}) — RATED ${fixture.stars} stars`);
  }

  console.log(
    `seed-demo: done — ${AGENCIES.length} agencies, ${ITINERARIES.length} itineraries, ${LISTINGS.length} listings, ${LICENSES.length} licenses, ${LICENSES.length} ratings`,
  );
  await handle.close();
}

main().catch((err: unknown) => {
  console.error("seed-demo: FAILED —", err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
