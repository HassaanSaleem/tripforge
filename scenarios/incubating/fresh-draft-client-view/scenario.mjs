// Kitchen Loop iteration-6 T1 Foundation scenario: itinerary-builder's
// client-facing view of a FRESH, WHOLLY UN-BOOKED AI draft — the very first
// thing a real traveler ever sees, before a single item is booked.
//
// Coverage-matrix gap this fills: itinerary-builder x {api,web} x client was
// never declared in .kitchenloop/coverage-matrix.yaml even though the
// underlying behavior is well-tested (packages/api/src/__tests__/l3-client-view.test.ts
// US1; tests/e2e/client-view-journey.spec.ts) — those files sit outside
// derive-coverage.mjs's scan scope (packages/**/__tests__ isn't walked at
// all; the e2e spec predates the KITCHENLOOP-COVERAGE convention and never
// got one retrofitted). Codex feasibility check (iter 6) confirmed the
// happy path itself is not a gap and redirected to a narrower, genuinely
// unexercised angle: no existing test cross-references Postgres ground
// truth against BOTH the API payload and the rendered HTML in the SAME run.
// l3-client-view.test.ts checks payload-vs-DB-row; client-view-journey.spec.ts
// checks rendered-page-vs-UI-only; neither checks all three against each
// other. This scenario does that 3-way cross-check.
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, ground truth read directly from Postgres (bypassing the app
// layer entirely, per assemble.ts's "document is stored WHOLE as jsonb"),
// state-delta/value-equality assertions across all three surfaces.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/fresh-draft-client-view/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "itinerary-builder", "platform": "api", "user_type": "client", "result": "pass", "iteration": 6, "tier": "T1", "note": "anonymous clientView.itinerary on a wholly un-booked fresh draft matches the Postgres document row exactly (per-item sellMinor, total, all booked:false); full key+value confidentiality scan against the real stored row (not a re-query through the app layer)" },
//   { "feature": "itinerary-builder", "platform": "web", "user_type": "client", "result": "pass", "iteration": 6, "tier": "T1", "note": "rendered /view/{token} HTML for the same fresh draft matches the SAME Postgres ground truth (day heading, item titles, formatted total, 'includes estimates' note); no platform branding or confidential field-name/value leak in the raw HTML" }
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

/** Minimal cookie jar (same shape as golden-path-trade-live / partially-booked-client-view). */
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
/** Operator-side psql against the compose Postgres (support.ts arrangement). */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "tripforge", "-d", "tripforge", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

/** Formats integer minor units the way the share page does (e.g. 15250 -> "152.50"). */
const fmt = (minor) => (minor / 100).toFixed(2);

const TRIP = {
  destination: "Vienna",
  checkIn: "2026-10-05",
  checkOut: "2026-10-08",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 150_000, currency: "USD" },
};

