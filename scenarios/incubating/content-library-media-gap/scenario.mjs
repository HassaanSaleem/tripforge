// Kitchen Loop iteration-3 SECOND-PASS scenario (T3 Frontier; feature
// content-library; platforms web+api; user_types agent-seller + agent-reseller
// + client): the PRD Pillar-1 "content/media library" promise — attach licensed
// media to an itinerary, preview the branded client view with a gallery — does
// not exist as a product surface yet. This scenario VERIFIES THE GAP and pins
// the behavior of every path that DOES exist for media-bearing canonical
// documents:
//
//   1. No API affordance: the draft input refuses a `media` key typed (strict
//      schema), and nothing else on workspace.itinerary accepts media.
//   2. Dormant schema: a fresh draft's canonical document round-trips with
//      media fields defaulted ([]), agent-readable via workspace.itinerary.get.
//   3. Valid media-bearing documents (arranged operator-side, the same psql
//      pattern as vetting) flow through every existing read path without
//      breaking: agent get, share-link mint, public clientView.itinerary,
//      /view SSR page.
//   4. The traveler trust boundary HOLDS: the client-view payload and page are
//      structurally free of media keys and sentinel values (allowlist
//      projection, spec 010 FR-007) — meaning a client-facing gallery needs a
//      deliberate allowlist decision, not just an attach UI.
//   5. Marketplace propagation: licensing a media-bearing listing carries the
//      gallery VERBATIM into the white-label copy — including agent-upload
//      attribution naming the ORIGINAL agency. Pins today's factual behavior;
//      whether copies SHOULD inherit media (rights model) is a frontier
//      question for the report, not an assertion here.
//   6. Provenance enforcement at the read boundary (INV-001, D-006.c): an
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
const STOCK_SENTINEL = "eiffel-dusk-sentinel.jpg";
const UPLOAD_SENTINEL = "meridian-walking-tour-sentinel.jpg";
const UPLOAD_ATTRIBUTION = "© Meridian media desk (author agency)";
const VALID_GALLERY = [
  {
    id: "media-stock-1",
    kind: "image",
    storageKey: `agency-media/${STOCK_SENTINEL}`,
    source: "licensed-stock",
    alt: "Eiffel Tower at dusk",
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
  console.log(`Content-library media-gap scenario against ${BASE} (run ${runId})`);

  // ── 1. No API affordance: strict input refuses a media key ───────────────
  const seller = await onboardAgent("seller", `Meridian Media ${runId}`);

  const smuggled = await trpcMutate(seller.jar, "workspace.itinerary.draft", {
    ...TRIP,
    media: VALID_GALLERY,
  });
  check(
    "gap: draft input REFUSES a media key typed (strict schema — no hidden attach affordance)",
    smuggled.data === null && smuggled.res.status !== 200,
    `status ${smuggled.res.status}: ${smuggled.text.slice(0, 200)}`,
  );
  const rowsAfterRefusal = psql(`SELECT count(*) FROM itinerary WHERE agency_id = '${seller.orgId}'`);
  check("gap: the refused draft persisted nothing", rowsAfterRefusal === "0", `${rowsAfterRefusal} rows`);

  // ── 2. Dormant schema: fresh drafts round-trip defaulted media fields ────
  const draft = await trpcMutate(seller.jar, "workspace.itinerary.draft", TRIP);
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
      gallery.some((m) => m.source === "licensed-stock" && m.storageKey?.includes(STOCK_SENTINEL)) &&
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
    'trust boundary: clientView payload is structurally free of media ("media" key + all sentinel values absent)',
    !payload.includes('"media"') && !payload.includes(STOCK_SENTINEL) && !payload.includes(UPLOAD_SENTINEL) &&
      !payload.includes(UPLOAD_ATTRIBUTION),
    payload.slice(0, 300),
  );

  const viewPage = await api(new Map(), "GET", `/view/${token}`);
  check(
    "trust boundary: /view SSR page renders (200) and carries no media sentinels",
    viewPage.res.status === 200 && viewPage.text.includes(freshDoc.title) &&
      !viewPage.text.includes(STOCK_SENTINEL) && !viewPage.text.includes(UPLOAD_SENTINEL),
    `status ${viewPage.res.status}`,
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
  const draft2 = await trpcMutate(seller.jar, "workspace.itinerary.draft", TRIP);
  const badItineraryId = draft2.data?.itinerary?.id;
  const share2 = await trpcMutate(seller.jar, "workspace.itinerary.share", { itineraryId: badItineraryId });
  const badToken = share2.data?.token;
  check("arrange: second draft + share link exist before invalid-media arrangement", !!badItineraryId && !!badToken);

  setDocumentMedia(badItineraryId, INVALID_GALLERY);

  const badGet = await trpcQuery(seller.jar, "workspace.itinerary.get", { itineraryId: badItineraryId });
  check(
    "boundary: agent get REFUSES a document whose media source is outside the closed licensed enum",
    badGet.data === null,
    `status ${badGet.res.status}: ${badGet.text.slice(0, 200)}`,
  );

  const badPublic = await trpcQuery(new Map(), "clientView.itinerary", { token: badToken });
  const badPayload = JSON.stringify(badPublic.json ?? {});
  check(
    "boundary: public clientView never serves the scraped sentinel (refusal, not a found view)",
    badPublic.data?.status !== "found" && !badPayload.includes(SCRAPED_SENTINEL),
    `status ${badPublic.res.status}: ${badPayload.slice(0, 200)}`,
  );

  const badPage = await api(new Map(), "GET", `/view/${badToken}`);
  check(
    "boundary: /view page never renders the scraped sentinel",
    !badPage.text.includes(SCRAPED_SENTINEL),
    `status ${badPage.res.status}`,
  );
  console.log(
    `  note refusal failure modes (report material): get=${badGet.res.status}, clientView=${badPublic.res.status}, /view=${badPage.res.status}`,
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(failures === 0 ? "\nContent-library media-gap scenario PASSED." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(2);
});
