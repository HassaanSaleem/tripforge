// Kitchen Loop iteration-8 T3 Frontier scenario: the traveler at the marketplace.
//
// GOAL.md Deliverable 2.7 promises a traveler can "act on a marketplace
// itinerary — book as-is, or fork/edit it and either request the agent to
// host/book it or self-book it through the platform", and Deliverable 2.2
// promises a consumer "What's Hot" discovery feed. This scenario probes the
// LAST untested client-surface cluster (marketplace x {web,api} x client): can
// a signed-in traveler (an org-less consumer account) discover and act on a
// REAL marketplace listing at all?
//
// The answer today is no — and this script proves it mechanically at the
// API/DB layer, so the gap is a durable regression witness, not just a
// screenshot. It arranges a genuinely-listed, vetted-seller marketplace
// listing, then drives a traveler against every reachable acquisition path.
//
// Findings this witnesses (4-layer L3: real HTTP against the built compose
// image -> parsed responses -> Postgres ground truth -> state-delta asserts):
//   1. TRUST BOUNDARY HOLDS. Every marketplace acquisition procedure is
//      agentProcedure (workspace.marketplace.*). A traveler session is refused
//      FORBIDDEN (INV-024, no agency membership) on browse / license / rate;
//      an anonymous caller is UNAUTHORIZED. No traveler can escalate into the
//      agent trade path.
//   2. THE GAP (marketplace x {web,api} x client). There is NO consumer-facing
//      way to reach the marketplace: no clientView browse/discover/act
//      procedure exists (each returns NOT_FOUND), and the "What's Hot" feed is
//      not even a server capability a traveler can call. The five clientView.*
//      procedures (itinerary/requestHandoff/me/attachTrip/myTrips) cover
//      viewing a SHARED trip and requesting a handoff — never discovering or
//      acquiring a LISTED one.
//   3. STATE CONSERVATION. The whole traveler journey creates zero
//      marketplace_license rows and zero new itineraries — a traveler acquires
//      nothing, forks nothing, books nothing. The listing exists and is
//      non-empty (browsable by its own seller), so the traveler's inability is
//      a gating/capability gap, not an empty marketplace.
//
// Companion live-browser pass (Playwright MCP, this iteration; evidence at
// .kitchenloop/uat-runs/ + iteration-8-report.md) established the web cell:
//   • Signed in as a traveler, /marketplace and /discover both render the
//     agent-only "You need an agency membership to use ..." gate card (the
//     (workspace) WorkspacePageShell guard) — no consumer marketplace/feed.
//   • The traveler home /view signposts "Plan a trip" and "Discover what's hot"
//     as aria-disabled "Coming soon" tiles — the consumer surface advertises
//     the D2.2/D2.3 promises but ships them disabled.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/traveler-marketplace-attempt/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "marketplace", "platform": "api", "user_type": "client", "result": "fail", "iteration": 8, "tier": "T3", "note": "no consumer marketplace API surface exists: browse/license/rate are all agentProcedure and a traveler session is refused FORBIDDEN (INV-024) while anonymous is UNAUTHORIZED; there is NO clientView marketplace/discover/self-book procedure (each NOT_FOUND) and the What's Hot feed is static seed data, not a callable capability — a traveler cannot discover, license, fork, or self-book a listed itinerary (GOAL D2.7/D2.2 gap). State-conserved: zero marketplace_license and zero new itinerary rows from the whole journey" },
//   { "feature": "marketplace", "platform": "web", "user_type": "client", "result": "fail", "iteration": 8, "tier": "T3", "note": "companion live-browser (Playwright MCP) pass: signed in as an org-less traveler, /marketplace and /discover both render the agent-only 'You need an agency membership' WorkspacePageShell gate; the traveler home /view shows 'Plan a trip' and 'Discover what's hot' as aria-disabled 'Coming soon' tiles — the consumer surface has no marketplace browse, no discovery feed, and no path to act on a listed itinerary (GOAL D2.2/D2.7 gap)" }
// ]
// KITCHENLOOP-COVERAGE-END

import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal cookie jar (same shape as traveler-self-book-attempt / golden-path). */
function absorbCookies(jar, res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(jar, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: BASE, // Better Auth CSRF-checks Origin like a real browser sends it
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  absorbCookies(jar, res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML or empty — caller inspects text */
  }
  return { res, json, text };
}

/** tRPC mutation over HTTP (single, non-batched). */
async function trpcMutate(jar, proc, input) {
  const r = await api(jar, "POST", `/api/trpc/${proc}`, input);
  return { ...r, data: r.json?.result?.data ?? null, error: r.json?.error ?? null };
}
/** tRPC query over HTTP (GET, ?input= JSON). */
async function trpcQuery(jar, proc, input) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const r = await api(jar, "GET", `/api/trpc/${proc}${qs}`);
  return { ...r, data: r.json?.result?.data ?? null, error: r.json?.error ?? null };
}
/** tRPC SUBSCRIPTION over HTTP (spec 016, INV-028) — workspace.itinerary.draft
 * streams (SSE) rather than a single JSON mutation response. */
