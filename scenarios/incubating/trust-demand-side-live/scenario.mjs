// Kitchen Loop iteration-3 scenario (sixth ideate pass; T2 Composition;
// feature trust (primary) x marketplace + booking (arrangement); platforms
// web+api; user_types agent-reseller + client): "Trust From The Demand Side"
// -- closes the last 3 untested trust-dimension coverage cells
// (trust x web x agent-reseller, trust x api x agent-reseller,
// trust x api x client) by proving INV-004/INV-023/INV-024 tenant isolation
// LIVE against the built compose stack, from angles no prior pass walked:
//   - a bystander agency that NEVER transacted with the seller at all, probing
//     itinerary.get / booking.quote / booking.book / marketplace.rateListing /
//     marketplace.deactivateListing on entities it doesn't own;
//   - the legitimate reseller (has a licensed COPY) still cannot itinerary.get
//     the seller's ORIGINAL (a prior pass only proved .quote() NOT_FOUND);
//   - an IDOR row-substitution probe: the reseller's own valid quote-row id
//     mixed with a leaked/guessed SELLER quote-row id in the SAME book() call;
//   - anonymous (no session) hitting the FULL agent-gated surface, not just
//     workspace.whoami;
//   - a traveler session (signed up, never created/joined an org) hitting the
//     same surface live end-to-end (today only unit-mocked in rbac.test.ts).
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, STATE-DELTA assertions against compose Postgres proving no
// cross-tenant read or write ever lands (rating count, listing status,
// booking_component rows on the seller's own tenant all unchanged).
//
// Codex feasibility check: REDIRECT -- workspace.itinerary.update does not
// exist in the current router, so the originally-proposed "cross-tenant
// update probe" was dropped; redirected to the procedures that DO exist
// (itinerary.get, booking.quote, booking.book, marketplace.rateListing,
// marketplace.deactivateListing), which still proves the tenant-isolation
// story end-to-end and is new versus the five prior ideate passes this
// iteration (none walked a negative-path/demand-side trust scenario).
//
// Operator-side arrangement: marketplace vetting is a platform-operator action
// (spec 011 research D10) -- like tests/e2e/support.ts, the script performs
// the operator's half directly against compose Postgres.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/trust-demand-side-live/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "trust", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 3, "tier": "T2", "note": "live browser (companion pass, evidence .kitchenloop/evidence/iter-3-ideate-f/): reseller seat walked live" },
//   { "feature": "trust", "platform": "api", "user_type": "agent-reseller", "result": "pass", "iteration": 3, "tier": "T2", "note": "legitimate reseller with a licensed copy still cannot itinerary.get the seller's original; IDOR row-substitution probe refused" },
//   { "feature": "trust", "platform": "api", "user_type": "client", "result": "pass", "iteration": 3, "tier": "T2", "note": "anonymous/traveler session hitting the full agent-gated surface -- refused live end-to-end" }
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

/** Minimal cookie jar (same shape as agent-onboarding-live). */
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
  return { ...r, data: r.json?.result?.data ?? null };
}
/** tRPC SUBSCRIPTION over HTTP (spec 016, INV-028) — workspace.itinerary.draft
 * streams (SSE) rather than a single JSON mutation response; this drains the
 * stream to its terminal result event, in the SAME { data } shape trpcMutate
 * returns, so every downstream `.data...` read below needs no further change. */
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
  const errorFrame = frames.find((f) => f.event === "serialized-error");
  return {
    res,
    text,
    data: terminal?.outcome ?? null,
    error: errorFrame ? JSON.parse(errorFrame.data) : null,
  };
}
/** tRPC query over HTTP (GET, ?input= JSON). */
async function trpcQuery(jar, proc, input) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const r = await api(jar, "GET", `/api/trpc/${proc}${qs}`);
  return { ...r, data: r.json?.result?.data ?? null };
}
/** True if the response is the exact HTTP status + tRPC error code pair. */
function isCode(r, httpStatus, code) {
  return r.res.status === httpStatus && r.json?.error?.data?.code === code;
}

/** Operator-side psql against the compose Postgres (support.ts arrangement).
 * execFileSync + argument array: no shell, so SQL text needs no escaping. */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "tripforge", "-d", "tripforge", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}
