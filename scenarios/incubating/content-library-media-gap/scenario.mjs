// Kitchen Loop scenario (feature content-library; platforms web+api;
// user_types agent-seller + agent-reseller + client). ORIGIN: iteration-3
// second pass verified the PRD Pillar-1 "content/media library" promise had
// NO product surface — this scenario pinned the gap. Seed-0022 (spec 015)
// LANDED v0: a media library (register/list), itinerary attach/detach, and a
// deliberate client-view allowlist amendment. This revision flips the
// gap-verification checks to AFFORDANCE checks proving v0 works end-to-end,
// while STRENGTHENING (never weakening) the trust-boundary checks: the client
// view now legitimately carries `{kind,url,alt}` for url-bearing media, but
// internal ids, `source`, `attribution`, and storageKey-only refs (v0 has no
// CDN resolution — URL-registration only, research D2) still never cross.
//
//   1. Scoping (unchanged from the original pin): `workspace.itinerary.draft`
//      still refuses a `media` key — attach is its OWN dedicated mutation,
//      never smuggled through draft input.
//   2. Dormant-no-longer: a fresh draft's canonical document still defaults
//      media to [] (nothing attached yet) but the real product path (register
//      → attachMedia) now populates it — proven end-to-end, not arranged.
//   3. Trust boundary (STRENGTHENED): the client-view payload and /view page
//      DELIBERATELY carry the attached media's `kind`/`url`/`alt` (spec 015
//      FR-009/FR-010) — but never the internal media-asset id, `source`
//      label, `attribution` string, or a storageKey-only ref (no url = no
//      CDN resolution in v0 = correctly absent, not a gap anymore, a scoped
//      boundary).
//   4. Marketplace propagation: licensing a media-bearing listing carries the
//      gallery VERBATIM into the white-label copy — including agent-upload
//      attribution naming the ORIGINAL agency. Pins today's factual behavior;
//      whether copies SHOULD inherit media (rights model) is a frontier
//      question for the report, not an assertion here (seed-0023, unresolved).
//   5. Provenance enforcement at the read boundary (INV-001, D-006.c): an
//      arranged document whose media `source` is outside the closed licensed
//      enum ("scraped-web") is REFUSED on read — the agent surface errors and
//      the traveler surface never serves the scraped sentinel.
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, STATE-DELTA assertions against the platform's own stored
// documents (psql) and public payloads.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/content-library-media-gap/scenario.mjs
// Exit 0 = every pinned behavior holds; non-zero = a real regression.

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "content-library", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T3", "note": "draft refuses media key typed; dormant media fields round-trip []; scraped-web source refused on read (D-006.c); no attach affordance exists (the gap)" },
//   { "feature": "content-library", "platform": "api", "user_type": "agent-reseller", "result": "pass", "iteration": 3, "tier": "T3", "note": "licensing a media-bearing listing succeeds; white-label copy carries the gallery verbatim incl. original agency's agent-upload attribution" },
//   { "feature": "content-library", "platform": "api", "user_type": "client", "result": "pass", "iteration": 5, "tier": "T3", "note": "seed-0034 fix: STOCK_URL_FILENAME and STOCK_STORAGE_SENTINEL are now distinct fixture filenames, so the FR-009 url-presence check and the FR-010 storageKey-absence check no longer contradict each other; re-verified live against the built compose image, both checks pass" },
//   { "feature": "content-library", "platform": "web", "user_type": "client", "result": "pass", "iteration": 5, "tier": "T3", "note": "seed-0034 fix: same fixture fix as the api/client entry (STOCK_URL_FILENAME vs STOCK_STORAGE_SENTINEL), on the /view SSR page's copy of the check; re-verified live, both checks pass" }
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
/** tRPC query over HTTP GET (single, non-batched). */
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
/** Arrange a media gallery on a stored canonical document (operator-side —
 * there is deliberately NO product path for this yet; that absence is the gap
 * this scenario documents). */
function setDocumentMedia(itineraryId, mediaJson) {
  psql(
    `UPDATE itinerary SET document = jsonb_set(document, '{media}', '${JSON.stringify(mediaJson).replaceAll("'", "''")}'::jsonb) WHERE id = '${itineraryId}'`,
  );
}

