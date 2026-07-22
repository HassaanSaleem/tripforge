// Kitchen Loop iteration-10 T2 Composition scenario: trade-layer trust at the
// BROWSER surface.
//
// GOAL.md (campaign/two-sided-surface) & Constitution Principle VI
// (Trust/Provenance/Revenue-Share Integrity) + INV-020 (a client sees the sell
// price only, never net/markup — and, this scenario adds, never the
// revenue-share economics either). Coverage stood at 33/36; the LAST three
// untested cells are all trade-layer WEB companions of already-API-verified
// cells that no scenario had ever browser-witnessed:
//   • content-library × web × agent-reseller
//   • revenue-share   × web × agent-seller
//   • revenue-share   × web × client
//
// This is a single realistic four-feature workflow (content-library +
// marketplace + revenue-share + trust) driven end to end across the trade
// lifecycle, proving the load-bearing facts mechanically at the API/DB layer so
// the WEB cells rest on a durable regression witness, not just a screenshot. A
// companion live-browser pass (Playwright MCP, this iteration) renders each of
// the three surfaces; this script also fetches the client's /view SSR HTML
// directly so the client-web trust boundary is asserted on the real rendered
// document, not only the JSON payload.
//
// What this witnesses (4-layer L3: real HTTP against the built compose image ->
// parsed responses -> Postgres ground truth -> state-delta asserts):
//   1. MEDIA CARRIES THROUGH THE TRADE (content-library × web × agent-reseller).
//      An agent-seller registers an agent-upload library asset and attaches it
//      to a persisted itinerary's gallery; licensing that listing hands the
//      RESELLER a white-label copy whose gallery carries the seller's media
//      VERBATIM (kind/url/alt), so the reseller's branded copy — the thing they
//      show a client — inherits the seller's content. The reseller's client
//      view then renders that same photo with NO internal media-asset id.
//   2. THE SELLER SEES THEIR EARNINGS, SCOPED (revenue-share × web × agent-seller).
//      After the license, revenue_share_ledger holds exactly one conserved row
//      crediting the seller (price = platform_take + seller_credit, INV-012).
//      The seller's OWN browseListings card projects licenseCount and
//      sellerCreditTotalMinor equal to the ledger sum; the RESELLER browsing the
//      SAME listing sees those earnings fields null (no cross-agency leak).
//   3. THE CLIENT SEES A BRANDED TRIP, ZERO REVENUE-SHARE LEAK
//      (revenue-share × web × client). The reseller shares the copy; an
//      anonymous client resolves clientView.itinerary AND the /view/<token> SSR
//      page. Both are structurally free of ALL revenue-share economics (the
//      licenseTerms string, the exact platform_take / seller_credit amounts, and
//      the revenueShareBps/platformTake/sellerCredit/licenseCount field names)
//      AND the net-rate/markup/provenance family (INV-020) — while still
//      carrying the reseller's brand, the sell price, and the inherited gallery.
//   4. STATE CONSERVATION on the money path: exactly one marketplace_license and
//      exactly one revenue_share_ledger row are created, and the ledger row
//      conserves (platform_take + seller_credit === price). Only the PRIMARY
//      license path is exercised — the known-red second-order resale
//      (re-listing a licensed copy) is desk RESALE-SHARE-SEMANTICS and is NOT
//      touched here (no schema / revenue-share-semantics change, DIRECTIVE §2).
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/trade-layer-trust-web/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "content-library", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 10, "tier": "T2", "note": "companion live-browser (Playwright MCP) + API proof: an agent-seller's agent-upload gallery media (workspace.media.register -> attachMedia) carries VERBATIM into the reseller's white-label copy on licenseListing (copyItineraryId); the copy doc's media[] holds the same kind/url/alt, and the reseller's client-view renders the photo with no internal media-asset id — the reseller's branded copy inherits the seller's content" },
//   { "feature": "revenue-share", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 10, "tier": "T2", "note": "companion live-browser (Playwright MCP) + API proof: after a license, the seller's OWN browseListings card projects licenseCount=1 and sellerCreditTotalMinor equal to the revenue_share_ledger seller-credit sum (INV-012, price=platform_take+seller_credit conserved), and the /marketplace page renders that earnings surface; the reseller browsing the SAME listing sees those earnings fields null (no cross-agency leak)" },
//   { "feature": "revenue-share", "platform": "web", "user_type": "client", "result": "pass", "iteration": 10, "tier": "T2", "note": "companion live-browser (Playwright MCP) + SSR-HTML structural proof: the anonymous client's clientView.itinerary payload AND the rendered /view/<token> page are both free of ALL revenue-share economics (the licenseTerms string, the exact platform_take/seller_credit amounts, and revenueShareBps/platformTake/sellerCredit/licenseCount field names) and of net-rate/markup/provenance/agencyId (INV-020), while still carrying the reseller's brand, the sell price, and the inherited gallery" }
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

