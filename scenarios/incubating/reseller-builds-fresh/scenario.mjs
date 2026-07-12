// Kitchen Loop iteration-4 ideate pass (T2 Composition; features
// itinerary-builder + booking + trust/client-view; platforms web+api;
// user_type agent-reseller): "Reseller builds fresh, not just resells."
//
// Coverage gap this closes: none of iteration-3's six ideate scenarios ever
// had an agent-reseller identity call workspace.itinerary.draft. Every
// reseller pass so far only OPERATED a good someone else built — licensing a
// seller's listing (reseller-books-copy-live), quoting/booking a licensed
// copy, or probing tenancy negatives (trust-demand-side-live). This scenario
// proves the itinerary-builder feature itself is not marketplace-history
// gated: a demand-side agency that has never listed or licensed anything can
// draft, quote, book, and share an ORIGINAL itinerary exactly like a seller
// can — both via the browser (companion live-browser pass, evidence in
// .kitchenloop/evidence/iter-4-ideate/) and via the raw API (this script).
//
// It also re-verifies booked-price fidelity (spec 013, BUG-1/seed-0025/PR#36)
// on a THIRD distinct code path. Prior passes proved it on: (a) a seller's
// own direct itinerary (partially-booked-client-view), (b) a licensed
// white-label COPY, where the sibling scenario reseller-books-copy-live
// deliberately left the check as an unasserted OBSERVATION (README: "kept as
// a logged observation... the fix is a cross-spec product decision"). This
// script formally ASSERTS fidelity on path (c): an itinerary a reseller
// authored from scratch — closing the gap left open by (b) with a real
// assertion instead of a note.
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, STATE-DELTA assertions against compose Postgres (markup_ledger
// conservation, booking_component rows) and the client-facing trust boundary
// (allowlist projection, white-label branding, INV-020).
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/reseller-builds-fresh/scenario.mjs
// Exit 0 = full journey passes; non-zero = a real failure.

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "itinerary-builder", "platform": "api", "user_type": "agent-reseller", "result": "pass", "iteration": 4, "tier": "T2", "note": "seed-0034 backfill: fresh reseller identity (no marketplace history) drafts an ORIGINAL itinerary via workspace.itinerary.draft; provenance names the reseller as original author with empty lineage -- iteration-4-report.md" },
//   { "feature": "itinerary-builder", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 4, "tier": "T2", "note": "seed-0034 backfill: companion live-browser pass (sign-up -> AI planner form drafts an original Prague trip), evidence .kitchenloop/evidence/iter-4-ideate/ -- iteration-4-report.md" },
//   { "feature": "booking", "platform": "api", "user_type": "agent-reseller", "result": "pass", "iteration": 4, "tier": "T2", "note": "seed-0034 backfill: reseller quotes+books a self-built itinerary at a custom 24% markup; markup_ledger conserves net+markup=sell on all 6 rows -- iteration-4-report.md" },
//   { "feature": "booking", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 4, "tier": "T2", "note": "seed-0034 backfill: companion live-browser pass, custom 20% markup quote -> 6 holds -> book -> confirmation via the web UI -- iteration-4-report.md" },
//   { "feature": "trust", "platform": "api", "user_type": "agent-reseller", "result": "pass", "iteration": 4, "tier": "T2", "note": "seed-0034 backfill: anonymous client-view formally ASSERTS booked-price fidelity (not just logged) on the reseller-self-built path (BUG-1/seed-0025 class); payload structurally free of agent-confidential fields -- iteration-4-report.md" },
//   { "feature": "trust", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 4, "tier": "T2", "note": "seed-0034 backfill: companion live-browser pass, signed-out visitor opens the /view/<token> share link and sees the branded booked trip -- iteration-4-report.md" }
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

/** Minimal cookie jar (same shape as the other incubating scenarios). */
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

