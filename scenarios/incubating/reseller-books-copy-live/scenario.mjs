// Kitchen Loop iteration-3 THIRD ideate pass (T2 Composition; feature booking
// crossed with marketplace/revenue-share arrangement; platforms web+api;
// user_types agent-reseller + client): the reseller OPERATES the traded good —
// licenses a white-label copy, quotes + books net-rate inventory inside THEIR
// copy at THEIR OWN markup, then hands the client a share link to the branded
// booked trip.
//
// Design intent under test: licensing inherits tripRequest "so the reseller can
// re-quote supply on the copy" (packages/marketplace/src/licensing.ts, D8) —
// designed, never live-exercised. L3-style, 4-layer: real requests against the
// built compose image, parsed responses, STATE-DELTA assertions on the
// platform's own money integers (markup_ledger conservation keyed to the
// RESELLER agency; the seller's ledger stays empty) and the trust boundary of
// the public client payload (allowlist projection, white-label branding).
//
// Operator-side arrangement: marketplace vetting is a platform-operator action
// (spec 011 research D10) — like tests/e2e/support.ts, the script performs the
// operator's half directly against compose Postgres.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/reseller-books-copy-live/scenario.mjs
// Exit 0 = full journey passes; non-zero = a real failure.

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

/** Minimal cookie jar (same shape as golden-path-trade-live). */
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
/** tRPC query over HTTP (GET, ?input= JSON). */
async function trpcQuery(jar, proc, input) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const r = await api(jar, "GET", `/api/trpc/${proc}${qs}`);
  return { ...r, data: r.json?.result?.data ?? null };
}
/** Operator-side psql against the compose Postgres (support.ts arrangement). */
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
    password: "copy-operator-pass-9",
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
  destination: "Lisbon",
  checkIn: "2026-10-05",
  checkOut: "2026-10-08",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 120_000, currency: "USD" },
};
const SELLER_NAME_PREFIX = "Atlas Scenario";
const RESELLER_NAME_PREFIX = "Nomad Copy Ops";
const LIST_PRICE_MINOR = 30_000;
const SELLER_SHARE_BPS = 600;
const RESELLER_MARKUP_BPS = 2200; // reseller's OWN markup — not the 1500 default, not the golden path's 1800