/** Minimal cookie jar (same shape as golden-path / traveler-marketplace-attempt). */
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
/** tRPC SUBSCRIPTION over HTTP (spec 016/019, INV-028) — workspace.itinerary.
 * draft/selectDraft stream (SSE) rather than a single JSON mutation response. */
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
const errCode = (r) => r.error?.data?.code ?? r.error?.code ?? null;
/** Operator-side psql against the compose Postgres. */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "tripforge", "-d", "tripforge", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

// draft (returns compare options, persists NOTHING) -> selectDraft (persists,
// returns itinerary.id). The one-shot `draft.itinerary.id` read is dead since
// spec-019 split the flow — always take the two-step (loop memory).
async function draftAndPersist(jar, trip, variant = "balanced") {
  const compare = await trpcSubscribe(jar, "workspace.itinerary.draft", trip);
  const options = compare.data?.options ?? [];
  const picked = options.find((o) => o.variant === variant) ?? options[0];
  const select = await trpcSubscribe(jar, "workspace.itinerary.selectDraft", {
    tripRequest: trip,
    variant: picked?.variant,
  });
  return { itineraryId: select.data?.itinerary?.id, compare, select, options };
}

const TRIP = {
  destination: "Kyoto",
  checkIn: "2026-11-04",
  checkOut: "2026-11-07",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 300_000, currency: "USD" },
};
const SELLER_NAME_PREFIX = "Kyoto Slow Travel";
const RESELLER_NAME_PREFIX = "Meridian Bespoke";
const SELLER_TERMS = `White-label license; attribution retained. token-${runId}`; // unique needle to hunt in the client surface
const SELLER_SHARE_BPS = 750;
const LISTING_PRICE_MINOR = 33_100; // matches the conserved split proven in revenue-share-seller-visibility

