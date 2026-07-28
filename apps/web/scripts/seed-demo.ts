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
  clientTripLink,
  consumerPlanRequest,
  eq,
  itinerary,
  itineraryShareLink,
  marketplaceFork,
  member,
  organization,
  travelerGroup,
  travelerGroupMember,
  travelerGroupMessage,
  travelerMembership,
  tripHandoffRequest,
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

interface GroupDepartureFixture {
  itineraryIndex: number; // index into ITINERARIES
  capacity: number;
  pricePerSeatMinor: number;
  /** If set, this agency joins one seat right after posting (spec 021 US2), so at least one card shows "X of N seats left". */
  joinerAgencySlug?: string;
  joinerTravelerName?: string;
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

// 3 departures across 3 distinct posting agencies (demo-polish-seed-group-and-booking):
// /group-travel's cross-tenant browse shows a populated grid instead of the
// empty state, and one seat is joined so a card shows "X of N seats left".
const GROUP_DEPARTURES: GroupDepartureFixture[] = [
  {
    itineraryIndex: 1, // demo-azure-travel-co — Tokyo balanced trip
    capacity: 12,
    pricePerSeatMinor: 139_900,
    joinerAgencySlug: "demo-lisbon-and-co",
    joinerTravelerName: "Marta Oliveira",
  },
  {
    itineraryIndex: 4, // demo-kaido-journeys — Tokyo balanced trip
    capacity: 8,
    pricePerSeatMinor: 159_500,
  },
  {
    itineraryIndex: 6, // demo-meridian-dmc — Reykjavik balanced trip
    capacity: 10,
    pricePerSeatMinor: 189_000,
  },
];

const DEMO_MEDIA = {
  url: "https://images.unsplash.com/photo-1548707309-dcebeab9ea9b?q=80&w=1200&auto=format&fit=crop",
  alt: "A narrow street in Lisbon's Alfama neighborhood",
  attribution: "Photo by Claudio Schwarz on Unsplash",
};

// ─── Traveler (consumer surface) fixtures ────────────────────────────────────
//
// So the consumer surface (/view/*) shows a populated product too, not just the
// agent side. Travelers are ORG-LESS Better Auth users (INV-024: no organization/
// member/agency_vetting rows). Their side records are the same "bolt-on metadata"
// family the agent seed treats as operator-class direct inserts: traveler_membership
// (spec 040 eligibility), client_trip_link (spec 031 My Trips), consumer_plan_request
// (spec 038 request-an-agent lead), traveler_group{,_member,_message} (spec 040 group
// trips). The marketplace fork (spec 041) alone reuses the REAL clientView.marketplace.
// fork tRPC path (it re-validates the copy via parseItinerary and writes the seller-
// owned copy itinerary + share link + client_trip_link + provenance row in one tx).

interface TravelerFixture {
  slug: string;
  name: string;
  email: string;
  /** premium ⇒ a premium + identity-verified traveler_membership row (eligible for
   * group trips); standard travelers get NO row (the service's default state). */
  premium: boolean;
}

const TRAVELERS: TravelerFixture[] = [
  { slug: "amelia-rivera", name: "Amelia Rivera", email: "traveler-amelia@demo.test", premium: true },
  { slug: "omar-haddad", name: "Omar Haddad", email: "traveler-omar@demo.test", premium: true },
  { slug: "yuki-tanaka", name: "Yuki Tanaka", email: "traveler-yuki@demo.test", premium: true },
  { slug: "lena-novak", name: "Lena Novak", email: "traveler-lena@demo.test", premium: false },
  { slug: "carlos-mendes", name: "Carlos Mendes", email: "traveler-carlos@demo.test", premium: false },
];

interface TripViewFixture {
  travelerSlug: string;
  itineraryIndex: number; // index into ITINERARIES
}

// "My Trips" entries (source 'view') — attach travelers to EXISTING seeded
// itineraries so the traveler's My Trips list is populated. (Group members also
// get source 'group' links, and the fork gets a source 'fork' link, below.)
const TRAVELER_TRIP_VIEWS: TripViewFixture[] = [
  { travelerSlug: "amelia-rivera", itineraryIndex: 0 }, // Lisbon (Azure)
  { travelerSlug: "omar-haddad", itineraryIndex: 2 }, // Marrakech (Meridian)
  { travelerSlug: "yuki-tanaka", itineraryIndex: 4 }, // Tokyo (Kaido)
  { travelerSlug: "lena-novak", itineraryIndex: 5 }, // Reykjavik (Nordlight)
  { travelerSlug: "carlos-mendes", itineraryIndex: 0 }, // Lisbon (Azure)
];

interface PlanRequestFixture {
  travelerSlug: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  budgetAmountMinor: number;
  budgetMode: "hardCap" | "target";
  variant: "budgetSavvy" | "balanced" | "premium";
  optionTitle: string;
  notes?: string;
}

// 3 request-an-agent leads (status 'new') — durable, agency-less consumer demand
// carried into the network (Constitution I). Each ties to a traveler's own budget.
const PLAN_REQUESTS: PlanRequestFixture[] = [
  {
    travelerSlug: "amelia-rivera",
    destination: "Barcelona",
    checkIn: "2026-09-05",
    checkOut: "2026-09-12",
    adults: 2,
    children: 0,
    budgetAmountMinor: 400_000, // $4,000
    budgetMode: "hardCap",
    variant: "balanced",
    optionTitle: "Barcelona balanced trip",
    notes: "Anniversary trip — would love a food-focused itinerary.",
  },
  {
    travelerSlug: "omar-haddad",
    destination: "Dubai",
    checkIn: "2026-10-01",
    checkOut: "2026-10-06",
    adults: 2,
    children: 2,
    budgetAmountMinor: 600_000, // $6,000
    budgetMode: "target",
    variant: "premium",
    optionTitle: "Dubai premium trip",
    notes: "Family of four; two kids under 10.",
  },
  {
    travelerSlug: "lena-novak",
    destination: "Rome",
    checkIn: "2026-11-12",
    checkOut: "2026-11-18",
    adults: 1,
    children: 0,
    budgetAmountMinor: 300_000, // $3,000
    budgetMode: "hardCap",
    variant: "budgetSavvy",
    optionTitle: "Rome budget-savvy trip",
  },
];

interface GroupMemberFixture {
  travelerSlug: string;
  role: "organizer" | "member";
  confirmed: boolean;
}
interface GroupMessageFixture {
  senderSlug: string;
  body: string;
}
interface GroupFixture {
  itineraryIndex: number; // index into ITINERARIES (the trip the group forms around)
  title: string;
  status: "forming" | "finalized";
  /** members[0] is the organizer. Every member is drawn from the premium+verified
   * set (the eligibility gate the real join path enforces). A finalized group MUST
   * have all members confirmed (the all-party finalize gate, spec 040 FR-008). */
  members: GroupMemberFixture[];
  messages: GroupMessageFixture[];
}

// 2 traveler groups: one 'forming' (a member still pending, so finalize is blocked)
// and one 'finalized' (all members confirmed) — around existing seeded itineraries.
const TRAVELER_GROUPS: GroupFixture[] = [
  {
    itineraryIndex: 1, // Tokyo (Azure)
    title: "Tokyo crew — autumn 2026",
    status: "forming",
    members: [
      { travelerSlug: "amelia-rivera", role: "organizer", confirmed: true },
      { travelerSlug: "yuki-tanaka", role: "member", confirmed: true },
      { travelerSlug: "omar-haddad", role: "member", confirmed: false },
    ],
    messages: [
      { senderSlug: "amelia-rivera", body: "Hey team! Started our Tokyo group — take a look at the trip and confirm when you're in." },
      { senderSlug: "yuki-tanaka", body: "Looks amazing, I'm confirmed!" },
      { senderSlug: "omar-haddad", body: "So excited — I'll confirm as soon as my dates are locked." },
    ],
  },
  {
    itineraryIndex: 5, // Reykjavik (Nordlight)
    title: "Reykjavik aurora squad",
    status: "finalized",
    members: [
      { travelerSlug: "yuki-tanaka", role: "organizer", confirmed: true },
      { travelerSlug: "omar-haddad", role: "member", confirmed: true },
    ],
    messages: [
      { senderSlug: "yuki-tanaka", body: "Everyone's confirmed — finalizing our aurora trip!" },
      { senderSlug: "omar-haddad", body: "Perfect, can't wait for the Northern Lights." },
    ],
  },
];

interface TravelerForkFixture {
  travelerSlug: string;
  listingIndex: number; // index into LISTINGS
}

// 1 traveler fork of an existing marketplace listing (the Lisbon Getaway, sold by
// Azure) — reuses the real fork tRPC path so the copy is seller-owned + re-validated.
const TRAVELER_FORK: TravelerForkFixture = { travelerSlug: "carlos-mendes", listingIndex: 0 };

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

/**
 * `postGroupDeparture` always inserts a new row (research D1: no uniqueness
 * constraint) — idempotency here is the seed script's own responsibility, so
 * this is gated on a read-first check: the poster's own active departures
 * (`mine`) for the itinerary's predicted title, the same idempotency-key
 * pattern `ensureSeededItinerary` already uses for drafts.
 */
async function ensureGroupDeparture(
  caller: AppCaller,
  itineraryId: string,
  predictedTitle: string,
  input: { departureDate: string; capacity: number; pricePerSeatMinor: number },
): Promise<{ departureId: string; created: boolean }> {
  const { departures } = await caller.workspace.groupTravel.browse();
  const existing = departures.find((d) => d.mine && d.itineraryTitle === predictedTitle);
  if (existing) return { departureId: existing.departureId, created: false };

  const result = await caller.workspace.groupTravel.post({ itineraryId, ...input });
  if (result.status !== "posted") {
    throw new Error(`ensureGroupDeparture: post failed for "${predictedTitle}" — ${result.status}`);
  }
  return { departureId: result.departureId, created: true };
}

/**
 * Joins exactly one seat, once — idempotency reads the departure's LIVE
 * seatsRemaining (no separate "did we already join" query exists), so a
 * re-run correctly skips once any seat has been claimed.
 */
async function ensureSeatJoined(
  caller: AppCaller,
  departureId: string,
  capacity: number,
  travelerName: string,
): Promise<boolean> {
  const { departures } = await caller.workspace.groupTravel.browse();
  const departure = departures.find((d) => d.departureId === departureId);
  if (!departure) throw new Error(`ensureSeatJoined: departure ${departureId} not found in browse`);
  if (departure.seatsRemaining < capacity) return false;

  const result = await caller.workspace.groupTravel.join({ departureId, travelerName });
  if (result.status !== "joined") {
    throw new Error(`ensureSeatJoined: join failed for departure ${departureId} — ${result.status}`);
  }
  return true;
}

/**
 * Completes the real quote->book flow (the same audited money path
 * l3-booking.test.ts exercises) on an already-drafted itinerary, so the
 * agency's dashboard GBV stat has a real booked trip behind it. Idempotent:
 * `itinerary.get` already projects booking history (research D-seed-0026).
 */
async function ensureBooking(caller: AppCaller, itineraryId: string): Promise<{ created: boolean }> {
  const overview = await caller.workspace.itinerary.get({ itineraryId });
  if (overview.status !== "found") {
    throw new Error(`ensureBooking: itinerary ${itineraryId} not found`);
  }
  if (overview.bookings.length > 0) return { created: false };

  const quoted = await caller.workspace.booking.quote({ itineraryId, markupBps: 1500 });
  if (quoted.status !== "quoted") {
    throw new Error(`ensureBooking: quote failed for itinerary ${itineraryId}`);
  }
  const quoteRowIds = quoted.items.flatMap((item) => (item.outcome === "held" ? [item.quote.quoteRowId] : []));
  if (quoteRowIds.length === 0) {
    throw new Error(`ensureBooking: no held quotes for itinerary ${itineraryId}`);
  }

  const booked = await caller.workspace.booking.book({ itineraryId, quoteRowIds });
  if (booked.status === "failed") {
    throw new Error(`ensureBooking: book failed for itinerary ${itineraryId}`);
  }
  return { created: true };
}

// ─── Traveler-side flows (org-less; direct inserts mirror the clientView
// services, the same operator-class direct-insert class the identity scaffolding
// uses; the marketplace fork alone rides the real tRPC path) ─────────────────

/** A traveler caller: a session with a userId but NO agency (INV-024) — the only
 * thing `protectedProcedure`/clientView.* require. */
function travelerCallerFor(container: Container, userId: string): AppCaller {
  return createAppCaller(createContext({ session: { userId }, container }));
}

/**
 * Upserts a premium + identity-verified `traveler_membership` (mirrors the
 * verifyMembership service — idempotent on the user_id PK). Standard travelers
 * get NO row: absence IS the default `standard`/ineligible state the service reads.
 */
async function ensureTravelerMembership(db: Db, userId: string, premium: boolean): Promise<void> {
  if (!premium) return;
  const now = new Date();
  await db
    .insert(travelerMembership)
    .values({ userId, tier: "premium", identityVerified: true, verifiedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: travelerMembership.userId,
      set: { tier: "premium", identityVerified: true, verifiedAt: now, updatedAt: now },
    });
}

/** Attaches a traveler to a trip's My Trips (client_trip_link) — the same
 * idempotent "attach on view" record spec 031's attachTraveler writes; the
 * UNIQUE(user_id, itinerary_id) index is the arbiter (a traveler already linked
 * via a group/fork keeps that link — onConflictDoNothing). */
async function ensureClientTripLink(db: Db, userId: string, itineraryId: string, source: string): Promise<boolean> {
  // My Trips (listTravelerTrips) INNER-joins client_trip_link → itinerary_share_link,
  // so a linked trip only surfaces if its itinerary has a share link — the real
  // "agent shares a trip, traveler opens it" flow always mints one. Seed it too.
  const shareRows = await db.select({ agencyId: itinerary.agencyId }).from(itinerary).where(eq(itinerary.id, itineraryId)).limit(1);
  if (shareRows[0]?.agencyId) {
    await db
      .insert(itineraryShareLink)
      .values({ agencyId: shareRows[0].agencyId, itineraryId })
      .onConflictDoNothing({ target: itineraryShareLink.itineraryId });
  }
  const result = await db
    .insert(clientTripLink)
    .values({ userId, itineraryId, source })
    .onConflictDoNothing({ target: [clientTripLink.userId, clientTripLink.itineraryId] });
  return (result.rowCount ?? 0) > 0;
}

/** Inserts a trip_handoff_request (mirrors clientView.requestHandoff), directed
 * to the itinerary's OWNING agency — this is what populates the agent
 * "Trip Requests" inbox. Idempotent read-first on (agency, itinerary, contactName). */
async function ensureTripHandoff(
  db: Db,
  itineraryId: string,
  contactName: string,
  contactEmail: string,
  notes: string,
): Promise<boolean> {
  const itin = await db.select({ agencyId: itinerary.agencyId }).from(itinerary).where(eq(itinerary.id, itineraryId)).limit(1);
  const agencyId = itin[0]?.agencyId;
  if (!agencyId) return false;
  const existing = await db
    .select({ id: tripHandoffRequest.id })
    .from(tripHandoffRequest)
    .where(
      and(
        eq(tripHandoffRequest.agencyId, agencyId),
        eq(tripHandoffRequest.itineraryId, itineraryId),
        eq(tripHandoffRequest.contactName, contactName),
      ),
    )
    .limit(1);
  if (existing[0]) return false;
  await db.insert(tripHandoffRequest).values({ itineraryId, agencyId, contactName, contactEmail, notes, status: "new" });
  return true;
}

/**
 * Inserts one consumer plan request (mirrors submitConsumerPlanRequest). No
 * natural unique key exists, so idempotency is a read-first guard on
 * (traveler, destination) — the same idempotency-key pattern ensureSeededItinerary
 * and ensureGroupDeparture already use.
 */
async function ensurePlanRequest(
  db: Db,
  travelerUserId: string,
  contactName: string,
  contactEmail: string,
  fixture: PlanRequestFixture,
): Promise<boolean> {
  const existing = await db
    .select({ id: consumerPlanRequest.id })
    .from(consumerPlanRequest)
    .where(
      and(
        eq(consumerPlanRequest.travelerUserId, travelerUserId),
        eq(consumerPlanRequest.destination, fixture.destination),
      ),
    )
    .limit(1);
  if (existing[0]) return false;

  await db.insert(consumerPlanRequest).values({
    travelerUserId,
    destination: fixture.destination,
    checkIn: fixture.checkIn,
    checkOut: fixture.checkOut,
    adults: fixture.adults,
    children: fixture.children,
    budgetAmountMinor: fixture.budgetAmountMinor,
    budgetCurrency: "USD",
    budgetMode: fixture.budgetMode,
    variant: fixture.variant,
    optionTitle: fixture.optionTitle,
    contactName,
    contactEmail,
    notes: fixture.notes ?? null,
    status: "new",
  });
  return true;
}

/**
 * Creates one traveler group with its members, My-Trips links, and chat messages
 * in one tx — mirroring createGroup + joinGroup + confirm + finalize + postMessage.
 * traveler_group has no natural unique key, so idempotency is a read-first guard on
 * (organizer, itinerary, title). A 'finalized' fixture's members are all confirmed
 * (the all-party finalize gate); a 'forming' group is left joinable.
 */
async function ensureTravelerGroup(
  db: Db,
  itineraryId: string,
  travelerUserIds: Map<string, string>,
  fixture: GroupFixture,
): Promise<boolean> {
  const resolve = (slug: string): string => {
    const id = travelerUserIds.get(slug);
    if (!id) throw new Error(`ensureTravelerGroup: unknown traveler slug "${slug}"`);
    return id;
  };
  const organizerFixture = fixture.members.find((m) => m.role === "organizer");
  if (!organizerFixture) throw new Error(`ensureTravelerGroup: "${fixture.title}" has no organizer`);
  const organizerUserId = resolve(organizerFixture.travelerSlug);

  const existing = await db
    .select({ id: travelerGroup.id })
    .from(travelerGroup)
    .where(
      and(
        eq(travelerGroup.organizerUserId, organizerUserId),
        eq(travelerGroup.itineraryId, itineraryId),
        eq(travelerGroup.title, fixture.title),
      ),
    )
    .limit(1);
  if (existing[0]) return false;

  const finalized = fixture.status === "finalized";
  await db.transaction(async (tx) => {
    const now = new Date();
    const inserted = await tx
      .insert(travelerGroup)
      .values({
        itineraryId,
        organizerUserId,
        title: fixture.title,
        status: fixture.status,
        joinable: !finalized, // a finalized group is closed to new joiners
        finalizedAt: finalized ? now : null,
      })
      .returning({ id: travelerGroup.id });
    const group = inserted[0];
    if (!group) throw new Error("ensureTravelerGroup: traveler_group insert returned no row");

    for (const m of fixture.members) {
      const memberUserId = resolve(m.travelerSlug);
      await tx
        .insert(travelerGroupMember)
        .values({
          groupId: group.id,
          userId: memberUserId,
          role: m.role,
          confirmationStatus: m.confirmed ? "confirmed" : "pending",
          confirmedAt: m.confirmed ? now : null,
        })
        .onConflictDoNothing({ target: [travelerGroupMember.groupId, travelerGroupMember.userId] });

      // Link the group's trip into each member's My Trips (source 'group'), the
      // same write createGroup/joinGroup do — plus the share link so it surfaces
      // in My Trips (listTravelerTrips inner-joins client_trip_link → share_link).
      const groupShare = await tx.select({ agencyId: itinerary.agencyId }).from(itinerary).where(eq(itinerary.id, itineraryId)).limit(1);
      if (groupShare[0]?.agencyId) {
        await tx
          .insert(itineraryShareLink)
          .values({ agencyId: groupShare[0].agencyId, itineraryId })
          .onConflictDoNothing({ target: itineraryShareLink.itineraryId });
      }
      await tx
        .insert(clientTripLink)
        .values({ userId: memberUserId, itineraryId, source: "group" })
        .onConflictDoNothing({ target: [clientTripLink.userId, clientTripLink.itineraryId] });
    }

    for (const msg of fixture.messages) {
      await tx.insert(travelerGroupMessage).values({
        groupId: group.id,
        senderUserId: resolve(msg.senderSlug),
        body: msg.body,
      });
    }
  });
  return true;
}

/**
 * Forks an active marketplace listing into a traveler's own working copy via the
 * REAL clientView.marketplace.fork path (forkListingForTraveler): it re-validates
 * the copy via parseItinerary and writes the seller-owned copy itinerary + share
 * link + client_trip_link (source 'fork') + marketplace_fork provenance row in one
 * tx. Idempotency is the seed's own read-first guard on (traveler, listing), since
 * the service mints a fresh copy on every call.
 */
async function ensureTravelerFork(
  db: Db,
  container: Container,
  travelerUserId: string,
  listingId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: marketplaceFork.id })
    .from(marketplaceFork)
    .where(and(eq(marketplaceFork.travelerUserId, travelerUserId), eq(marketplaceFork.listingId, listingId)))
    .limit(1);
  if (existing[0]) return false;

  const caller = travelerCallerFor(container, travelerUserId);
  const result = await caller.clientView.marketplace.fork({ listingId });
  if (result.status !== "forked") {
    throw new Error(`ensureTravelerFork: fork failed for listing ${listingId} — ${result.status}`);
  }
  return true;
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

      // A second gallery asset on the same agency's next itinerary, so the agent
      // Media library is not a single row.
      const secondItineraryId = itineraryIds[1];
      if (secondItineraryId && ITINERARIES[1]?.agencySlug === firstAgencySlug) {
        const attached2 = await ensureGalleryMedia(caller, secondItineraryId);
        console.log(`seed-demo: gallery media for itinerary ${secondItineraryId} — ${attached2 ? "attached" : "already present, skipping"}`);
      }

      const { created: booked } = await ensureBooking(caller, firstItineraryId);
      console.log(`seed-demo: booking for itinerary ${firstItineraryId} — ${booked ? "BOOKED" : "already booked, skipping"}`);
    }
  }

  for (const fixture of GROUP_DEPARTURES) {
    const itinerary = ITINERARIES[fixture.itineraryIndex];
    const itineraryId = itineraryIds[fixture.itineraryIndex];
    if (!itinerary || !itineraryId) throw new Error(`main: unknown itinerary index ${fixture.itineraryIndex}`);
    const agencyId = agencyIds.get(itinerary.agencySlug);
    const userId = ownerUserIds.get(itinerary.agencySlug);
    if (!agencyId || !userId) throw new Error(`main: unknown agency slug "${itinerary.agencySlug}"`);
    const caller = callerFor(container, sessionFor(agencyId, userId));

    const predictedTitle = `${itinerary.destination} balanced trip`;
    const { departureId, created } = await ensureGroupDeparture(caller, itineraryId, predictedTitle, {
      departureDate: itinerary.checkIn,
      capacity: fixture.capacity,
      pricePerSeatMinor: fixture.pricePerSeatMinor,
    });
    console.log(
      `seed-demo: group departure "${predictedTitle}" (agency ${itinerary.agencySlug}) — ${created ? "POSTED" : "already posted, skipping"}`,
    );

    if (fixture.joinerAgencySlug && fixture.joinerTravelerName) {
      const joinerAgencyId = agencyIds.get(fixture.joinerAgencySlug);
      const joinerUserId = ownerUserIds.get(fixture.joinerAgencySlug);
      if (!joinerAgencyId || !joinerUserId) {
        throw new Error(`main: unknown joiner agency slug "${fixture.joinerAgencySlug}"`);
      }
      const joinerCaller = callerFor(container, sessionFor(joinerAgencyId, joinerUserId));
      const joined = await ensureSeatJoined(joinerCaller, departureId, fixture.capacity, fixture.joinerTravelerName);
      console.log(`seed-demo: seat join (departure ${departureId}) — ${joined ? "JOINED" : "already joined, skipping"}`);
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

  // ─── Traveler (consumer surface) demo data — org-less users + client-side
  // records so /view/* shows a populated product too (INV-024). ────────────────
  const travelerUserIds = new Map<string, string>();
  for (const traveler of TRAVELERS) {
    const { userId, created } = await ensureDemoUser(db, traveler.email, traveler.name);
    travelerUserIds.set(traveler.slug, userId);
    // Org-less by design: NO ensureMembership/ensureAgency call (INV-024). Only
    // the traveler_membership premium/identity flag, when premium.
    await ensureTravelerMembership(db, userId, traveler.premium);
    console.log(
      `seed-demo: traveler ${traveler.email} / ${DEMO_PASSWORD} — ${created ? "created" : "already exists"} (${traveler.premium ? "premium+verified" : "standard"})`,
    );
  }

  for (const view of TRAVELER_TRIP_VIEWS) {
    const userId = travelerUserIds.get(view.travelerSlug);
    const itineraryId = itineraryIds[view.itineraryIndex];
    if (!userId || !itineraryId) throw new Error(`main: bad trip-view fixture ${view.travelerSlug}/${view.itineraryIndex}`);
    const attached = await ensureClientTripLink(db, userId, itineraryId, "view");
    console.log(
      `seed-demo: my-trips link (${view.travelerSlug} → itinerary ${itineraryId}) — ${attached ? "ATTACHED" : "already linked, skipping"}`,
    );
  }

  for (const fixture of PLAN_REQUESTS) {
    const traveler = TRAVELERS.find((t) => t.slug === fixture.travelerSlug);
    const userId = travelerUserIds.get(fixture.travelerSlug);
    if (!traveler || !userId) throw new Error(`main: unknown plan-request traveler "${fixture.travelerSlug}"`);
    const created = await ensurePlanRequest(db, userId, traveler.name, traveler.email, fixture);
    console.log(
      `seed-demo: consumer plan request (${fixture.travelerSlug} → ${fixture.destination}) — ${created ? "CREATED" : "already exists, skipping"}`,
    );
  }

  for (const fixture of TRAVELER_GROUPS) {
    const itineraryId = itineraryIds[fixture.itineraryIndex];
    if (!itineraryId) throw new Error(`main: unknown group itinerary index ${fixture.itineraryIndex}`);
    const created = await ensureTravelerGroup(db, itineraryId, travelerUserIds, fixture);
    console.log(
      `seed-demo: traveler group "${fixture.title}" (${fixture.status}) — ${created ? "CREATED" : "already exists, skipping"}`,
    );
  }

  const forkTravelerId = travelerUserIds.get(TRAVELER_FORK.travelerSlug);
  const forkListingId = listingIds[TRAVELER_FORK.listingIndex];
  if (!forkTravelerId || !forkListingId) throw new Error("main: bad traveler-fork fixture");
  const forked = await ensureTravelerFork(db, container, forkTravelerId, forkListingId);
  console.log(
    `seed-demo: traveler fork (${TRAVELER_FORK.travelerSlug} → listing ${forkListingId}) — ${forked ? "FORKED" : "already forked, skipping"}`,
  );

  // Backfill: every My-Trips-linked itinerary (view/group/fork) needs a share
  // link to surface in listTravelerTrips — guarantees My Trips is populated even
  // on re-seed, when idempotency guards skip the inline share-link writes.
  const allLinks = await db.select({ itineraryId: clientTripLink.itineraryId }).from(clientTripLink);
  const linkedItineraryIds = [...new Set(allLinks.map((l) => l.itineraryId))];
  for (const itineraryId of linkedItineraryIds) {
    const itin = await db.select({ agencyId: itinerary.agencyId }).from(itinerary).where(eq(itinerary.id, itineraryId)).limit(1);
    if (itin[0]?.agencyId) {
      await db
        .insert(itineraryShareLink)
        .values({ agencyId: itin[0].agencyId, itineraryId })
        .onConflictDoNothing({ target: itineraryShareLink.itineraryId });
    }
  }
  console.log(`seed-demo: backfilled share links for ${linkedItineraryIds.length} My-Trips itineraries`);

  // Agent "Trip Requests" inbox: travelers on shared Azure trips ask an agent to
  // arrange & book (trip_handoff_request → the owning agency).
  const HANDOFFS = [
    { itineraryIndex: 0, contactName: "Amelia Rivera", contactEmail: "traveler-amelia@demo.test", notes: "Could you firm up the hotel and the airport transfer for these dates?" },
    { itineraryIndex: 1, contactName: "Omar Haddad", contactEmail: "traveler-omar@demo.test", notes: "Two of us — please book the full itinerary if the price holds." },
  ];
  for (const h of HANDOFFS) {
    const itineraryId = itineraryIds[h.itineraryIndex];
    if (!itineraryId) throw new Error(`main: bad handoff index ${h.itineraryIndex}`);
    const created = await ensureTripHandoff(db, itineraryId, h.contactName, h.contactEmail, h.notes);
    console.log(`seed-demo: trip handoff request (${h.contactName} → itinerary ${itineraryId}) — ${created ? "CREATED" : "already exists, skipping"}`);
  }

  const premiumTravelers = TRAVELERS.filter((t) => t.premium).length;
  console.log(
    `seed-demo: done — ${AGENCIES.length} agencies, ${ITINERARIES.length} itineraries, ${LISTINGS.length} listings, ${LICENSES.length} licenses, ${LICENSES.length} ratings, ${GROUP_DEPARTURES.length} group departures, 1 booking; ` +
      `${TRAVELERS.length} travelers (${premiumTravelers} premium+verified), ${TRAVELER_TRIP_VIEWS.length} my-trips links, ${PLAN_REQUESTS.length} consumer plan requests, ${TRAVELER_GROUPS.length} traveler groups, 1 traveler fork`,
  );
  await handle.close();
}

main().catch((err: unknown) => {
  console.error("seed-demo: FAILED —", err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
