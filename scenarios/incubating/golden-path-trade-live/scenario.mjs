// Kitchen Loop iteration-3 scenario (T2 Composition; features itinerary-builder +
// booking + marketplace + revenue-share; platforms web+api; user_types
// agent-seller + agent-reseller): the PRD's golden path, end-to-end on the LIVE
// stack — a seller drafts with AI, books at a custom markup, lists with declared
// terms; a reseller licenses the trip; the reseller RE-LISTS the white-label
// copy and a third agency licenses that resale.
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, STATE-DELTA assertions against the platform's own money integers
// (markup ledger conservation, license split conservation at the fixed 10%
// platform take) and the provenance stamped into each white-label copy.
//
// Operator-side arrangement: marketplace vetting is a platform-operator action
// (spec 011 research D10) — like tests/e2e/support.ts, the script performs the
// operator's half directly against compose Postgres, keyed by the unique agency
// names it creates.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/golden-path-trade-live/scenario.mjs
// Exit 0 = full journey passes; non-zero = a real failure (see README for the
// intentional known-failing assertion pinning the re-list provenance mutation).

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "itinerary-builder", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "live browser (companion pass): sign-up -> Paris 3-day draft, day subtotals + budget table all fits (FakeLLM keyless)" },
//   { "feature": "itinerary-builder", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "workspace.itinerary.draft persists a budget-fit draft; document canonical on read" },
//   { "feature": "booking", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "live browser (companion pass): custom 18% markup quote -> 6 holds -> book -> confirmation with supplier refs" },
//   { "feature": "booking", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "quote/book at 1800 bps; markup_ledger conserves net+markup=sell incl. FX-converted nets" },
//   { "feature": "marketplace", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "live browser (companion pass): unvetted listing refused typed; vetted listing live with verbatim terms" },
//   { "feature": "marketplace", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "createListing refused not_vetted -> listed once vetted; revenue_share_bps stored verbatim (750)" },
//   { "feature": "marketplace", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 3, "tier": "T2", "note": "live browser (companion pass): BUG-3 (sell panel stale until reload) fixed same iteration (seed-0016, PR #31)" },
//   { "feature": "marketplace", "platform": "api", "user_type": "agent-reseller", "result": "fail", "iteration": 3, "tier": "T2", "note": "BUG-1: re-listing a licensed copy overwrites its licensed-under provenance -- open, desk RESALE-SHARE-SEMANTICS (intentional known-failing assertion, see README)" },
//   { "feature": "revenue-share", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 3, "tier": "T2", "note": "live browser (companion pass): license receipt renders the conserved split 250.00 = 225.00 + 25.00" },
//   { "feature": "revenue-share", "platform": "api", "user_type": "agent-reseller", "result": "fail", "iteration": 3, "tier": "T2", "note": "BUG-2: resale split pays the original seller nothing while UI promises earn a share on every resale -- open, desk RESALE-SHARE-SEMANTICS" }
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
    password: "golden-path-pass-9",
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
  destination: "Paris",
  checkIn: "2026-09-01",
  checkOut: "2026-09-04",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
};
const SELLER_TERMS = "White-label permitted; keep attribution lineage.";
const SELLER_SHARE_BPS = 750; // deliberately NOT the 1000 default (seed-0009d-b probe)
const RESALE_TERMS = "Resale of licensed white-label copy; lineage preserved.";
const RESALE_SHARE_BPS = 500;
const MARKUP_BPS = 1800; // custom markup — the e2e journeys only exercise the 1500 default