async function signUpAgency(namePrefix, slugPrefix, pass) {
  const jar = new Map();
  await api(jar, "POST", "/api/auth/sign-up/email", {
    email: `${slugPrefix}-${runId}@example.test`,
    password: pass,
    name: `${namePrefix} Owner`,
  });
  const org = await api(jar, "POST", "/api/auth/organization/create", {
    name: `${namePrefix} ${runId}`,
    slug: `${slugPrefix}-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  await api(jar, "POST", "/api/auth/organization/set-active", { organizationId: orgId });
  return { jar, orgId, agencyName: `${namePrefix} ${runId}` };
}

async function main() {
  console.log(`Trade-layer trust-at-the-browser scenario against ${BASE} (run ${runId})`);

  // ══ Arrange: an agent-seller builds a media-bearing trip and lists it ═════
  const seller = await signUpAgency(SELLER_NAME_PREFIX, "kst", "trade-web-seller-10");
  check("arrange: seller agency created", !!seller.orgId, seller.orgId);

  const { itineraryId, compare, select } = await draftAndPersist(seller.jar, TRIP);
  check(
    "arrange: AI drafts budget-fit options then selectDraft persists an itinerary",
    compare.data?.status === "drafted" && select.data?.status === "drafted" && !!itineraryId,
    `draft=${compare.data?.status} select=${select.data?.status} id=${itineraryId}`,
  );

  // content-library: register an agent-upload asset and attach it to the gallery
  const MEDIA_URL = `https://images.example.test/kyoto-machiya-${runId}.jpg`;
  const MEDIA_ALT = `Machiya courtyard at dusk ${runId}`;
  const registered = await trpcMutate(seller.jar, "workspace.media.register", {
    source: "agent-upload",
    kind: "image",
    url: MEDIA_URL,
    alt: MEDIA_ALT,
  });
  const mediaAssetId = registered.data?.asset?.id;
  check(
    "arrange: seller registers an agent-upload library asset",
    registered.data?.status === "registered" && !!mediaAssetId,
    registered.text.slice(0, 200),
  );
  const attached = await trpcMutate(seller.jar, "workspace.itinerary.attachMedia", {
    itineraryId,
    mediaAssetId,
    target: { scope: "gallery" },
  });
  check("arrange: seller attaches the asset to the itinerary gallery", attached.data?.status === "attached", attached.text.slice(0, 200));
  const sellerDoc = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId });
  const sellerGallery = sellerDoc.data?.itinerary?.media ?? [];
  check(
    "arrange: the gallery round-trips through workspace.itinerary.get (kind/url/alt)",
    sellerGallery.some((m) => m.id === mediaAssetId && m.url === MEDIA_URL && m.alt === MEDIA_ALT),
    JSON.stringify(sellerGallery).slice(0, 250),
  );

  // vet + list on the marketplace with a revenue share
  psql(`INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('${seller.orgId}', 'scenario-operator') ON CONFLICT (agency_id) DO NOTHING`);
  const listed = await trpcMutate(seller.jar, "workspace.marketplace.createListing", {
    itineraryId,
    title: `Kyoto Slow Travel — 3 nights ${runId}`,
    priceMinor: LISTING_PRICE_MINOR,
    revenueShareBps: SELLER_SHARE_BPS,
    licenseTerms: SELLER_TERMS,
  });
  const listingId = listed.data?.listingId;
  check("arrange: vetted seller lists the media-bearing itinerary", listed.data?.status === "listed" && !!listingId, listed.text.slice(0, 250));

  const licensesBefore = Number(psql(`SELECT count(*) FROM marketplace_license`));
  const ledgerBefore = Number(psql(`SELECT count(*) FROM revenue_share_ledger`));

  // ══ Act 1: a reseller LICENSES + WHITE-LABELS (content-library × web × reseller)
  const reseller = await signUpAgency(RESELLER_NAME_PREFIX, "mbq", "trade-web-reseller-10");
  check("arrange: reseller agency created", !!reseller.orgId, reseller.orgId);
  // The licensor must itself be a vetted agency (createListing AND licenseListing
  // both gate on agency_vetting) — both sibling scenarios vet the reseller too.
  psql(`INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('${reseller.orgId}', 'scenario-operator') ON CONFLICT (agency_id) DO NOTHING`);

  const license = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  const copyId = license.data?.copyItineraryId;
  check("reseller: license yields a white-label copy", license.data?.status === "licensed" && !!copyId, license.text.slice(0, 300));

  // The license receipt conserves: price = platform_take + seller_credit (INV-012)
  const rc = license.data ?? {};
  check(
    `reseller: license receipt conserves (price ${rc.priceMinor} = platform_take ${rc.platformTakeMinor} + seller_credit ${rc.sellerCreditMinor})`,
    typeof rc.priceMinor === "number" &&
      rc.priceMinor === (rc.platformTakeMinor ?? NaN) + (rc.sellerCreditMinor ?? NaN),
    JSON.stringify(rc).slice(0, 250),
  );

  // The gallery carried VERBATIM into the reseller's copy (the core reseller cell)
  const copyDoc = await trpcQuery(reseller.jar, "workspace.itinerary.get", { itineraryId: copyId });
  const copyGallery = copyDoc.data?.itinerary?.media ?? [];
  check(
    "reseller: the white-label copy's gallery carries the seller's media VERBATIM (kind/url/alt)",
    copyGallery.some((m) => m.url === MEDIA_URL && m.alt === MEDIA_ALT),
    JSON.stringify(copyGallery).slice(0, 250),
  );

  // ══ Act 2: the SELLER sees their earnings, scoped (revenue-share × web × seller)
  const ledgerCredit = Number(
    psql(`SELECT COALESCE(sum(seller_credit_minor), 0) FROM revenue_share_ledger WHERE seller_agency_id = '${seller.orgId}'`),
  );
  const ledgerConservedRows = Number(
    psql(`SELECT count(*) FROM revenue_share_ledger WHERE seller_agency_id = '${seller.orgId}' AND platform_take_minor + seller_credit_minor <> price_minor`),
  );
  check("platform: revenue_share_ledger crediting the seller is conserved (INV-012, zero non-conserving rows)", ledgerConservedRows === 0, `${ledgerConservedRows} non-conserving rows`);

  const sellerBrowse = await trpcQuery(seller.jar, "workspace.marketplace.browseListings", undefined);
  const sellerCard = (sellerBrowse.data?.listings ?? []).find((l) => l.listingId === listingId);
  check(
    `seller: own listing card projects licenseCount=1 and sellerCreditTotalMinor=${ledgerCredit} (matches the ledger)`,
    !!sellerCard && sellerCard.licenseCount === 1 && sellerCard.sellerCreditTotalMinor === ledgerCredit && ledgerCredit > 0,
    `card=${JSON.stringify(sellerCard)?.slice(0, 250)} ledger=${ledgerCredit}`,
  );

  // Scoping: the RESELLER browsing the SAME listing sees the seller's earnings null
  const resellerBrowse = await trpcQuery(reseller.jar, "workspace.marketplace.browseListings", undefined);
  const resellerViewOfListing = (resellerBrowse.data?.listings ?? []).find((l) => l.listingId === listingId);
  check(
    "seller: another agency's browse of the SAME listing sees earnings null (no cross-agency leak)",
    !!resellerViewOfListing && resellerViewOfListing.licenseCount == null && resellerViewOfListing.sellerCreditTotalMinor == null,
    JSON.stringify(resellerViewOfListing)?.slice(0, 250),
  );

  // ══ Act 3: the CLIENT sees a branded trip, ZERO revenue-share leak ═══════
  const share = await trpcMutate(reseller.jar, "workspace.itinerary.share", { itineraryId: copyId });
  const token = share.data?.token;
  check("reseller: share link minted for the white-label copy", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  const anon = new Map();
  const view = await trpcQuery(anon, "clientView.itinerary", { token });
  const v = view.data?.view;
  check("client: token resolves to a found view anonymously", view.data?.status === "found" && !!v, view.text.slice(0, 300));
  check("client: white-label branding — agencyName is the RESELLER's agency", v?.agencyName === reseller.agencyName, `got ${JSON.stringify(v?.agencyName)}`);

  // The inherited gallery is visible to the client (the reseller's brand + the seller's content)
  const clientPayload = JSON.stringify(view.json ?? {});
  check(
    "client: the client sees the inherited gallery photo (url/alt) with NO internal media-asset id",
    clientPayload.includes(MEDIA_URL) && clientPayload.includes(MEDIA_ALT) && !clientPayload.includes(mediaAssetId),
    clientPayload.slice(0, 300),
  );

  // Revenue-share leak check — the exact SECRET VALUES must be absent, not just
  // the field names: the licenseTerms string, and the platform-take /
  // seller-credit amounts (both the minor integers and the client-formatted
  // decimals). Plus the revenue-share/net-rate field-name family.
  const takeMinorStr = String(rc.platformTakeMinor ?? "");
  const creditMinorStr = String(rc.sellerCreditMinor ?? "");
  const takeDecimal = (Number(rc.platformTakeMinor) / 100).toFixed(2); // e.g. "33.10"
  const creditDecimal = (Number(rc.sellerCreditMinor) / 100).toFixed(2);
  const leakNeedles = [
    ["licenseTerms string", SELLER_TERMS],
    [`platform-take minor (${takeMinorStr})`, takeMinorStr],
    [`seller-credit minor (${creditMinorStr})`, creditMinorStr],
    [`platform-take decimal (${takeDecimal})`, takeDecimal],
    [`seller-credit decimal (${creditDecimal})`, creditDecimal],
    ["field revenueShareBps", "revenueShareBps"],
    ["field platformTake", "platformTake"],
    ["field sellerCredit", "sellerCredit"],
    ["field licenseCount", "licenseCount"],
    ["field revenue_share", "revenue_share"],
    // INV-020 net-rate / markup / provenance family
    ["field netMinor", "netMinor"],
    ["field markupBps", "markupBps"],
    ["field provenance", "provenance"],
    ["field agencyId", "agencyId"],
  ];
  for (const [label, needle] of leakNeedles) {
    if (!needle) continue;
    check(`client: payload free of ${label} (revenue-share/INV-020 leak)`, !clientPayload.includes(needle), `leaked "${needle}"`);
  }
  check("client: payload never names the original seller agency (white-label promise)", !clientPayload.includes(SELLER_NAME_PREFIX));

  // ── Client (web): the SSR /view/<token> page carries the SAME boundary ───
  const page = await fetch(`${BASE}/view/${token}`);
  const html = await page.text();
  check("client web: /view/<token> serves 200", page.status === 200, `got ${page.status}`);
  check("client web: page carries the RESELLER's brand", html.includes(reseller.agencyName));
  const title = (html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? "";
  check(`client web: FULL surface free of platform branding incl. tab title (INV-020; title "${title}")`, !html.includes("TripForge"));
  check("client web: SSR page never names the original seller agency", !html.includes(SELLER_NAME_PREFIX));
  for (const [label, needle] of leakNeedles) {
    if (!needle) continue;
    check(`client web: SSR page free of ${label} (revenue-share/INV-020 leak)`, !html.includes(needle), `leaked "${needle}"`);
  }

  // ══ State conservation on the money path ════════════════════════════════
  const licensesAfter = Number(psql(`SELECT count(*) FROM marketplace_license`));
  const ledgerAfter = Number(psql(`SELECT count(*) FROM revenue_share_ledger`));
  check("conservation: exactly one marketplace_license row created by the primary license", licensesAfter === licensesBefore + 1, `${licensesBefore} -> ${licensesAfter}`);
  check("conservation: exactly one revenue_share_ledger row created (the seller's credit)", ledgerAfter === ledgerBefore + 1, `${ledgerBefore} -> ${ledgerAfter}`);

  // Companion-browser handles (printed for the live Playwright pass witnessing
  // the three WEB cells; harmless for the headless assertion run).
  console.log(
    "\nBROWSER_HANDLES " +
      JSON.stringify({
        sellerEmail: `kst-${runId}@example.test`,
        sellerPass: "trade-web-seller-10",
        resellerEmail: `mbq-${runId}@example.test`,
        resellerPass: "trade-web-reseller-10",
        token,
        copyId,
        listingId,
        viewPath: `/view/${token}`,
      }),
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
