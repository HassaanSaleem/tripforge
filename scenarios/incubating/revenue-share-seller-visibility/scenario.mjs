// Kitchen Loop iteration-3 scenario (T3 Frontier; feature revenue-share ×
// marketplace arrangement; platforms web+api; user_types agent-seller + client):
// "The seller gets paid — and now IS told." A seller lists a finished trip,
// a reseller licenses it (first sale). The platform records the conserved split
// (revenue_share_ledger, INV-012) and hands the BUYER a receipt — this script
// then walks every read surface the SELLER has and pins the trust boundary:
// the seller's own listing card projects their earnings (licenseCount,
// sellerCreditTotalMinor), scoped so no OTHER agency's browse view ever sees
// them. Finally it proves the traveler side of the same trade is structurally
// free of ALL revenue-share data (fee, split, terms, bps, provenance) on both
// the anonymous clientView payload and the SSR /view page.
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, STATE-DELTA assertions against the platform's own money integers.
//
// SCOPE GUARD: first-sale split only. Resale-split semantics are desk-pending
// (OPERATOR-DESK RESALE-SHARE-SEMANTICS) — nothing here re-lists the copy or
// asserts resale money.
//
// GAP CLOSED (seed-0031 backfill, was open at iteration-3 ideate time): the
// "no earnings key on the listing card" pin from docs/internal/reports/
// iteration-3-report.md (fifth pass) is flipped to a real assertion now that
// seed-0030 (same iteration) landed the licenseCount/sellerCreditTotalMinor
// projection on browseListings. The remaining GAP PIN below (no dedicated
// workspace.marketplace.earnings/.licenses procedure) is still accurate as of
// this backfill — the surface landed by enriching browseListings instead.
//
// Operator-side arrangement: marketplace vetting is a platform-operator action
// (spec 011 research D10) — like tests/e2e/support.ts, the script performs the
// operator's half directly against compose Postgres.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/revenue-share-seller-visibility/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "revenue-share", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 4, "tier": "T3", "note": "seller's own listing card projects licenseCount + sellerCreditTotalMinor conserved from the ledger; other agencies' browse views see null for the same listing (seed-0030 gap closed + re-verified in this backfill)" },
//   { "feature": "revenue-share", "platform": "api", "user_type": "client", "result": "pass", "iteration": 3, "tier": "T3", "note": "anonymous clientView payload + SSR /view page structurally free of ALL revenue-share data (fee, split, terms, bps, provenance)" }
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
    password: "seller-visibility-pass-9",
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

/** Deep key scan: every object key anywhere in the value, lower-cased. */
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) for (const v of value) collectKeys(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k.toLowerCase());
      collectKeys(v, out);
    }
  }
  return out;
}

const TRIP = {
  destination: "Paris",
  checkIn: "2026-09-01",
  checkOut: "2026-09-04",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
};
// 331.00 USD → fixed 10% take splits 33_100 = 3_310 + 29_790: every formatted
// amount ("331.00", "33.10", "297.90") is distinctive against FakeLLM's Paris
// prices, so a text scan that finds one is a real leak, not a collision.
const LICENSE_FEE_MINOR = 33_100;
const SELLER_SHARE_BPS = 750; // deliberately NOT the 1000 default (seed-0009d-b probe)
const SELLER_TERMS = `Attribution lineage preserved ${runId}`;