async function main() {
  console.log(`Golden-path trade scenario against ${BASE} (run ${runId})`);

  // ── Seller: draft → quote at 18% → book ─────────────────────────────────
  const seller = await onboardAgent("seller", `Meridian Scenario ${runId}`);

  const draft = await trpcMutate(seller.jar, "workspace.itinerary.draft", TRIP);
  const itineraryId = draft.data?.itinerary?.id;
  check(
    "seller: AI draft persists an itinerary",
    draft.data?.status === "drafted" && !!itineraryId,
    draft.text.slice(0, 300),
  );

  const quote = await trpcMutate(seller.jar, "workspace.booking.quote", {
    itineraryId,
    markupBps: MARKUP_BPS,
  });
  // NOTE (seed-0032): unwraps straight to `.quote`, dropping each row's
  // `itemId` — safe ONLY here because nothing below needs to correlate a
  // held/booked row back to a specific document item. If you copy this
  // idiom into a new scenario that DOES need per-item correlation (e.g.
  // per-item price-fidelity), keep the outer `{ itemId, quote }` shape
  // instead — see reseller-builds-fresh or reseller-books-copy-live for the
  // safe pattern (`held.map(r => [r.itemId, r.quote.sellMinor])`).
  const held = (quote.data?.items ?? []).filter((i) => i.outcome === "held").map((i) => i.quote);
  check("seller: quote holds at least one component", held.length > 0, quote.text.slice(0, 300));
  for (const row of held) {
    // Sell price is FX-converted to the trip currency BEFORE markup, so the
    // net×1.18 identity is only exact for same-currency (USD) nets; every row
    // must still carry the requested markup and price in the trip currency.
    const sameCurrency = row.netCurrency === "USD";
    const expectedSell = Math.round(row.netMinor * (1 + MARKUP_BPS / 10_000));
    check(
      `seller: held ${row.quoteRowId.slice(0, 8)} carries 18% markup priced in USD (net ${row.netMinor} ${row.netCurrency} → sell ${row.sellMinor})`,
      row.markupBps === MARKUP_BPS && row.currency === "USD" && (!sameCurrency || row.sellMinor === expectedSell),
      `expected markup ${MARKUP_BPS} in USD${sameCurrency ? `, sell ${expectedSell}` : ""}; got ${JSON.stringify(row)}`,
    );
  }

  const book = await trpcMutate(seller.jar, "workspace.booking.book", {
    itineraryId,
    quoteRowIds: held.map((r) => r.quoteRowId),
  });
  const confirmed = (book.data?.components ?? []).filter((c) => c.outcome === "confirmed");
  check(
    "seller: every held component books confirmed with a supplier ref",
    book.data?.status === "confirmed" && confirmed.length === held.length &&
      confirmed.every((c) => c.supplierBookingId),
    book.text.slice(0, 300),
  );

  // Money conservation on the platform's own ledger: net + markup = sell, every row.
  const ledgerBad = psql(
    `SELECT count(*) FROM markup_ledger WHERE agency_id = '${seller.orgId}' AND net_minor + markup_minor <> sell_minor`,
  );
  const ledgerCount = psql(`SELECT count(*) FROM markup_ledger WHERE agency_id = '${seller.orgId}'`);
  check(
    `seller: markup ledger conserves net+markup=sell on all ${ledgerCount} rows`,
    ledgerBad === "0" && Number(ledgerCount) === confirmed.length,
    `${ledgerBad} violating rows / ${ledgerCount} total`,
  );

  // ── Seller: list — refused unvetted, live once vetted, terms verbatim ────
  const listingInput = {
    itineraryId,
    title: `Paris weekender ${runId}`,
    priceMinor: 25_000,
    licenseTerms: SELLER_TERMS,
    revenueShareBps: SELLER_SHARE_BPS,
  };
  const unvetted = await trpcMutate(seller.jar, "workspace.marketplace.createListing", listingInput);
  check(
    "seller: unvetted listing refused typed (not_vetted)",
    unvetted.data?.status === "not_vetted",
    unvetted.text.slice(0, 200),
  );

  vetAgency(seller.orgId);
  const listed = await trpcMutate(seller.jar, "workspace.marketplace.createListing", listingInput);
  const listingId = listed.data?.listingId;
  check("seller: vetted listing goes live", listed.data?.status === "listed" && !!listingId, listed.text.slice(0, 200));
  const storedBps = psql(`SELECT revenue_share_bps FROM marketplace_listing WHERE id = '${listingId}'`);
  check(
    `seller: declared revenue share survives verbatim (${SELLER_SHARE_BPS} bps, seed-0009d-b probe)`,
    storedBps === String(SELLER_SHARE_BPS),
    `stored ${storedBps}`,
  );

  // ── Reseller: license — split conserved at the fixed 10% take ────────────
  const reseller = await onboardAgent("reseller", `Nomad Scenario ${runId}`);
  const refusedLicense = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  check(
    "reseller: unvetted license refused typed (not_vetted)",
    refusedLicense.data?.status === "not_vetted",
    refusedLicense.text.slice(0, 200),
  );

  vetAgency(reseller.orgId);
  const license = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  const lic = license.data ?? {};
  check("reseller: license succeeds", lic.status === "licensed" && !!lic.copyItineraryId, license.text.slice(0, 300));
  check(
    "reseller: split conserved at the fixed 10% platform take (25000 = 2500 + 22500)",
    lic.priceMinor === 25_000 && lic.platformTakeMinor === 2_500 && lic.sellerCreditMinor === 22_500 &&
      lic.priceMinor === lic.platformTakeMinor + lic.sellerCreditMinor,
    JSON.stringify(lic),
  );
  const pmfSplit = psql(
    `SELECT amount_minor || '/' || price_minor || '/' || seller_credit_minor FROM pmf_event WHERE type = 'take_rate_accrued' AND agency_id = '${seller.orgId}'`,
  );
  check(
    "reseller: PMF take_rate_accrued carries the full conserved split (seed-0006b FR-014)",
    pmfSplit === "2500/25000/22500",
    `got ${pmfSplit}`,
  );

  const copyProv = JSON.parse(
    psql(`SELECT document -> 'provenance' FROM itinerary WHERE id = '${lic.copyItineraryId}'`) || "null",
  );
  check(
    "reseller: copy provenance stamped with the licensed-under terms (750 bps, seller terms, lineage, original author)",
    copyProv?.revenueShareBps === SELLER_SHARE_BPS &&
      copyProv?.licenseTerms === SELLER_TERMS &&
      copyProv?.originalAuthorAgencyId === seller.orgId &&
      Array.isArray(copyProv?.rebrandLineage) && copyProv.rebrandLineage.includes(itineraryId),
    JSON.stringify(copyProv),
  );

  // ── Reseller: RE-LIST the white-label copy ───────────────────────────────
  const relist = await trpcMutate(reseller.jar, "workspace.marketplace.createListing", {
    itineraryId: lic.copyItineraryId,
    title: `Paris resale ${runId}`,
    priceMinor: 40_000,
    licenseTerms: RESALE_TERMS,
    revenueShareBps: RESALE_SHARE_BPS,
  });
  const resaleListingId = relist.data?.listingId;
  check("reseller: a licensed white-label copy can be re-listed", relist.data?.status === "listed", relist.text.slice(0, 200));

  // KNOWN BUG (open, iteration-3 report BUG-1): re-listing OVERWRITES the copy's
  // provenance in place — the licensed-under record (750 bps + seller terms) is
  // replaced by the reseller's own declared terms, erasing the platform's stamp
  // of the first trade (Constitution VI provenance integrity). This assertion
  // pins the CORRECT behavior and stays red until the product is fixed. Do not
  // weaken it. (License-time stamping itself is correct — proven green above.)
  const provAfterRelist = JSON.parse(
    psql(`SELECT document -> 'provenance' FROM itinerary WHERE id = '${lic.copyItineraryId}'`) || "null",
  );
  check(
    "KNOWN-BUG copy provenance still records the licensed-under terms after re-list (750 bps)",
    provAfterRelist?.revenueShareBps === SELLER_SHARE_BPS && provAfterRelist?.licenseTerms === SELLER_TERMS,
    `provenance now ${JSON.stringify(provAfterRelist)}`,
  );

  // ── Third agency: license the resale — lineage + conservation ────────────
  const third = await onboardAgent("third", `Vega Scenario ${runId}`);
  vetAgency(third.orgId);
  const resaleLicense = await trpcMutate(third.jar, "workspace.marketplace.licenseListing", {
    listingId: resaleListingId,
  });
  const lic2 = resaleLicense.data ?? {};
  check(
    "third: resale license split conserved (40000 = 4000 + 36000, fee → reseller + platform)",
    lic2.status === "licensed" && lic2.priceMinor === 40_000 && lic2.platformTakeMinor === 4_000 &&
      lic2.sellerCreditMinor === 36_000,
    JSON.stringify(lic2),
  );
  // NOTE (not asserted — operator decision pending, OPERATOR-DESK RESALE-SHARE-SEMANTICS):
  // the original seller's declared 7.5% pays out NOTHING on this resale; the split
  // above is two-way. Whether v0 resale must pay the upstream share in money or
  // provenance-stamping suffices is a revenue-share-semantics question the loop
  // may not decide (DIRECTIVE ALWAYS-HALT).
  const upstreamCredits = psql(
    `SELECT count(*) FROM revenue_share_ledger WHERE seller_agency_id = '${seller.orgId}'`,
  );
  console.log(
    `  note upstream-share observation: original seller has ${upstreamCredits} ledger credit(s) total (1 = first license only; resale paid them nothing)`,
  );

  const prov2 = JSON.parse(
    psql(`SELECT document -> 'provenance' FROM itinerary WHERE id = '${lic2.copyItineraryId}'`) || "null",
  );
  check(
    "third: second-generation copy keeps the FULL lineage back to the original author",
    prov2?.originalAuthorAgencyId === seller.orgId &&
      Array.isArray(prov2?.rebrandLineage) && prov2.rebrandLineage.length === 2 &&
      prov2.rebrandLineage.includes(itineraryId),
    JSON.stringify(prov2),
  );

  console.log(failures === 0 ? "\nGolden-path trade scenario PASSED." : `\n${failures} failing check(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