function vetAgency(orgId) {
  psql(
    `INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('${orgId}', 'scenario-operator') ON CONFLICT (agency_id) DO NOTHING`,
  );
}

async function onboardAgent(label, agencyName) {
  const jar = new Map();
  const signUp = await api(jar, "POST", "/api/auth/sign-up/email", {
    email: `${label}-${runId}@example.test`,
    password: "trust-demand-side-pass-9",
    name: `Scenario ${label}`,
  });
  check(`[${label}] sign-up succeeds`, signUp.res.status === 200, `got ${signUp.res.status}`);
  const org = await api(jar, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: `${label}-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check(`[${label}] agency created`, !!orgId, org.text.slice(0, 200));
  await api(jar, "POST", "/api/auth/organization/set-active", { organizationId: orgId });
  return { jar, orgId };
}

const TRIP = {
  destination: "Prague",
  checkIn: "2026-10-05",
  checkOut: "2026-10-08",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 90_000, currency: "USD" },
};

async function main() {
  console.log(`Trust-from-the-demand-side scenario against ${BASE} (run ${runId})`);

  // ── Arrange a real first-sale trade: seller lists, reseller licenses ─────
  const seller = await onboardAgent("seller", `Karlin Seller ${runId}`);
  const draft = await trpcSubscribe(seller.jar, "workspace.itinerary.draft", TRIP);
  const itineraryId = draft.data?.itinerary?.id;
  check(
    "seller: AI draft persists an itinerary",
    draft.data?.status === "drafted" && !!itineraryId,
    draft.text.slice(0, 300),
  );

  const sellerQuote = await trpcMutate(seller.jar, "workspace.booking.quote", { itineraryId, markupBps: 1500 });
  const sellerHeld = (sellerQuote.data?.items ?? []).filter((i) => i.outcome === "held").map((i) => i.quote);
  check("seller: quote holds at least one component", sellerHeld.length > 0, sellerQuote.text.slice(0, 300));
  // A "leaked/guessed" seller quote-row id — the IDOR probe below assumes an
  // attacker somehow obtained this (e.g. a future logging/analytics leak); the
  // point of the probe is that possessing it must still be worthless.
  const sellerForeignQuoteRowId = sellerHeld[0]?.quoteRowId;

  vetAgency(seller.orgId);
  const listingInput = {
    itineraryId,
    title: `Prague weekender ${runId}`,
    priceMinor: 40_000,
    licenseTerms: "White-label permitted; keep attribution lineage.",
    revenueShareBps: 800,
  };
  const listed = await trpcMutate(seller.jar, "workspace.marketplace.createListing", listingInput);
  const listingId = listed.data?.listingId;
  check("seller: vetted listing goes live", listed.data?.status === "listed" && !!listingId, listed.text.slice(0, 200));

  const reseller = await onboardAgent("reseller", `Vltava Reseller ${runId}`);
  vetAgency(reseller.orgId);
  const license = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  const copyItineraryId = license.data?.copyItineraryId;
  check(
    "reseller: license succeeds",
    license.data?.status === "licensed" && !!copyItineraryId,
    license.text.slice(0, 200),
  );

  // ── Bystander agency: never transacted with the seller at all ───────────
  const nosy = await onboardAgent("nosy", `Nosy Co ${runId}`);

  const nosyGet = await trpcQuery(nosy.jar, "workspace.itinerary.get", { itineraryId });
  check(
    "nosy (uninvolved bystander): itinerary.get on the seller's original is NOT_FOUND (no existence oracle)",
    isCode(nosyGet, 404, "NOT_FOUND"),
    `status ${nosyGet.res.status} code ${nosyGet.json?.error?.data?.code}`,
  );

  const nosyQuote = await trpcMutate(nosy.jar, "workspace.booking.quote", { itineraryId });
  check(
    "nosy: booking.quote on the seller's original is NOT_FOUND",
    isCode(nosyQuote, 404, "NOT_FOUND"),
    `status ${nosyQuote.res.status}`,
  );

  const nosyBook = await trpcMutate(nosy.jar, "workspace.booking.book", {
    itineraryId,
    quoteRowIds: ["00000000-0000-4000-8000-000000000000"],
  });
  check(
    "nosy: booking.book on the seller's original is NOT_FOUND (itinerary-level gate fires before any row lookup)",
    isCode(nosyBook, 404, "NOT_FOUND"),
    `status ${nosyBook.res.status}`,
  );

  const ratingsBefore = psql(`SELECT count(*) FROM listing_rating WHERE listing_id = '${listingId}'`);
  const nosyRate = await trpcMutate(nosy.jar, "workspace.marketplace.rateListing", { listingId, stars: 5 });
  check(
    "nosy: rating a real listing it never licensed is refused typed not_licensee (a business value, not an error — no existence leak)",
    nosyRate.res.status === 200 && nosyRate.data?.status === "not_licensee",
    nosyRate.text.slice(0, 200),
  );
  const ratingsAfter = psql(`SELECT count(*) FROM listing_rating WHERE listing_id = '${listingId}'`);
  check("nosy: the refused rating left no row (state conserved)", ratingsBefore === ratingsAfter, `${ratingsBefore} -> ${ratingsAfter}`);

  const statusBefore = psql(`SELECT status FROM marketplace_listing WHERE id = '${listingId}'`);
  const nosyDeactivate = await trpcMutate(nosy.jar, "workspace.marketplace.deactivateListing", { listingId });
  check(
    "nosy: deactivating a listing it doesn't own is NOT_FOUND (scoped by sellerAgencyId, not just listingId)",
    isCode(nosyDeactivate, 404, "NOT_FOUND"),
    `status ${nosyDeactivate.res.status}`,
  );
  const statusAfter = psql(`SELECT status FROM marketplace_listing WHERE id = '${listingId}'`);
  check(
    "nosy: the listing stays active — the refused deactivate had zero side effect",
    statusBefore === "active" && statusAfter === "active",
    `${statusBefore} -> ${statusAfter}`,
  );

  // ── Reseller (legitimate licensee of the COPY): still cannot reach the
  //    seller's ORIGINAL by itinerary.get (a prior pass only proved
  //    .quote() NOT_FOUND on the original — .get() is untested until now) ──
  const resellerGetOriginal = await trpcQuery(reseller.jar, "workspace.itinerary.get", { itineraryId });
  check(
    "reseller (legit licensee of the COPY): itinerary.get on the seller's ORIGINAL is NOT_FOUND",
    isCode(resellerGetOriginal, 404, "NOT_FOUND"),
    `status ${resellerGetOriginal.res.status}`,
  );

  // ── IDOR row-substitution: the reseller's own valid quote-row id mixed
  //    with a leaked/guessed SELLER quote-row id in the SAME book() call ───
  const resellerQuote = await trpcMutate(reseller.jar, "workspace.booking.quote", {
    itineraryId: copyItineraryId,
    markupBps: 2000,
  });
  const resellerHeld = (resellerQuote.data?.items ?? []).filter((i) => i.outcome === "held").map((i) => i.quote);
  check("reseller: quotes their own licensed copy successfully", resellerHeld.length > 0, resellerQuote.text.slice(0, 300));
  const ownRowId = resellerHeld[0]?.quoteRowId;

  const componentsBefore = psql(
    `SELECT count(*) FROM booking_component WHERE agency_id = '${seller.orgId}' AND itinerary_id = '${itineraryId}'`,
  );
  const mixedBook = await trpcMutate(reseller.jar, "workspace.booking.book", {
    itineraryId: copyItineraryId,
    quoteRowIds: [ownRowId, sellerForeignQuoteRowId],
  });
  const ownOutcome = (mixedBook.data?.components ?? []).find((c) => c.quoteRowId === ownRowId);
  const foreignOutcome = (mixedBook.data?.components ?? []).find((c) => c.quoteRowId === sellerForeignQuoteRowId);
  check(
    "reseller: own quote-row books CONFIRMED; the foreign (seller's) quote-row fails unknown_quote — the SAME reason a bogus id would get (no existence oracle, row-level tenant scoping not just itinerary-level)",
    mixedBook.data?.status === "partially_confirmed" &&
      ownOutcome?.outcome === "confirmed" &&
      foreignOutcome?.outcome === "failed" &&
      foreignOutcome?.reason === "unknown_quote",
    JSON.stringify(mixedBook.data),
  );
  const componentsAfter = psql(
    `SELECT count(*) FROM booking_component WHERE agency_id = '${seller.orgId}' AND itinerary_id = '${itineraryId}'`,
  );
  check(
    "reseller: the foreign quote-row produced ZERO booking_component rows on the seller's tenant (money-write path immune to the substitution)",
    componentsBefore === componentsAfter,
    `${componentsBefore} -> ${componentsAfter}`,
  );

  // ── Anonymous (no session at all): the FULL agent-gated surface, not just
  //    workspace.whoami (client × api, live) ───────────────────────────────
  const anon = new Map();
  const anonWhoami = await trpcQuery(anon, "workspace.whoami");
  check("anonymous: workspace.whoami is UNAUTHORIZED", isCode(anonWhoami, 401, "UNAUTHORIZED"), `status ${anonWhoami.res.status}`);
  const anonList = await trpcQuery(anon, "workspace.itinerary.list");
  check(
    "anonymous: workspace.itinerary.list is UNAUTHORIZED",
    isCode(anonList, 401, "UNAUTHORIZED"),
    `status ${anonList.res.status}`,
  );
  const anonBrowse = await trpcQuery(anon, "workspace.marketplace.browseListings");
  check(
    "anonymous: workspace.marketplace.browseListings is UNAUTHORIZED",
    isCode(anonBrowse, 401, "UNAUTHORIZED"),
    `status ${anonBrowse.res.status}`,
  );
  const anonQuote = await trpcMutate(anon, "workspace.booking.quote", { itineraryId });
  check(
    "anonymous: workspace.booking.quote is UNAUTHORIZED (auth gate fires before any tenant lookup)",
    isCode(anonQuote, 401, "UNAUTHORIZED"),
    `status ${anonQuote.res.status}`,
  );

  // ── Traveler (signed up, never created/joined an org): FORBIDDEN, not
  //    UNAUTHORIZED — proven LIVE end-to-end (today only unit-mocked) ──────
  // FRICTION-1 (discovered running this scenario): Better Auth's default
  // production rate limit special-cases /sign-up, /sign-in, /change-password,
  // /change-email at window=10s, max=3, keyed by (ip, path-category) — this
  // is the FOURTH sign-up from this script's IP, so without spacing it out it
  // gets a bare 429 text/plain (no JSON body, just an x-retry-after header).
  // Wait out the window rather than mask the finding with a workaround.
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  const travelerJar = new Map();
  const travelerSignUp = await api(travelerJar, "POST", "/api/auth/sign-up/email", {
    email: `traveler-${runId}@example.test`,
    password: "trust-demand-side-pass-9",
    name: `Traveler ${runId}`,
  });
  check(
    "traveler: sign-up succeeds (no organization ever created)",
    travelerSignUp.res.status === 200,
    `got ${travelerSignUp.res.status}`,
  );

  const travWhoami = await trpcQuery(travelerJar, "workspace.whoami");
  check(
    "traveler (real session, no agency): workspace.whoami is FORBIDDEN live (not just unit-mocked)",
    isCode(travWhoami, 403, "FORBIDDEN"),
    `status ${travWhoami.res.status} code ${travWhoami.json?.error?.data?.code}`,
  );
  const travList = await trpcQuery(travelerJar, "workspace.itinerary.list");
  check("traveler: workspace.itinerary.list is FORBIDDEN live", isCode(travList, 403, "FORBIDDEN"), `status ${travList.res.status}`);
  const travBrowse = await trpcQuery(travelerJar, "workspace.marketplace.browseListings");
  check(
    "traveler: workspace.marketplace.browseListings is FORBIDDEN live",
    isCode(travBrowse, 403, "FORBIDDEN"),
    `status ${travBrowse.res.status}`,
  );

  console.log(failures === 0 ? "\nTrust-from-the-demand-side scenario PASSED." : `\n${failures} failing check(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