async function main() {
  console.log(`Fresh-draft client-view scenario against ${BASE} (run ${runId})`);

  // ── Agent-seller drafts a fresh trip, mints a share link, books NOTHING ───
  const jar = new Map();
  const signUp = await api(jar, "POST", "/api/auth/sign-up/email", {
    email: `agent-${runId}@example.test`,
    password: "fresh-draft-pass-7",
    name: "Scenario Agent",
  });
  check("agent: sign-up succeeds", signUp.res.status === 200, `got ${signUp.res.status}`);
  const agencyName = `Vienna Voyages ${runId}`;
  const org = await api(jar, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: `vv-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("agent: agency created", !!orgId, org.text.slice(0, 200));
  await api(jar, "POST", "/api/auth/organization/set-active", { organizationId: orgId });

  // Spec 019 compare-then-choose: `draft` returns 1-3 NOT-YET-PERSISTED
  // options; `selectDraft` re-runs the pipeline for the picked variant and
  // is what actually persists the itinerary (memory: e2e support.ts helper
  // staleness — the old single-shot draft->persist flow this scenario was
  // first drafted against no longer exists).
  const compare = await trpcSubscribe(jar, "workspace.itinerary.draft", TRIP);
  const options = compare.data?.options ?? [];
  check("agent: AI compare view returns budget-fit options", compare.data?.status === "drafted" && options.length > 0, compare.text.slice(0, 300));
  const picked = options.find((o) => o.variant === "balanced") ?? options[0];
  check("agent: a 'balanced' (or fallback) option is available to pick", !!picked, JSON.stringify(options.map((o) => o.variant)));

  const select = await trpcSubscribe(jar, "workspace.itinerary.selectDraft", {
    tripRequest: TRIP,
    variant: picked.variant,
  });
  const itineraryId = select.data?.itinerary?.id;
  check("agent: selecting the option persists an itinerary", select.data?.status === "drafted" && !!itineraryId, select.text.slice(0, 300));

  const share = await trpcMutate(jar, "workspace.itinerary.share", { itineraryId });
  const token = share.data?.token;
  check("agent: share link minted", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  // ── Ground truth: read the stored document DIRECTLY from Postgres — no
  // app-layer re-query, so this is a genuinely independent oracle for both
  // surfaces below (the specific gap Codex's feasibility redirect flagged:
  // no existing test cross-checks the DB row against BOTH surfaces at once).
  const rawDocument = psql(`SELECT document FROM itinerary WHERE id = '${itineraryId}'`);
  let document = null;
  try {
    document = JSON.parse(rawDocument);
  } catch (err) {
    check("db: itinerary document is valid JSON", false, `${err}`);
  }
  const docItems = (document?.days ?? []).flatMap((d) => d.items ?? []);
  const pricedItems = docItems.filter((i) => i.pricing?.sellPrice);
  check("db: the fresh draft has priced items to work with", pricedItems.length >= 3, `only ${pricedItems.length} priced items`);
  check("db: nothing has been booked yet (zero booking_component rows)", psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`) === "0");
  const expectedTotal = pricedItems.reduce((sum, i) => sum + i.pricing.sellPrice.amountMinor, 0);

  const anon = new Map(); // the traveler has no session — ever

  // ── Surface 1 (api, client): anonymous clientView.itinerary vs Postgres ───
  const view = await trpcQuery(anon, "clientView.itinerary", { token });
  const v = view.data?.view;
  check("api: token resolves anonymously", view.data?.status === "found" && !!v, view.text.slice(0, 300));
  const viewItems = (v?.days ?? []).flatMap((d) => d.items);
  check("api: agencyName matches what the agent set at sign-up", v?.agencyName === agencyName, `got ${v?.agencyName}`);
  check(
    "api: item count matches the Postgres document exactly",
    viewItems.length === docItems.length,
    `view ${viewItems.length} vs document ${docItems.length}`,
  );
  check(
    "api: every item is un-booked (booked:false) -- nothing has been booked yet",
    viewItems.length > 0 && viewItems.every((i) => i.booked === false),
    JSON.stringify(viewItems.map((i) => i.booked)),
  );
  check(
    `api: total is EXACTLY the Postgres-computed fold (${expectedTotal})`,
    v?.totalSellMinor === expectedTotal,
    `got ${v?.totalSellMinor}`,
  );
  // Per-item price cross-check, positionally paired (the view carries no ids).
  docItems.forEach((docItem, idx) => {
    const expected = docItem.pricing?.sellPrice.amountMinor ?? null;
    check(
      `api: item ${idx + 1} sellMinor matches the Postgres row (${expected})`,
      viewItems[idx]?.sellMinor === expected,
      `got ${viewItems[idx]?.sellMinor}`,
    );
  });

  // Confidentiality: no forbidden KEY anywhere in the payload…
  const payload = JSON.stringify(view.data);
  for (const forbiddenKey of [
    "netRate",
    "netMinor",
    "markup",
    "supplyRef",
    "externalId",
    "provenance",
    "budgetMode",
    "allocated",
    "tripRequest",
    "agencyId",
    "schemaVersion",
  ]) {
    check(`api: payload key-scan clean of "${forbiddenKey}"`, !payload.includes(forbiddenKey));
  }
  // …and no confidential VALUE read straight from the Postgres row (exact-leaf
  // comparison against the SAME row this scenario queried above, not a
  // re-fetch through the app layer).
  const confidential = [document?.id, document?.agencyId ?? orgId];
  for (const item of docItems) {
    confidential.push(item.id);
    if (item.supplyRef?.externalId) confidential.push(item.supplyRef.externalId);
  }
  for (const secret of confidential.filter(Boolean)) {
    check(`api: confidential value "${secret}" absent from the traveler payload`, !payload.includes(String(secret)));
  }

  // ── Surface 2 (web, client): rendered /view/{token} HTML vs Postgres ──────
  const pageRes = await fetch(`${BASE}/view/${token}`);
  const page = await pageRes.text();
  check("web: /view/{token} responds 200", pageRes.status === 200, `got ${pageRes.status}`);
  // React SSR splits adjacent text/expression nodes with an `<!-- -->`
  // hydration-boundary comment (e.g. "Day <!-- -->1"), so a raw "Day 1"
  // substring check would false-negative here — strip comments first.
  const rendered = page.split("self.__next_f")[0].replace(/<!--[\s\S]*?-->/g, ""); // SSR body, before the RSC stream
  check("web: page shows Day 1", /Day\s*1/.test(rendered));
  check("web: page shows the agency's brand name", rendered.includes(agencyName));
  for (const item of docItems) {
    check(`web: item title "${item.title}" renders on the page`, page.includes(item.title));
  }
  check(`web: total renders as ${fmt(expectedTotal)}, matching the Postgres fold`, page.includes(fmt(expectedTotal)));
  check("web: total is honest that it includes estimates (nothing booked yet)", /includes estimates/.test(rendered));
  check("web: no item is marked Booked (nothing has been booked yet)", !/tf-client-booked/.test(page));

  // Platform-branding and confidential field-name leak scan on the RAW HTML —
  // the SAME check the API surface ran, cross-referenced on a second, wholly
  // independent rendering path (SSR HTML, not JSON).
  check("web: page never names the platform (INV-020)", !/TripForge|Trellis/i.test(page));
  for (const forbidden of ["netRate", "netMinor", "markupBps", "supplyRef", "budgetMode", "provenance"]) {
    check(`web: rendered HTML clean of "${forbidden}"`, !page.includes(forbidden));
  }
  for (const secret of confidential.filter(Boolean)) {
    check(`web: confidential value "${secret}" absent from the rendered HTML`, !page.includes(String(secret)));
  }

  // ── Cross-surface agreement: DB, API, and HTML all agree on the same total
  check(
    "cross-surface: Postgres total == api total == web-rendered total",
    expectedTotal === v?.totalSellMinor && page.includes(fmt(expectedTotal)),
    `db=${expectedTotal} api=${v?.totalSellMinor}`,
  );

  // ── Unknown token: typed unavailable state on BOTH surfaces, no oracle ────
  const bogus = await trpcQuery(anon, "clientView.itinerary", { token: "00000000-0000-4000-8000-000000000000" });
  check(
    "api: unknown token resolves to the typed unavailable state",
    bogus.res.status === 200 && bogus.data?.status !== "found" && !bogus.data?.view,
    bogus.text.slice(0, 200),
  );
  const bogusPageRes = await fetch(`${BASE}/view/00000000-0000-4000-8000-000000000000`);
  const bogusPage = await bogusPageRes.text();
  check("web: unknown token renders the neutral unavailable state", /isn.t available/i.test(bogusPage) || /not available/i.test(bogusPage));
  check("web: unknown-token page still never names the platform", !/TripForge|Trellis/i.test(bogusPage));

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