async function main() {
  console.log(`Revenue-share seller-visibility scenario against ${BASE} (run ${runId})`);

  // ── Arrange: seller drafts and lists a finished trip ─────────────────────
  const sellerAgencyName = `Meridian Seller ${runId}`;
  const seller = await onboardAgent("seller", sellerAgencyName);

  // Spec 019 compare-then-choose: draft RETURNS options (persists nothing);
  // selectDraft persists the chosen one and answers with the itinerary.
  const draftCompare = await trpcSubscribe(seller.jar, "workspace.itinerary.draft", TRIP);
  const draftVariant = (draftCompare.data?.options ?? []).find((o) => o.variant === "balanced")?.variant ?? draftCompare.data?.options?.[0]?.variant ?? "balanced";
  const draft = await trpcSubscribe(seller.jar, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: draftVariant });
  const itineraryId = draft.data?.itinerary?.id;
  check(
    "seller: AI draft persists an itinerary",
    draft.data?.status === "drafted" && !!itineraryId,
    draft.text.slice(0, 300),
  );

  vetAgency(seller.orgId);
  const listingTitle = `Paris weekender ${runId}`;
  const listed = await trpcMutate(seller.jar, "workspace.marketplace.createListing", {
    itineraryId,
    title: listingTitle,
    priceMinor: LICENSE_FEE_MINOR,
    licenseTerms: SELLER_TERMS,
    revenueShareBps: SELLER_SHARE_BPS,
  });
  const listingId = listed.data?.listingId;
  check("seller: vetted listing goes live", listed.data?.status === "listed" && !!listingId, listed.text.slice(0, 200));

  // ── Trade: a vetted reseller licenses it (first sale) ────────────────────
  const reseller = await onboardAgent("reseller", `Nomad Reseller ${runId}`);
  vetAgency(reseller.orgId);
  const license = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  const lic = license.data ?? {};
  check("reseller: license succeeds", lic.status === "licensed" && !!lic.copyItineraryId, license.text.slice(0, 300));
  check(
    "reseller: BUYER-side receipt carries the conserved split (33100 = 3310 + 29790, fixed 10% take)",
    lic.priceMinor === LICENSE_FEE_MINOR && lic.platformTakeMinor === 3_310 && lic.sellerCreditMinor === 29_790 &&
      lic.priceMinor === lic.platformTakeMinor + lic.sellerCreditMinor,
    JSON.stringify(lic),
  );

  // ── What EXISTS: the platform's own record of the seller's earnings ──────
  const ledgerRow = psql(
    `SELECT count(*) || '/' || min(price_minor) || '/' || min(platform_take_minor) || '/' || min(seller_credit_minor) || '/' || min(currency) FROM revenue_share_ledger WHERE seller_agency_id = '${seller.orgId}'`,
  );
  check(
    "platform: revenue_share_ledger holds exactly one conserved row crediting the seller (INV-012)",
    ledgerRow === "1/33100/3310/29790/USD",
    `got ${ledgerRow}`,
  );
  const ledgerBad = psql(
    `SELECT count(*) FROM revenue_share_ledger WHERE seller_agency_id = '${seller.orgId}' AND platform_take_minor + seller_credit_minor <> price_minor`,
  );
  check("platform: ledger conservation identity price = take + credit holds", ledgerBad === "0", `${ledgerBad} violating rows`);
  const pmfSplit = psql(
    `SELECT amount_minor || '/' || price_minor || '/' || seller_credit_minor FROM pmf_event WHERE type = 'take_rate_accrued' AND agency_id = '${seller.orgId}'`,
  );
  check(
    "platform: PMF take_rate_accrued carries the full split for the seller agency (seed-0006b FR-014)",
    pmfSplit === "3310/33100/29790",
    `got ${pmfSplit}`,
  );

  // ── The FRONTIER BOUNDARY: what will the platform TELL the seller? ───────
  // browseListings is the seller's ONLY marketplace read surface (router:
  // createListing/browseListings/deactivateListing/licenseListing/rateListing).
  const browse = await trpcQuery(seller.jar, "workspace.marketplace.browseListings");
  const cards = browse.data?.listings ?? [];
  const mine = cards.find((l) => (l.listingId ?? l.id) === listingId);
  check("seller: own listing visible on the browse surface", !!mine, browse.text.slice(0, 300));
  if (mine) {
    // GAP CLOSED (seed-0030): browseListings now projects the seller's own
    // earnings directly onto their own card — licenseCount + the exact
    // conserved credit sum from revenue_share_ledger (297.90 = 29790 minor,
    // matching the ledger/PMF checks above). Was a GAP PIN asserting the
    // ABSENCE of any such key; flipped to assert the real projection once
    // seed-0030 landed it (same iteration).
    check(
      "seller: own listing card now surfaces licenseCount (1) and sellerCreditTotalMinor (29790), matching the ledger",
      mine.licenseCount === 1 && mine.sellerCreditTotalMinor === 29_790,
      `got licenseCount=${mine.licenseCount} sellerCreditTotalMinor=${mine.sellerCreditTotalMinor}`,
    );
  }
  // Tenant scoping (FR-004): the RESELLER's own browse view must never see
  // earnings for a listing it does not own (null, not the seller's numbers).
  const browseAsReseller = await trpcQuery(reseller.jar, "workspace.marketplace.browseListings");
  const sellerCardForReseller = (browseAsReseller.data?.listings ?? []).find(
    (l) => (l.listingId ?? l.id) === listingId,
  );
  check(
    "reseller: sees the seller's listing but earnings fields are null (not their data)",
    !!sellerCardForReseller && sellerCardForReseller.licenseCount === null && sellerCardForReseller.sellerCreditTotalMinor === null,
    JSON.stringify(sellerCardForReseller),
  );
  // A real user re-submit: the sell form still OFFERS the already-listed
  // itinerary (offer-then-refuse friction, see report), but the platform
  // refuses typed with the EXISTING listing's id and conserves state — the
  // declared terms of the live listing survive the attempt verbatim.
  const dupe = await trpcMutate(seller.jar, "workspace.marketplace.createListing", {
    itineraryId,
    title: `Paris weekender DUPE probe ${runId}`,
    priceMinor: 20_000,
    licenseTerms: "Second listing of the same itinerary — user re-submit probe",
    revenueShareBps: 1000,
  });
  check(
    "seller: double-listing the same itinerary refused typed (already_listed, existing id)",
    dupe.data?.status === "already_listed" && dupe.data?.listingId === listingId,
    dupe.text.slice(0, 200),
  );
  const listingState = psql(
    `SELECT count(*) || '/' || min(revenue_share_bps) FROM marketplace_listing WHERE itinerary_id = '${itineraryId}'`,
  );
  check(
    "seller: refused re-list conserves the live listing (1 row, 750 bps verbatim)",
    listingState === `1/${SELLER_SHARE_BPS}`,
    `got ${listingState}`,
  );

  // GAP PIN — no seller-earnings procedure exists on the router (tRPC answers
  // 404 for an unknown procedure path).
  for (const proc of ["workspace.marketplace.earnings", "workspace.marketplace.licenses"]) {
    const probe = await trpcQuery(seller.jar, proc);
    check(
      `seller: GAP PIN — no ${proc} procedure exists (404)`,
      probe.res.status === 404,
      `got ${probe.res.status}: ${probe.text.slice(0, 120)}`,
    );
  }

  // ── Traveler redaction: the SAME trade must be invisible client-side ─────
  const anon = new Map(); // the traveler has no session — ever
  const FORBIDDEN_KEYS = [
    "provenance",
    "revenuesharebps",
    "platformtakeminor",
    "sellercreditminor",
    "priceminor",
    "licenseterms",
    "originalauthoragencyid",
    "rebrandlineage",
    "netminor",
    "netrate",
    "markupbps",
    "agencyid",
  ];
  const FORBIDDEN_TEXT = ["331.00", "33.10", "297.90", "revenue", "platform take", SELLER_TERMS.toLowerCase()];

  // (a) the reseller's white-label COPY — its stored document carries the
  //     licensed-under provenance (750 bps + terms) that must never be served.
  const shareCopy = await trpcMutate(reseller.jar, "workspace.itinerary.share", {
    itineraryId: lic.copyItineraryId,
  });
  const copyToken = shareCopy.data?.token;
  check("reseller: share link minted for the licensed copy", shareCopy.data?.status === "shared" && !!copyToken, shareCopy.text.slice(0, 200));

  const copyView = await trpcQuery(anon, "clientView.itinerary", { token: copyToken });
  check("client(copy, api): token resolves anonymously", copyView.data?.status === "found", copyView.text.slice(0, 200));
  {
    const keys = [...collectKeys(copyView.data)];
    const leaked = keys.filter((k) => FORBIDDEN_KEYS.includes(k));
    check(
      "client(copy, api): payload structurally free of revenue-share/provenance keys",
      leaked.length === 0,
      `leaked keys: ${leaked.join(", ")}`,
    );
    const textLower = copyView.text.toLowerCase();
    const leakedText = FORBIDDEN_TEXT.filter((t) => textLower.includes(t.toLowerCase()));
    check(
      "client(copy, api): payload text free of the fee/split/terms of the trade",
      leakedText.length === 0,
      `leaked: ${leakedText.join(" | ")}`,
    );
    check(
      "client(copy, api): white-label holds — original seller agency absent",
      !copyView.text.includes(sellerAgencyName),
      "seller agency name served to the copy's traveler",
    );
  }
  // (b) the seller's ORIGINAL — listed on the marketplace; the listing's fee,
  //     terms and title must not reach the traveler either.
  const shareOrig = await trpcMutate(seller.jar, "workspace.itinerary.share", { itineraryId });
  const origToken = shareOrig.data?.token;
  check("seller: share link minted for the listed original", shareOrig.data?.status === "shared" && !!origToken, shareOrig.text.slice(0, 200));
  const origView = await trpcQuery(anon, "clientView.itinerary", { token: origToken });
  {
    const keys = [...collectKeys(origView.data)];
    const leaked = keys.filter((k) => FORBIDDEN_KEYS.includes(k));
    const textLower = origView.text.toLowerCase();
    const leakedText = FORBIDDEN_TEXT.filter((t) => textLower.includes(t.toLowerCase()));
    check(
      "client(original, api): payload free of listing/revenue-share data (keys + text + listing title)",
      origView.data?.status === "found" && leaked.length === 0 && leakedText.length === 0 &&
        !origView.text.includes(listingTitle),
      `keys: ${leaked.join(",")} text: ${leakedText.join(" | ")}`,
    );
  }
  // (c) the SSR /view pages (web platform), same scans on the rendered HTML.
  for (const [label, token, mustNotName] of [
    ["copy", copyToken, sellerAgencyName],
    ["original", origToken, listingTitle],
  ]) {
    const page = await api(anon, "GET", `/view/${token}`);
    const html = page.text.toLowerCase();
    const leakedText = FORBIDDEN_TEXT.filter((t) => html.includes(t.toLowerCase()));
    check(
      `client(${label}, web): SSR page renders (200) with zero revenue-share traces`,
      page.res.status === 200 && leakedText.length === 0 && !page.text.includes(mustNotName),
      `status ${page.res.status}; leaked: ${leakedText.join(" | ")}${page.text.includes(mustNotName) ? `; page names "${mustNotName}"` : ""}`,
    );
  }

  console.log(`\n[browser-walk handles] seller sign-in: seller-${runId}@example.test / seller-visibility-pass-9; listingId ${listingId}; copy /view/${copyToken}`);
  console.log(failures === 0 ? "\nRevenue-share seller-visibility scenario PASSED." : `\n${failures} failing check(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