async function onboardAgent(label, agencyName) {
  const jar = new Map();
  const signUp = await api(jar, "POST", "/api/auth/sign-up/email", {
    email: `${label}-${runId}@example.test`,
    password: "reseller-builds-fresh-9",
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
  destination: "Vienna",
  checkIn: "2026-12-05",
  checkOut: "2026-12-08",
  party: { adults: 2, children: 0 },
  tripStyle: "premium",
  budget: { mode: "hardCap", amountMinor: 110_000, currency: "USD" },
};
const RESELLER_MARKUP_BPS = 2400; // custom — not the 1500 default, not the 1800/2200/2500 other scenarios used

async function main() {
  console.log(`Reseller-builds-fresh scenario against ${BASE} (run ${runId})`);

  // ── A demand-side agency with ZERO marketplace history: never listed,
  //    never licensed anything. Proves itinerary-builder access is not
  //    gated behind having sold or bought a trip first. ────────────────────
  const reseller = await onboardAgent("reseller", `Waypoint Demand ${runId}`);

  const preList = await trpcQuery(reseller.jar, "workspace.itinerary.list");
  check(
    "reseller: workspace starts with zero itineraries (fresh identity, no marketplace history)",
    Array.isArray(preList.data?.itineraries) && preList.data.itineraries.length === 0,
    preList.text.slice(0, 200),
  );

  // ── itinerary-builder x api x agent-reseller: the AI draft mutation
  //    succeeds for a pure demand-side identity, exactly like a seller ──────
  const draft = await trpcMutate(reseller.jar, "workspace.itinerary.draft", TRIP);
  const itineraryId = draft.data?.itinerary?.id;
  check(
    "reseller: AI draft persists an ORIGINAL itinerary (not a licensed copy — no marketplace step ran)",
    draft.data?.status === "drafted" && !!itineraryId,
    draft.text.slice(0, 300),
  );
  const provenance = draft.data?.itinerary?.provenance;
  check(
    "reseller: fresh draft's provenance names the RESELLER as original author with an empty lineage (self-authored, not a licensed copy — source of truth for the fidelity check below)",
    provenance?.originalAuthorAgencyId === reseller.orgId && (provenance?.rebrandLineage ?? []).length === 0,
    JSON.stringify(provenance),
  );

  const postList = await trpcQuery(reseller.jar, "workspace.itinerary.list");
  check(
    "reseller: workspace.itinerary.list now shows the self-built trip (parity with the web workspace list)",
    (postList.data?.itineraries ?? []).some((i) => i.id === itineraryId),
    postList.text.slice(0, 200),
  );

  // Stored per-item draft prices — the pre-booking baseline (draft time sets
  // sellPrice = netRate; the fidelity assertion below proves booking replaces it).
  const doc = await trpcQuery(reseller.jar, "workspace.itinerary.get", { itineraryId });
  const docItems = (doc.data?.itinerary?.days ?? []).flatMap((d) => d.items ?? []);
  check("reseller: draft document has priced items to book", docItems.length >= 4, `only ${docItems.length} items`);

  // ── booking x api x agent-reseller: quote + book the reseller's OWN
  //    fresh itinerary at a custom markup ─────────────────────────────────
  const quote = await trpcMutate(reseller.jar, "workspace.booking.quote", {
    itineraryId,
    markupBps: RESELLER_MARKUP_BPS,
  });
  // Keep the OUTER { itemId, quote } shape (not just .quote) — itemId is the
  // only handle correlating a held/booked row back to its document item below.
  const held = (quote.data?.items ?? []).filter((i) => i.outcome === "held");
  check("reseller: quote holds at least one component", quote.data?.status === "quoted" && held.length > 0, quote.text.slice(0, 300));
  for (const { quote: row } of held) {
    const sameCurrency = row.netCurrency === "USD";
    const expectedSell = Math.round(row.netMinor * (1 + RESELLER_MARKUP_BPS / 10_000));
    check(
      `reseller: held ${row.quoteRowId.slice(0, 8)} carries the reseller's 24% markup in USD (net ${row.netMinor} ${row.netCurrency} → sell ${row.sellMinor})`,
      row.markupBps === RESELLER_MARKUP_BPS && row.currency === "USD" && (!sameCurrency || row.sellMinor === expectedSell),
      `expected markup ${RESELLER_MARKUP_BPS} in USD${sameCurrency ? `, sell ${expectedSell}` : ""}; got ${JSON.stringify(row)}`,
    );
  }

  const book = await trpcMutate(reseller.jar, "workspace.booking.book", {
    itineraryId,
    quoteRowIds: held.map((r) => r.quote.quoteRowId),
  });
  const confirmed = (book.data?.components ?? []).filter((c) => c.outcome === "confirmed");
  check(
    "reseller: every held component books confirmed with a supplier ref",
    book.data?.status === "confirmed" && confirmed.length === held.length && confirmed.every((c) => c.supplierBookingId),
    book.text.slice(0, 300),
  );

  // ── State deltas: money belongs to the reseller, conserved ───────────────
  const ledgerBad = psql(
    `SELECT count(*) FROM markup_ledger WHERE agency_id = '${reseller.orgId}' AND net_minor + markup_minor <> sell_minor`,
  );
  const ledgerCount = psql(`SELECT count(*) FROM markup_ledger WHERE agency_id = '${reseller.orgId}'`);
  check(
    `reseller: markup ledger conserves net+markup=sell on all ${ledgerCount} rows`,
    ledgerBad === "0" && Number(ledgerCount) === confirmed.length,
    `${ledgerBad} violating rows / ${ledgerCount} total`,
  );
  const componentCount = psql(`SELECT count(*) FROM booking_component WHERE agency_id = '${reseller.orgId}'`);
  check(
    `db: exactly ${confirmed.length} booking components recorded`,
    componentCount === String(confirmed.length),
    `got ${componentCount}`,
  );

  // ── Share + client view: FORMAL price-fidelity assertion (not an
  //    observation) on the reseller-self-built path, spec 013 FR-001/FR-003 ─
  const share = await trpcMutate(reseller.jar, "workspace.itinerary.share", { itineraryId });
  const token = share.data?.token;
  check("reseller: share link minted", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  const anon = new Map(); // the traveler has no session — ever
  const view = await trpcQuery(anon, "clientView.itinerary", { token });
  const v = view.data?.view;
  check("client: token resolves anonymously", view.data?.status === "found" && !!v, view.text.slice(0, 300));

  const bookedSellByItemId = new Map(held.map((r) => [r.itemId, r.quote.sellMinor]));
  const orderedDocIds = docItems.map((i) => i.id);
  const viewItems = (v?.days ?? []).flatMap((d) => d.items);
  check(
    `client: all ${bookedSellByItemId.size} booked items show "Booked" (not the pre-booking draft state)`,
    viewItems.filter((i) => i.booked).length === bookedSellByItemId.size,
    `view shows ${viewItems.filter((i) => i.booked).length} booked of ${viewItems.length}`,
  );
  viewItems.forEach((it, idx) => {
    const docId = orderedDocIds[idx];
    if (!bookedSellByItemId.has(docId)) return;
    check(
      `client: item ${idx + 1} priced at ITS booking's sell ${bookedSellByItemId.get(docId)} minor — NEVER the draft-time net-rate placeholder (BUG-1/seed-0025 class, asserted on the reseller-self-built path)`,
      it.booked === true && it.sellMinor === bookedSellByItemId.get(docId),
      `got booked=${it.booked} sellMinor=${it.sellMinor}`,
    );
  });
  const ledgerSellSum = Number(
    psql(`SELECT COALESCE(sum(sell_minor), 0) FROM markup_ledger WHERE agency_id = '${reseller.orgId}'`),
  );
  const viewBookedSum = viewItems.filter((i) => i.booked).reduce((s, i) => s + (i.sellMinor ?? 0), 0);
  check(
    `client: total shown across booked items (${viewBookedSum}) matches the reseller's own booked ledger sum exactly (${ledgerSellSum}) — zero-delta fidelity`,
    viewBookedSum === ledgerSellSum,
    `view sum ${viewBookedSum} vs ledger sum ${ledgerSellSum}, delta ${viewBookedSum - ledgerSellSum}`,
  );

  // ── Trust boundary: white-label branding + structural confidentiality ────
  check(
    "client: white-label branding is the RESELLER's own agency (no seller to hide — self-authored trip)",
    v?.agencyName === `Waypoint Demand ${runId}`,
    `got ${JSON.stringify(v?.agencyName)}`,
  );
  const rawView = view.text;
  for (const needle of ["netMinor", "netRate", "markupBps", "supplierBookingId", "supplyRef", "provenance", "agencyId", "budget"]) {
    check(`client: payload structurally free of "${needle}"`, !rawView.includes(needle));
  }
  check('client: payload never names the platform ("TripForge")', !rawView.includes("TripForge"));

  const bogus = await trpcQuery(anon, "clientView.itinerary", { token: "00000000-0000-4000-8000-000000000000" });
  check(
    "client: unknown token resolves to the typed unavailable state (no existence oracle)",
    bogus.res.status === 200 && bogus.data?.status !== "found" && !bogus.data?.view,
    bogus.text.slice(0, 200),
  );

  console.log(failures === 0 ? "\nReseller-builds-fresh scenario PASSED." : `\n${failures} failing check(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