async function main() {
  console.log(`Reseller-books-copy scenario against ${BASE} (run ${runId})`);

  // ── Arrangement: seller drafts, gets vetted, lists (combos already covered
  //    by earlier passes — kept to the minimum needed to trade the good) ─────
  const seller = await onboardAgent("seller", `${SELLER_NAME_PREFIX} ${runId}`);
  const draft = await trpcMutate(seller.jar, "workspace.itinerary.draft", TRIP);
  const originalId = draft.data?.itinerary?.id;
  check("seller: AI draft persists an itinerary", draft.data?.status === "drafted" && !!originalId, draft.text.slice(0, 300));

  vetAgency(seller.orgId);
  const listed = await trpcMutate(seller.jar, "workspace.marketplace.createListing", {
    itineraryId: originalId,
    title: `Lisbon long weekend ${runId}`,
    priceMinor: LIST_PRICE_MINOR,
    licenseTerms: "White-label permitted; operate freely.",
    revenueShareBps: SELLER_SHARE_BPS,
  });
  const listingId = listed.data?.listingId;
  check("seller: vetted listing goes live", listed.data?.status === "listed" && !!listingId, listed.text.slice(0, 200));

  // ── Reseller: license the white-label copy ────────────────────────────────
  const reseller = await onboardAgent("reseller", `${RESELLER_NAME_PREFIX} ${runId}`);
  vetAgency(reseller.orgId);
  const license = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  const copyId = license.data?.copyItineraryId;
  check("reseller: license yields a white-label copy", license.data?.status === "licensed" && !!copyId, license.text.slice(0, 300));

  // ── Tenancy (INV-004): the SELLER's original is not quotable by the reseller
  const crossQuote = await trpcMutate(reseller.jar, "workspace.booking.quote", {
    itineraryId: originalId,
    markupBps: RESELLER_MARKUP_BPS,
  });
  check(
    "reseller: quoting the seller's ORIGINAL is refused NOT_FOUND (no existence oracle; router throws like itinerary.get)",
    crossQuote.res.status === 404 && crossQuote.json?.error?.data?.code === "NOT_FOUND",
    crossQuote.text.slice(0, 200),
  );

  // ── The seam: QUOTE the copy at the reseller's own markup ────────────────
  const quote = await trpcMutate(reseller.jar, "workspace.booking.quote", {
    itineraryId: copyId,
    markupBps: RESELLER_MARKUP_BPS,
  });
  const held = (quote.data?.items ?? []).filter((i) => i.outcome === "held").map((i) => i.quote);
  check(
    "reseller: quoting INSIDE the licensed copy holds at least one component (licensing D8 intent)",
    quote.data?.status === "quoted" && held.length > 0,
    quote.text.slice(0, 300),
  );
  for (const row of held) {
    // FX-converted nets: the net×1.22 identity is exact only for USD nets, but
    // every row must carry the reseller's markup and price in the trip currency.
    const sameCurrency = row.netCurrency === "USD";
    const expectedSell = Math.round(row.netMinor * (1 + RESELLER_MARKUP_BPS / 10_000));
    check(
      `reseller: held ${row.quoteRowId.slice(0, 8)} carries the reseller's 22% markup in USD (net ${row.netMinor} ${row.netCurrency} → sell ${row.sellMinor})`,
      row.markupBps === RESELLER_MARKUP_BPS && row.currency === "USD" && (!sameCurrency || row.sellMinor === expectedSell),
      `expected markup ${RESELLER_MARKUP_BPS} in USD${sameCurrency ? `, sell ${expectedSell}` : ""}; got ${JSON.stringify(row)}`,
    );
  }

  // ── BOOK the copy ─────────────────────────────────────────────────────────
  const book = await trpcMutate(reseller.jar, "workspace.booking.book", {
    itineraryId: copyId,
    quoteRowIds: held.map((r) => r.quoteRowId),
  });
  const confirmed = (book.data?.components ?? []).filter((c) => c.outcome === "confirmed");
  check(
    "reseller: every held component books confirmed with a supplier ref",
    book.data?.status === "confirmed" && confirmed.length === held.length && confirmed.every((c) => c.supplierBookingId),
    book.text.slice(0, 300),
  );

  // ── State deltas: the booking money belongs to the RESELLER, conserved ───
  const resellerBad = psql(
    `SELECT count(*) FROM markup_ledger WHERE agency_id = '${reseller.orgId}' AND net_minor + markup_minor <> sell_minor`,
  );
  const resellerRows = psql(`SELECT count(*) FROM markup_ledger WHERE agency_id = '${reseller.orgId}'`);
  check(
    `reseller: markup ledger conserves net+markup=sell on all ${resellerRows} rows`,
    resellerBad === "0" && Number(resellerRows) === confirmed.length,
    `${resellerBad} violating rows / ${resellerRows} total (expected ${confirmed.length})`,
  );
  const sellerRows = psql(`SELECT count(*) FROM markup_ledger WHERE agency_id = '${seller.orgId}'`);
  check(
    "seller: ledger untouched by the reseller's booking (0 rows — money isolation across the trade)",
    sellerRows === "0",
    `seller has ${sellerRows} ledger rows`,
  );
  // The ledger stores integer money (net/markup/sell minor), not bps — the
  // reseller's 2200 bps shows up as ledger sells identical to the held quotes.
  const ledgerSells = psql(
    `SELECT string_agg(sell_minor::text, ',' ORDER BY sell_minor) FROM markup_ledger WHERE agency_id = '${reseller.orgId}'`,
  );
  const heldSells = held.map((r) => r.sellMinor).sort((a, b) => a - b).join(",");
  check(
    `reseller: ledger sells are exactly the 22%-markup quote sells (independent of seller/default markup)`,
    ledgerSells === heldSells,
    `ledger [${ledgerSells}] vs held [${heldSells}]`,
  );

  // ── Share: the reseller hands the CLIENT a link to the branded copy ──────
  const share = await trpcMutate(reseller.jar, "workspace.itinerary.share", { itineraryId: copyId });
  const token = share.data?.token;
  check(
    "reseller: share link minted for the copy (path /view/<token>)",
    share.data?.status === "shared" && !!token && share.data?.path === `/view/${token}`,
    share.text.slice(0, 200),
  );

  // ── Client (api): anonymous resolution of the public payload ─────────────
  const anon = new Map(); // fresh jar — the traveler has no session
  const view = await trpcQuery(anon, "clientView.itinerary", { token });
  const v = view.data?.view;
  check("client: token resolves to a found view anonymously", view.data?.status === "found" && !!v, view.text.slice(0, 300));

  const resellerAgencyName = `${RESELLER_NAME_PREFIX} ${runId}`;
  check(
    "client: white-label branding — agencyName is the RESELLER's agency",
    v?.agencyName === resellerAgencyName,
    `got ${JSON.stringify(v?.agencyName)}`,
  );
  const viewItems = (v?.days ?? []).flatMap((d) => d.items);
  const bookedItems = viewItems.filter((i) => i.booked);
  check(
    `client: booked marks reflect the reseller's live bookings (${confirmed.length} components)`,
    bookedItems.length === confirmed.length,
    `view shows ${bookedItems.length} booked of ${viewItems.length} items`,
  );

  // Trust boundary: STRUCTURAL absence of agent-confidential material in the
  // raw payload text (allowlist projection, spec 010 FR-007/SC-003).
  const rawView = view.text;
  for (const needle of ["netMinor", "netRate", "markupBps", "supplierBookingId", "supplyRef", "provenance", "agencyId", "budget"]) {
    check(`client: payload structurally free of "${needle}"`, !rawView.includes(needle));
  }
  check(
    "client: payload never names the original seller agency (white-label promise)",
    !rawView.includes(SELLER_NAME_PREFIX),
  );
  check('client: payload never names the platform ("TripForge")', !rawView.includes("TripForge"));

  // Price fidelity OBSERVATION (spec 010 blesses document-stored sell prices;
  // whether a Booked badge may sit beside a price that differs from the booked
  // sell is SPEC-SILENT — measured here, classified in the experience report).
  const ledgerSellSum = Number(
    psql(`SELECT COALESCE(sum(sell_minor), 0) FROM markup_ledger WHERE agency_id = '${reseller.orgId}'`),
  );
  const viewBookedSum = bookedItems.reduce((s, i) => s + (i.sellMinor ?? 0), 0);
  console.log(
    `  note price-fidelity observation: client view shows ${viewBookedSum} minor across booked items; the reseller's booked ledger sells sum to ${ledgerSellSum} minor (delta ${viewBookedSum - ledgerSellSum})`,
  );

  // ── Client (web): the SSR page serves the same trust boundary ────────────
  const page = await fetch(`${BASE}/view/${token}`);
  const html = await page.text();
  check("client web: /view/<token> serves 200", page.status === 200, `got ${page.status}`);
  check("client web: page carries the RESELLER's brand", html.includes(resellerAgencyName));
  check("client web: page marks booked items", html.includes("Booked"));
  const title = (html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? "";
  check(
    `client web: FULL surface free of platform branding incl. tab title (INV-020; title "${title}")`,
    !html.includes("TripForge"),
  );
  check("client web: page never names the original seller agency", !html.includes(SELLER_NAME_PREFIX));

  // Typo/guess edge: a random uuid resolves to the neutral unavailable state.
  const bogus = await trpcQuery(anon, "clientView.itinerary", { token: "00000000-0000-4000-8000-000000000000" });
  check(
    "client: guessed token yields typed not_found (no existence oracle)",
    bogus.data?.status === "not_found",
    bogus.text.slice(0, 200),
  );

  console.log(failures === 0 ? "\nReseller-books-copy scenario PASSED." : `\n${failures} failing check(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