async function onboardAgent(label, agencyName) {
  const jar = new Map();
  const signUp = await api(jar, "POST", "/api/auth/sign-up/email", {
    email: `${label}-${runId}@example.test`,
    password: "media-gap-pass-9",
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

// Sentinel-bearing VALID gallery: both refs are inside the closed licensed enum
// (D-006.c); the agent-upload attribution names the authoring agency — the
// value whose verbatim travel into a white-label copy is the rights question.
// The stock entry ALSO carries a `url` (v0's URL-registration model, research
// D2) so the trust-boundary section below can prove the client-view now
// legitimately renders it — the upload entry stays storageKey-ONLY to prove
// v0 still correctly has no CDN resolution for that path (a scoped boundary,
// not a gap).
// Two DISTINCT filenames on purpose (seed-0034): STOCK_URL_FILENAME legitimately
// crosses the trust boundary (FR-009 affordance) while STOCK_STORAGE_SENTINEL
// lives only in the internal storageKey and must never cross (FR-010). They used
// to share one constant, so STOCK_URL's required presence made the "sentinel
// absent" leak check unsatisfiable by construction (not a real leak).
const STOCK_URL_FILENAME = "eiffel-dusk-view.jpg";
const STOCK_URL = `https://images.example.test/${STOCK_URL_FILENAME}`;
const STOCK_STORAGE_SENTINEL = "eiffel-dusk-storagekey-only-sentinel.jpg";
const UPLOAD_SENTINEL = "meridian-walking-tour-sentinel.jpg";
const UPLOAD_ATTRIBUTION = "© Meridian media desk (author agency)";
const STOCK_ALT = "Eiffel Tower at dusk";
const VALID_GALLERY = [
  {
    id: "media-stock-1",
    kind: "image",
    storageKey: `agency-media/${STOCK_STORAGE_SENTINEL}`,
    url: STOCK_URL,
    source: "licensed-stock",
    alt: STOCK_ALT,
    attribution: "Licensed stock / A. Photographe",
  },
  {
    id: "media-upload-2",
    kind: "image",
    storageKey: `agency-media/${UPLOAD_SENTINEL}`,
    source: "agent-upload",
    alt: "Guests on the authoring agency's walking tour",
    attribution: UPLOAD_ATTRIBUTION,
  },
];
// Outside the closed enum — the class D-006.c exists to keep out.
const SCRAPED_SENTINEL = "eiffel-scraped-sentinel.jpg";
const INVALID_GALLERY = [
  {
    id: "media-bad-1",
    kind: "image",
    storageKey: `scraped/${SCRAPED_SENTINEL}`,
    source: "scraped-web",
    alt: "Scraped imagery must never validate",
  },
];

async function main() {
  console.log(`Content-library v0 affordance + trust-boundary scenario against ${BASE} (run ${runId})`);

  // ── 1. Scoping: draft refuses media; attach is its OWN mutation (unchanged
  //      pin from the original gap scenario — still correct after seed-0022)
  const seller = await onboardAgent("seller", `Meridian Media ${runId}`);

  const smuggled = await trpcSubscribe(seller.jar, "workspace.itinerary.draft", {
    ...TRIP,
    media: VALID_GALLERY,
  });
  // Subscription-type responses (spec 016, INV-028) always answer HTTP 200 —
  // a typed rejection is a serialized-error SSE frame in the body, not an
  // HTTP status code (unlike the old mutation's plain JSON error response).
  check(
    "scoping: draft input REFUSES a media key (strict schema — attach is workspace.itinerary.attachMedia, not draft)",
    smuggled.data === null && smuggled.error?.data?.code === "BAD_REQUEST",
    `error ${JSON.stringify(smuggled.error)}: ${smuggled.text.slice(0, 200)}`,
  );
  const rowsAfterRefusal = psql(`SELECT count(*) FROM itinerary WHERE agency_id = '${seller.orgId}'`);
  check("gap: the refused draft persisted nothing", rowsAfterRefusal === "0", `${rowsAfterRefusal} rows`);

  // ── 2. Dormant schema: fresh drafts round-trip defaulted media fields ────
  // Spec 019 compare-then-choose: draft RETURNS options (persists nothing);
  // selectDraft persists the chosen one and answers with the itinerary.
  const draftCompare = await trpcSubscribe(seller.jar, "workspace.itinerary.draft", TRIP);
  const draftVariant = (draftCompare.data?.options ?? []).find((o) => o.variant === "balanced")?.variant ?? draftCompare.data?.options?.[0]?.variant ?? "balanced";
  const draft = await trpcSubscribe(seller.jar, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: draftVariant });
  const itineraryId = draft.data?.itinerary?.id;
  check("seller: AI draft persists an itinerary", draft.data?.status === "drafted" && !!itineraryId, draft.text.slice(0, 300));

  const freshGet = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId });
  const freshDoc = freshGet.data?.itinerary;
  check(
    "dormant: canonical document carries media fields, empty by default (gallery + every item)",
    Array.isArray(freshDoc?.media) && freshDoc.media.length === 0 &&
      (freshDoc?.days ?? []).every((d) => (d.items ?? []).every((i) => Array.isArray(i.media) && i.media.length === 0)),
    JSON.stringify({ media: freshDoc?.media, firstItem: freshDoc?.days?.[0]?.items?.[0]?.media }),
  );

  // ── 3. Valid media-bearing documents flow through every existing path ────
  setDocumentMedia(itineraryId, VALID_GALLERY);

  const mediaGet = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId });
  const gallery = mediaGet.data?.itinerary?.media ?? [];
  check(
    "agent surface: workspace.itinerary.get returns the media-bearing document intact (INV-001 re-validation passes)",
    gallery.length === 2 &&
      gallery.some((m) => m.source === "licensed-stock" && m.storageKey?.includes(STOCK_STORAGE_SENTINEL)) &&
      gallery.some((m) => m.source === "agent-upload" && m.attribution === UPLOAD_ATTRIBUTION),
    JSON.stringify(gallery).slice(0, 300),
  );

  const share = await trpcMutate(seller.jar, "workspace.itinerary.share", { itineraryId });
  const token = share.data?.token;
  check("share: media-bearing itinerary mints a share link", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  const publicView = await trpcQuery(new Map(), "clientView.itinerary", { token });
  const payload = JSON.stringify(publicView.json ?? {});
  check(
    "trust boundary: public clientView payload resolves found for a media-bearing document",
    publicView.data?.status === "found" && publicView.data?.view?.title,
    publicView.text.slice(0, 200),
  );
  check(
    "affordance (spec 015 FR-009): clientView payload carries the url-bearing gallery item — kind/url/alt allowlist-projected",
    payload.includes(STOCK_URL) && payload.includes(STOCK_ALT),
    payload.slice(0, 300),
  );
  check(
    "trust boundary (STRENGTHENED, FR-010): clientView never leaks internal media ids, source labels, attribution, or a storageKey-only ref (no url = no CDN resolution in v0)",
    !payload.includes("media-stock-1") &&
      !payload.includes("media-upload-2") &&
      !payload.includes("licensed-stock") &&
      !payload.includes("agent-upload") &&
      !payload.includes(UPLOAD_ATTRIBUTION) &&
      !payload.includes(STOCK_STORAGE_SENTINEL) && // the storageKey path, not the url — never crosses
      !payload.includes(UPLOAD_SENTINEL), // storageKey-only entry — no url, correctly absent entirely
    payload.slice(0, 300),
  );

  const viewPage = await api(new Map(), "GET", `/view/${token}`);
  check(
    "affordance: /view SSR page renders (200) and shows the url-bearing gallery image + its alt text",
    viewPage.res.status === 200 && viewPage.text.includes(freshDoc.title) &&
      viewPage.text.includes(STOCK_URL) && viewPage.text.includes(STOCK_ALT),
    `status ${viewPage.res.status}`,
  );
  check(
    "trust boundary (STRENGTHENED): /view page never renders internal ids, source labels, attribution, or the storageKey-only entry's sentinel",
    !viewPage.text.includes("media-stock-1") &&
      !viewPage.text.includes("licensed-stock") &&
      !viewPage.text.includes("agent-upload") &&
      !viewPage.text.includes(UPLOAD_ATTRIBUTION) &&
      !viewPage.text.includes(STOCK_STORAGE_SENTINEL) &&
      !viewPage.text.includes(UPLOAD_SENTINEL),
    `status ${viewPage.res.status}`,
  );

  // ── 3b. The REAL product path (spec 015), not psql arrangement: register →
  //       attachMedia → get → share → client render, end to end.
  const REAL_URL = `https://images.example.test/real-path-${runId}.jpg`;
  const REAL_ALT = `Real product-path photo ${runId}`;
  const registered = await trpcMutate(seller.jar, "workspace.media.register", {
    source: "agent-upload",
    kind: "image",
    url: REAL_URL,
    alt: REAL_ALT,
  });
  const mediaAssetId = registered.data?.asset?.id;
  check(
    "affordance: workspace.media.register persists a library asset",
    registered.data?.status === "registered" && !!mediaAssetId,
    registered.text.slice(0, 200),
  );

  const draft3Compare = await trpcSubscribe(seller.jar, "workspace.itinerary.draft", TRIP);
  const draft3Variant = (draft3Compare.data?.options ?? []).find((o) => o.variant === "balanced")?.variant ?? draft3Compare.data?.options?.[0]?.variant ?? "balanced";
  const draft3 = await trpcSubscribe(seller.jar, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: draft3Variant });
  const realItineraryId = draft3.data?.itinerary?.id;
  const attached = await trpcMutate(seller.jar, "workspace.itinerary.attachMedia", {
    itineraryId: realItineraryId,
    mediaAssetId,
    target: { scope: "gallery" },
  });
  check(
    "affordance: workspace.itinerary.attachMedia attaches the registered asset to the gallery",
    attached.data?.status === "attached",
    attached.text.slice(0, 200),
  );

  const realGet = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId: realItineraryId });
  const realGallery = realGet.data?.itinerary?.media ?? [];
  check(
    "affordance: the attachment round-trips through workspace.itinerary.get",
    realGallery.some((m) => m.id === mediaAssetId && m.url === REAL_URL),
    JSON.stringify(realGallery).slice(0, 200),
  );

  const realShare = await trpcMutate(seller.jar, "workspace.itinerary.share", { itineraryId: realItineraryId });
  const realToken = realShare.data?.token;
  const realPublic = await trpcQuery(new Map(), "clientView.itinerary", { token: realToken });
  const realPayload = JSON.stringify(realPublic.json ?? {});
  check(
    "affordance: the client sees the real-product-path photo (kind/url/alt) with no internal id",
    realPayload.includes(REAL_URL) && realPayload.includes(REAL_ALT) && !realPayload.includes(mediaAssetId),
    realPayload.slice(0, 300),
  );

  const detached = await trpcMutate(seller.jar, "workspace.itinerary.detachMedia", {
    itineraryId: realItineraryId,
    mediaRefId: mediaAssetId,
    target: { scope: "gallery" },
  });
  const afterDetachGet = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId: realItineraryId });
  check(
    "affordance: detachMedia removes the attachment — the library asset itself survives (workspace.media.list still has it)",
    detached.data?.status === "detached" && (afterDetachGet.data?.itinerary?.media ?? []).length === 0,
    JSON.stringify(afterDetachGet.data?.itinerary?.media).slice(0, 200),
  );
  const libraryAfterDetach = await trpcQuery(seller.jar, "workspace.media.list", undefined);
  check(
    "affordance: the library asset is not deleted by detach",
    (libraryAfterDetach.data?.assets ?? []).some((a) => a.id === mediaAssetId),
    JSON.stringify(libraryAfterDetach.data?.assets).slice(0, 200),
  );

  // ── 4. Marketplace: the gallery travels VERBATIM into the licensed copy ──
  vetAgency(seller.orgId);
  const listed = await trpcMutate(seller.jar, "workspace.marketplace.createListing", {
    itineraryId,
    title: `Paris with gallery ${runId}`,
    priceMinor: 25_000,
    licenseTerms: "White-label permitted; media rights UNSPECIFIED (the gap).",
    revenueShareBps: 1000,
  });
  const listingId = listed.data?.listingId;
  check(
    "marketplace: a media-bearing itinerary lists (stamp + re-validate tolerate the gallery)",
    listed.data?.status === "listed" && !!listingId,
    listed.text.slice(0, 200),
  );

  const reseller = await onboardAgent("reseller", `Nomad Media ${runId}`);
  vetAgency(reseller.orgId);
  const license = await trpcMutate(reseller.jar, "workspace.marketplace.licenseListing", { listingId });
  const copyId = license.data?.copyItineraryId;
  check("marketplace: reseller licenses the media-bearing listing", license.data?.status === "licensed" && !!copyId, license.text.slice(0, 200));

  const copyMedia = JSON.parse(psql(`SELECT document -> 'media' FROM itinerary WHERE id = '${copyId}'`) || "[]");
  check(
    "PIN (frontier rights gap): the white-label copy carries the gallery VERBATIM — including the ORIGINAL agency's agent-upload attribution",
    Array.isArray(copyMedia) && copyMedia.length === 2 &&
      copyMedia.some((m) => m.source === "agent-upload" && m.attribution === UPLOAD_ATTRIBUTION),
    JSON.stringify(copyMedia).slice(0, 300),
  );

  // ── 5. Closed-enum enforcement at the read boundary (INV-001, D-006.c) ───
  // Separate itinerary so the arranged-invalid document can't contaminate the
  // checks above; share link minted BEFORE the arrangement (mint re-reads the
  // document too).
  const draft2Compare = await trpcSubscribe(seller.jar, "workspace.itinerary.draft", TRIP);
  const draft2Variant = (draft2Compare.data?.options ?? []).find((o) => o.variant === "balanced")?.variant ?? draft2Compare.data?.options?.[0]?.variant ?? "balanced";
  const draft2 = await trpcSubscribe(seller.jar, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: draft2Variant });
  const badItineraryId = draft2.data?.itinerary?.id;
  const share2 = await trpcMutate(seller.jar, "workspace.itinerary.share", { itineraryId: badItineraryId });
  const badToken = share2.data?.token;
  check("arrange: second draft + share link exist before invalid-media arrangement", !!badItineraryId && !!badToken);

  setDocumentMedia(badItineraryId, INVALID_GALLERY);

  // seed-0021: the refusal is TYPED payload data (HTTP 200), never a raw 500 —
  // this scenario used to pin `badGet.data === null` (the crash: tRPC error
  // responses carry no `result.data`). That was the false-confidence class
  // itself pinned as "correct" behavior; it is now REPLACED (not weakened)
  // with a stricter assertion on the typed diagnostic shape.
  const badGet = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId: badItineraryId });
  check(
    "boundary: agent get returns a TYPED diagnostic for a document outside the closed licensed enum (no raw 500)",
    badGet.res.status === 200 &&
      badGet.data?.status === "invalid" &&
      typeof badGet.data?.diagnostic === "string" &&
      badGet.data.diagnostic.length > 0,
    `status ${badGet.res.status}: ${badGet.text.slice(0, 200)}`,
  );

  const badPublic = await trpcQuery(new Map(), "clientView.itinerary", { token: badToken });
  const badPayload = JSON.stringify(badPublic.json ?? {});
  check(
    "boundary: public clientView returns the SAME typed not_found as an unknown token (no raw 500, no existence oracle)",
    badPublic.res.status === 200 && badPublic.data?.status === "not_found" && !badPayload.includes(SCRAPED_SENTINEL),
    `status ${badPublic.res.status}: ${badPayload.slice(0, 200)}`,
  );

  const badPage = await api(new Map(), "GET", `/view/${badToken}`);
  check(
    "boundary: /view page renders the branded unavailable state (HTTP 200, not a crash page) and never the scraped sentinel",
    badPage.res.status === 200 &&
      badPage.text.includes("Ask your travel agent for a fresh") && // apostrophe-free substring of the unavailable copy
      !badPage.text.includes(SCRAPED_SENTINEL),
    `status ${badPage.res.status}`,
  );
  console.log(
    `  note refusal shapes (report material): get=${badGet.res.status} ${badGet.data?.status}, clientView=${badPublic.res.status} ${badPublic.data?.status}, /view=${badPage.res.status}`,
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(failures === 0 ? "\nContent-library v0 scenario PASSED." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