async function trpcSubscribe(jar, proc, input) {
  const url = `${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      origin: BASE,
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    },
  });
  absorbCookies(jar, res);
  const text = await res.text();
  const frames = text
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      let event = null;
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice("event:".length).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
      }
      return { event, data: dataLines.join("\n") };
    });
  const events = frames.filter((f) => f.event === null).map((f) => JSON.parse(f.data));
  const terminal = events.find((e) => e?.type === "result");
  return { res, text, data: terminal?.outcome ?? null };
}
/** The tRPC error CODE (FORBIDDEN / UNAUTHORIZED / NOT_FOUND / ...) for a
 * single non-batched call, wherever tRPC put it in the JSON error envelope. */
function errCode(r) {
  return r.error?.data?.code ?? r.error?.code ?? null;
}
/** Operator-side psql against the compose Postgres. */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "tripforge", "-d", "tripforge", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

const TRIP = {
  destination: "Kyoto",
  checkIn: "2026-11-04",
  checkOut: "2026-11-07",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 240_000, currency: "USD" },
};
const SELLER_TERMS = "White-label license; attribution retained.";
const SELLER_SHARE_BPS = 750;
const LISTING_PRICE_MINOR = 30_000;

function vetAgency(orgId) {
  psql(
    `INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('${orgId}', 'scenario-operator') ON CONFLICT (agency_id) DO NOTHING`,
  );
}

async function main() {
  console.log(`Traveler-at-the-marketplace scenario against ${BASE} (run ${runId})`);

  // ── Arrange: a vetted agent lists a real, non-empty marketplace listing ───
  const agent = new Map();
  const agencyName = `Kyoto Slow Travel ${runId}`;
  await api(agent, "POST", "/api/auth/sign-up/email", {
    email: `agent-${runId}@example.test`,
    password: "mkt-scenario-8",
    name: "Scenario Seller",
  });
  const org = await api(agent, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: `kst-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("arrange: agency created", !!orgId, org.text.slice(0, 200));
  await api(agent, "POST", "/api/auth/organization/set-active", { organizationId: orgId });

  const compare = await trpcSubscribe(agent, "workspace.itinerary.draft", TRIP);
  const options = compare.data?.options ?? [];
  check("arrange: AI drafts budget-fit options", compare.data?.status === "drafted" && options.length > 0, compare.text.slice(0, 200));
  const picked = options.find((o) => o.variant === "balanced") ?? options[0];
  const select = await trpcSubscribe(agent, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: picked?.variant });
  const itineraryId = select.data?.itinerary?.id;
  check("arrange: an itinerary is persisted", select.data?.status === "drafted" && !!itineraryId, select.text.slice(0, 200));

  vetAgency(orgId);
  const listed = await trpcMutate(agent, "workspace.marketplace.createListing", {
    itineraryId,
    title: `Kyoto Slow Travel — 3 nights ${runId}`,
    priceMinor: LISTING_PRICE_MINOR,
    revenueShareBps: SELLER_SHARE_BPS,
    licenseTerms: SELLER_TERMS,
  });
  const listingId = listed.data?.listingId;
  check("arrange: vetted seller lists the itinerary on the marketplace", listed.data?.status === "listed" && !!listingId, listed.text.slice(0, 250));

  // Positive control: the listing IS reachable — its own seller can browse it.
  const sellerBrowse = await trpcQuery(agent, "workspace.marketplace.browseListings", undefined);
  const sellerListings = sellerBrowse.data?.listings ?? [];
  check(
    "arrange: the listing is live and browsable to an agent (a non-empty marketplace exists)",
    Array.isArray(sellerListings) && sellerListings.some((l) => l.listingId === listingId),
    sellerBrowse.text.slice(0, 250),
  );
  const listingsBefore = psql(`SELECT count(*) FROM marketplace_listing`);
  const licensesBefore = psql(`SELECT count(*) FROM marketplace_license`);
  const itinerariesBefore = psql(`SELECT count(*) FROM itinerary`);
  check("arrange: exactly one marketplace listing exists in the DB", Number(listingsBefore) >= 1, `db ${listingsBefore}`);

  // ── The traveler signs up for a consumer account (org-less, spec 030) ─────
  const traveler = new Map();
  const travelerEmail = `traveler-${runId}@example.test`;
  const signUp = await api(traveler, "POST", "/api/auth/sign-up/email", {
    email: travelerEmail,
    password: "traveler-pass-8",
    name: "Yuki Tanaka",
  });
  check("traveler: consumer sign-up succeeds", signUp.res.status === 200, `got ${signUp.res.status}`);
  const travelerUserId = psql(`SELECT id FROM "user" WHERE email = '${travelerEmail}'`);
  check("traveler: an org-less user row exists", !!travelerUserId, travelerUserId);
  check(
    "traveler: the account has NO agency membership (consumer identity, INV-024)",
    psql(`SELECT count(*) FROM member WHERE user_id = '${travelerUserId}'`) === "0",
  );
  // Sanity: the traveler IS authenticated (clientView.me resolves), so the
  // refusals below are authorization (FORBIDDEN), not a missing session.
  const me = await trpcQuery(traveler, "clientView.me", undefined);
  check("traveler: the consumer is a real signed-in identity (clientView.me resolves)", me.error === null && !!me.data, me.text.slice(0, 200));

  // ── GAP A: a traveler cannot BROWSE the marketplace (INV-024 FORBIDDEN) ───
  const travelerBrowse = await trpcQuery(traveler, "workspace.marketplace.browseListings", undefined);
  check(
    "gap: browsing marketplace listings is refused for the traveler (FORBIDDEN, agentProcedure)",
    travelerBrowse.data === null && errCode(travelerBrowse) === "FORBIDDEN",
    `code=${errCode(travelerBrowse)} data=${JSON.stringify(travelerBrowse.data)}`,
  );

  // ── GAP B: a traveler cannot LICENSE / acquire a listed itinerary ─────────
  const travelerLicense = await trpcMutate(traveler, "workspace.marketplace.licenseListing", { listingId });
  check(
    "gap: licensing/acquiring a listing is refused for the traveler (FORBIDDEN, agentProcedure)",
    travelerLicense.data === null && errCode(travelerLicense) === "FORBIDDEN",
    `code=${errCode(travelerLicense)} data=${JSON.stringify(travelerLicense.data)}`,
  );

  // ── GAP C: a traveler cannot RATE a listing either ────────────────────────
  const travelerRate = await trpcMutate(traveler, "workspace.marketplace.rateListing", { listingId, rating: 5 });
  check(
    "gap: rating a listing is refused for the traveler (FORBIDDEN, agentProcedure)",
    travelerRate.data === null && errCode(travelerRate) === "FORBIDDEN",
    `code=${errCode(travelerRate)} data=${JSON.stringify(travelerRate.data)}`,
  );

  // ── GAP D: there is NO consumer marketplace/discover/act procedure at all ─
  // A traveler surface would need its own browse/discover/book path; none of
  // these exist (each is NOT_FOUND — the router has only the five clientView.*).
  for (const [proc, kind] of [
    ["clientView.browseListings", "query"],
    ["clientView.discover", "query"],
    ["clientView.whatsHot", "query"],
    ["clientView.licenseListing", "mutation"],
    ["clientView.book", "mutation"],
  ]) {
    const r = kind === "query"
      ? await trpcQuery(traveler, proc, undefined)
      : await trpcMutate(traveler, proc, { listingId });
    check(
      `gap: no consumer procedure "${proc}" exists (NOT_FOUND — the traveler surface offers no way to act on a listing)`,
      r.data === null && errCode(r) === "NOT_FOUND",
      `code=${errCode(r)} data=${JSON.stringify(r.data)}`,
    );
  }

  // ── GAP E: the trust ladder — anonymous is UNAUTHORIZED, not FORBIDDEN ────
  const anon = new Map();
  const anonBrowse = await trpcQuery(anon, "workspace.marketplace.browseListings", undefined);
  check(
    "gap: an anonymous (no session) caller browsing the marketplace is UNAUTHORIZED",
    anonBrowse.data === null && errCode(anonBrowse) === "UNAUTHORIZED",
    `code=${errCode(anonBrowse)}`,
  );

  // ── State conservation: the traveler acquired / forked / booked NOTHING ───
  const licensesAfter = psql(`SELECT count(*) FROM marketplace_license`);
  const itinerariesAfter = psql(`SELECT count(*) FROM itinerary`);
  check(
    "conservation: zero new marketplace_license rows (the traveler acquired nothing)",
    licensesAfter === licensesBefore,
    `marketplace_license ${licensesBefore} -> ${licensesAfter}`,
  );
  check(
    "conservation: zero new itinerary rows (the traveler forked/copied nothing)",
    itinerariesAfter === itinerariesBefore,
    `itinerary ${itinerariesBefore} -> ${itinerariesAfter}`,
  );

  // ── The ONLY funnel a traveler has needs an agent to share a token first ──
  // (Constitution I demand->agent funnel) — there is no funnel FROM a listing.
  // A traveler holding no share token cannot even reach this listed trip; the
  // handoff path (proven in iteration-7) requires a shared /view token that a
  // marketplace listing never mints for a consumer.
  check(
    "note: the marketplace listing mints no consumer-reachable share token",
    psql(`SELECT count(*) FROM itinerary_share_link WHERE itinerary_id = '${itineraryId}'`) === "0",
    "a listed itinerary has no share link a traveler could open",
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
