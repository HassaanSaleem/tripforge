// L3 integration smoke (unbeatable-tests L3 + INV-027). Runs against a REAL running
// stack (the built compose image or `next start` + compose Postgres) — never a mock.
// Proves: the server boots, routes resolve, middleware runs, Postgres is reachable,
// real actions cause EXACT state deltas, failure paths conserve state, and the PMF
// metric read models (spec 004) exist and compute correct numbers.
//
// Usage:  BASE_URL=http://localhost:3000 node tests/integration/smoke.mjs
// Exit 0 = all assertions pass; non-zero = a real failure (nothing is skipped silently).
import {
  snapshotTables,
  assertDelta,
  assertConserved,
  createHttpSession,
  sql,
} from "./harness.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// The oracle is a gate — a hang is a red, not a wait (SC-001: bounded < 60 s).
const GLOBAL_BUDGET_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function get(path) {
  return fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

function postJson(path, body) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    // Better Auth CSRF-checks the Origin on state-changing requests, and node's
    // fetch advertises itself as a CORS caller (sec-fetch-mode) without one —
    // send the base origin like a real browser would (same as scenario.mjs).
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

// ─── PMF fixture verification (spec 004 contracts §6 check 8) ─────────────────
// One psql session: clear + insert fixtures INSIDE a transaction, read every
// metric view, roll back, and prove no residue. The in-tx DELETE makes the
// expected numbers exact regardless of pre-existing events (MVCC keeps other
// sessions unaffected; ROLLBACK restores everything).
const PMF_FIXTURE_SQL = `
\\echo MARK:pre
SELECT COUNT(*) AS n FROM pmf_event;
BEGIN;
DELETE FROM pmf_event;
INSERT INTO organization (id, name, slug) VALUES
  ('l3fix-a1', 'L3 Fixture Agency 1', 'l3fix-a1'),
  ('l3fix-a2', 'L3 Fixture Agency 2', 'l3fix-a2');
INSERT INTO pmf_event (type, agency_id, itinerary_id, source, amount_minor, currency) VALUES
  ('trip_created',      'l3fix-a1', 'l3fix-i1', 'self_built', NULL,   NULL),
  ('trip_created',      'l3fix-a1', 'l3fix-i2', 'licensed',   NULL,   NULL),
  ('trip_created',      'l3fix-a2', 'l3fix-i3', 'self_built', NULL,   NULL),
  ('booking_confirmed', 'l3fix-a1', 'l3fix-i1', NULL,         250000, 'USD'),
  ('booking_confirmed', 'l3fix-a2', 'l3fix-i3', NULL,         100000, 'EUR'),
  ('take_rate_accrued', 'l3fix-a1', NULL,       NULL,         5000,   'USD'),
  ('take_rate_accrued', 'l3fix-a2', NULL,       NULL,         3000,   'USD');
\\echo MARK:gbv
SELECT * FROM pmf_gbv ORDER BY currency;
\\echo MARK:take_rate
SELECT * FROM pmf_take_rate_per_active_agent ORDER BY currency;
\\echo MARK:resold
SELECT * FROM pmf_resold_vs_self_built;
\\echo MARK:plan_book
SELECT * FROM pmf_plan_to_book;
ROLLBACK;
\\echo MARK:post
SELECT COUNT(*) AS n FROM pmf_event;
`;

// Hand-computed from the fixtures above (data-model.md view definitions).
const PMF_EXPECTED = {
  gbv: ["EUR,100000,1", "USD,250000,1"],
  take_rate: ["USD,8000,2,4000"],
  resold: ["1,2"], // resold_trips, self_built_trips
  plan_book: ["3,2"], // trips_created, trips_booked (distinct booked itineraries)
};

/** Split marker-delimited psql CSV output into { section: [data lines] }. */
function parseMarkedSections(out) {
  const sections = {};
  let current = null;
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const mark = line.match(/^MARK:(\w+)$/);
    if (mark) {
      current = mark[1];
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  // Drop CSV header rows (first line of each section) — data rows only.
  for (const key of Object.keys(sections)) sections[key] = sections[key].slice(1);
  return sections;
}

async function main() {
  console.log(`L3 smoke against ${BASE}`);

  // 1. Health endpoint does a REAL Postgres round-trip (state/ground-truth, not a constant).
  const healthRes = await get("/api/health");
  const health = await healthRes.json().catch(() => ({}));
  check("GET /api/health returns 200", healthRes.status === 200, `got ${healthRes.status}`);
  check("health.status === 'ok'", health.status === "ok", JSON.stringify(health));
  check("health.db === 'up' (real DB round-trip)", health.db === "up", JSON.stringify(health));

  // 2. Auth-gated workspace procedure is rejected with NO session (middleware runs on
  //    the real server — INV-023/024), not just in unit tests.
  const gatedRes = await get("/api/trpc/workspace.whoami");
  check(
    "auth-gated workspace.whoami rejected without a session",
    gatedRes.status === 401 || gatedRes.status === 403,
    `expected 401/403, got ${gatedRes.status}`,
  );

  // 3. Public health tRPC procedure is open to anyone.
  const publicRes = await get("/api/trpc/health");
  check("public tRPC health resolves (200)", publicRes.status === 200, `got ${publicRes.status}`);

  // 4. Sign-up state delta (FR-001): a real action causes EXACT row deltas.
  //    Run-unique email so re-runs against a long-lived stack stay exact.
  const email = `l3-smoke-${Date.now()}-${process.pid}@example.test`;
  const before = await snapshotTables();
  const signUpRes = await postJson("/api/auth/sign-up/email", {
    name: "L3 Smoke",
    email,
    password: "l3-smoke-password-1",
  });
  const afterSignUp = await snapshotTables();
  check("sign-up accepted (2xx)", signUpRes.ok, `got ${signUpRes.status}`);
  const deltaResult = assertDelta(before, afterSignUp, { user: 1, account: 1, session: 1 });
  check(
    "sign-up state delta: user +1, account +1, session +1 (others conserved)",
    deltaResult.ok,
    deltaResult.detail,
  );

  // 5. Duplicate sign-up conservation (FR-002): rejected AND zero state delta —
  //    the failure-path shape every money path must satisfy (Constitution VI).
  const beforeDup = await snapshotTables();
  const dupRes = await postJson("/api/auth/sign-up/email", {
    name: "L3 Smoke",
    email,
    password: "l3-smoke-password-1",
  });
  const afterDup = await snapshotTables();
  check(
    "duplicate sign-up rejected (4xx)",
    dupRes.status >= 400 && dupRes.status < 500,
    `got ${dupRes.status}`,
  );
  const conserved = assertConserved(beforeDup, afterDup);
  check("duplicate sign-up conserves state (zero delta)", conserved.ok, conserved.detail);

  // 6. PMF schema present after migration (FR-009): table + all four views.
  const presence = await sql(
    `SELECT (to_regclass('public.pmf_event') IS NOT NULL)::int
        + (to_regclass('public.pmf_gbv') IS NOT NULL)::int
        + (to_regclass('public.pmf_take_rate_per_active_agent') IS NOT NULL)::int
        + (to_regclass('public.pmf_resold_vs_self_built') IS NOT NULL)::int
        + (to_regclass('public.pmf_plan_to_book') IS NOT NULL)::int AS present;`,
  );
  check(
    "pmf_event table + 4 metric views present after migration",
    /\b5\b/.test(presence.split("\n")[1] ?? ""),
    `presence output: ${presence.trim()}`,
  );

  // 7. PMF views compute exact numbers from fixtures in a rolled-back tx (FR-010).
  const fixtureOut = await sql(PMF_FIXTURE_SQL, { timeoutMs: 20_000 });
  const sections = parseMarkedSections(fixtureOut);
  for (const [name, expected] of Object.entries(PMF_EXPECTED)) {
    const got = sections[name] ?? [];
    check(
      `PMF view ${name} computes exact expected metrics`,
      JSON.stringify(got) === JSON.stringify(expected),
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
    );
  }
  const preCount = sections.pre?.[0];
  const postCount = sections.post?.[0];
  check(
    "PMF fixture tx rolled back (no residue)",
    preCount !== undefined && preCount === postCount,
    `pre=${preCount} post=${postCount}`,
  );

  // ─── 8. Build→Book walk (spec 005): draft → quote → book, exact deltas ────
  // The full money path against the BUILT stack with the deterministic planner
  // fake (no key), asserting per-step state deltas and failure-branch
  // conservation (FR-014, SC-003/004/005/007).
  const agent = createHttpSession(BASE);
  const stamp = `${Date.now()}-${process.pid}`;

  // 8a. Agent bootstrap: sign-up → agency (organization) → active org.
  const su = await agent.api("POST", "/api/auth/sign-up/email", {
    name: "L3 Booking Agent",
    email: `l3-book-${stamp}@example.test`,
    password: "l3-booking-password-1",
  });
  check("build→book: agent sign-up (2xx)", su.res.ok, `got ${su.res.status}`);
  const org = await agent.api("POST", "/api/auth/organization/create", {
    name: `L3 Booking Agency ${stamp}`,
    slug: `l3-book-${stamp}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("build→book: agency created", org.res.status === 200 && !!orgId, `got ${org.res.status}`);
  const setActive = await agent.api("POST", "/api/auth/organization/set-active", { organizationId: orgId });
  check("build→book: agency set active", setActive.res.status === 200, `got ${setActive.res.status}`);

  // 8b. Draft: itinerary +1, trip_created PMF event +1, nothing else.
  // 45s cap: with ANTHROPIC_API_KEY in the stack env this runs a REAL Haiku
  // tool loop (INV-013); keyless stacks use the deterministic fake and answer
  // in milliseconds. Every assertion below holds under either planner.
  const beforeDraft = await snapshotTables();
  const draft = await agent.api(
    "POST",
    "/api/trpc/workspace.itinerary.draft",
    {
      destination: "Paris",
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      party: { adults: 2, children: 0 },
      budget: { mode: "hardCap", amountMinor: 100000, currency: "USD" },
    },
    { timeoutMs: 45_000 },
  );
  const drafted = draft.json?.result?.data;
  check("build→book: draft returns a drafted itinerary", drafted?.status === "drafted", draft.text.slice(0, 300));
  const afterDraft = await snapshotTables();
  const draftDelta = assertDelta(beforeDraft, afterDraft, { itinerary: 1, pmf_event: 1 });
  check("build→book: draft delta is itinerary +1, pmf_event +1 (others conserved)", draftDelta.ok, draftDelta.detail);
  const allocSum = (drafted?.itinerary?.pricing?.categories ?? []).reduce(
    (acc, c) => acc + (c.allocated?.amountMinor ?? 0),
    0,
  );
  check(
    "build→book: category allocations sum exactly to the budget (SC-001)",
    allocSum === 100000,
    `sum=${allocSum}`,
  );
  const draftItems = (drafted?.itinerary?.days ?? []).flatMap((d) => d.items ?? []);
  check(
    "build→book: every priced item carries a supply reference (SC-002)",
    draftItems.length > 0 && draftItems.every((i) => i.supplyRef?.externalId),
    `items=${draftItems.length}`,
  );

  // 8c. Quote: one hold per bookable item, hold fields present.
  const itineraryId = drafted?.itinerary?.id;
  const quote = await agent.api("POST", "/api/trpc/workspace.booking.quote", { itineraryId, markupBps: 1500 });
  const quoted = quote.json?.result?.data;
  const heldQuotes = (quoted?.items ?? []).filter((i) => i.outcome === "held");
  check(
    "build→book: every bookable item quoted (holds with expiry + MoR)",
    quoted?.status === "quoted" &&
      heldQuotes.length === draftItems.length &&
      heldQuotes.every((h) => h.quote.expiresAt && h.quote.merchantOfRecord && h.quote.quoteRowId),
    quote.text.slice(0, 300),
  );
  const afterQuote = await snapshotTables();
  const quoteDelta = assertDelta(afterDraft, afterQuote, { booking_quote: heldQuotes.length });
  check(`build→book: quote delta is booking_quote +${heldQuotes.length}`, quoteDelta.ok, quoteDelta.detail);

  // 8d. Book: ONE transaction — booking, components, ledger, PMF events.
  // Booked as a concurrent RACE (seed-0015): two simultaneous book requests
  // for the same holds with OPPOSED request orders — the interleaving that
  // deadlocked (40P01) the claim gate against the recording transaction
  // before the claim-order discipline. Exactly one confirms; the loser must
  // answer TYPED (already_consumed per component, HTTP 200) — never a 500.
  const quoteRowIds = heldQuotes.map((h) => h.quote.quoteRowId);
  const ascendingIds = [...quoteRowIds].sort();
  const descendingIds = [...ascendingIds].reverse();
  const [raceA, raceB] = await Promise.all([
    agent.api("POST", "/api/trpc/workspace.booking.book", { itineraryId, quoteRowIds: ascendingIds }),
    agent.api("POST", "/api/trpc/workspace.booking.book", { itineraryId, quoteRowIds: descendingIds }),
  ]);
  check(
    "build→book: both concurrent book requests answer typed (200 — no deadlock 500)",
    raceA.res.status === 200 && raceB.res.status === 200,
    `got ${raceA.res.status}/${raceB.res.status}`,
  );
  const raceOutcomes = [raceA.json?.result?.data, raceB.json?.result?.data];
  const booked = raceOutcomes.find((o) => o?.status === "confirmed");
  const raceLoser = raceOutcomes.find((o) => o?.status === "failed");
  check(
    "build→book: exactly one concurrent booking wins",
    Boolean(booked) && Boolean(raceLoser),
    `statuses: ${JSON.stringify(raceOutcomes.map((o) => o?.status))}`,
  );
  check(
    "build→book: booking confirms every component",
    (booked?.components ?? []).length === heldQuotes.length &&
      (booked?.components ?? []).every((c) => c.outcome === "confirmed"),
    raceA.text.slice(0, 300),
  );
  check(
    "build→book: the losing racer fails typed — already_consumed on every component",
    (raceLoser?.components ?? []).length === heldQuotes.length &&
      (raceLoser?.components ?? []).every((c) => c.outcome === "failed" && c.reason === "already_consumed"),
    JSON.stringify(raceLoser?.components ?? []).slice(0, 300),
  );
  const afterBook = await snapshotTables();
  const bookDelta = assertDelta(afterQuote, afterBook, {
    booking: 1,
    booking_component: heldQuotes.length,
    markup_ledger: heldQuotes.length,
    pmf_event: heldQuotes.length,
  });
  check(
    "build→book: book delta is booking +1, components/ledger/pmf_event +N (others conserved)",
    bookDelta.ok,
    bookDelta.detail,
  );

  // 8e. Ledger identity (SC-005): markup = sell − net exactly, in every row.
  const ledgerCheck = await sql(
    "SELECT COUNT(*) AS bad FROM markup_ledger WHERE markup_minor <> sell_minor - net_minor;",
  );
  check(
    "build→book: markup ledger identity holds (markup = sell − net)",
    /^0$/m.test(ledgerCheck.split("\n")[1] ?? ""),
    ledgerCheck.trim(),
  );

  // 8f. Plan→book conversion computes from this flow's events (SC-007).
  const planBook = await sql("SELECT * FROM pmf_plan_to_book;");
  const planBookRow = planBook.split("\n")[1] ?? "";
  const [createdCount, bookedCount] = planBookRow.split(",").map(Number);
  check(
    "build→book: pmf_plan_to_book counts this trip as created AND booked",
    createdCount >= 1 && bookedCount >= 1,
    `view row: ${planBookRow}`,
  );

  // 8g. Double-book the same holds: typed failure, ZERO state delta (SC-004).
  const again = await agent.api("POST", "/api/trpc/workspace.booking.book", { itineraryId, quoteRowIds });
  const againData = again.json?.result?.data;
  check(
    "build→book: double-book fails typed (already_consumed)",
    againData?.status === "failed" && (againData?.components ?? []).every((c) => c.reason === "already_consumed"),
    again.text.slice(0, 300),
  );
  const afterDouble = await snapshotTables();
  const doubleConserved = assertConserved(afterBook, afterDouble);
  check("build→book: double-book conserves state (zero delta)", doubleConserved.ok, doubleConserved.detail);

  // ─── 9. Client-view share (spec 010): share → anonymous redacted view ─────
  // The trust boundary against the BUILT stack: the agent mints the durable
  // link; a cookie-less caller resolves it and the payload/page carry the
  // agency's brand and sell prices — never platform naming or agent-
  // confidential vocabulary (FR-006/FR-007, contract §5).

  // 9a. Share: itinerary_share_link +1, nothing else; path carries the token.
  const beforeShare = await snapshotTables();
  const share = await agent.api("POST", "/api/trpc/workspace.itinerary.share", { itineraryId });
  const sharedData = share.json?.result?.data;
  check(
    "client-view: share mints the durable link (status shared, /view/{token} path)",
    sharedData?.status === "shared" && /^\/view\/[0-9a-f-]{36}$/i.test(sharedData?.path ?? ""),
    share.text.slice(0, 300),
  );
  const afterShare = await snapshotTables();
  const shareDelta = assertDelta(beforeShare, afterShare, { itinerary_share_link: 1 });
  check("client-view: share delta is itinerary_share_link +1 (others conserved)", shareDelta.ok, shareDelta.detail);

  // 9b. Re-share is idempotent: SAME token, zero state delta (FR-004).
  const reshare = await agent.api("POST", "/api/trpc/workspace.itinerary.share", { itineraryId });
  check(
    "client-view: re-share returns the SAME durable token",
    reshare.json?.result?.data?.token === sharedData?.token,
    reshare.text.slice(0, 200),
  );
  const afterReshare = await snapshotTables();
  const reshareConserved = assertConserved(afterShare, afterReshare);
  check("client-view: re-share conserves state (zero delta)", reshareConserved.ok, reshareConserved.detail);

  // 9c. ANONYMOUS resolve — plain cookie-less GET (link-bearer access, FR-005):
  // found view + confidentiality scan over the exact payload served (SC-003).
  const token = sharedData?.token;
  const resolveRes = await get(`/api/trpc/clientView.itinerary?input=${encodeURIComponent(JSON.stringify({ token }))}`);
  const resolveText = await resolveRes.text();
  let resolveJson = {};
  try {
    resolveJson = JSON.parse(resolveText);
  } catch {
    /* asserted below */
  }
  const viewData = resolveJson?.result?.data;
  check(
    "client-view: anonymous resolve returns the redacted view (200/found)",
    resolveRes.status === 200 && viewData?.status === "found",
    `status=${resolveRes.status} ${resolveText.slice(0, 200)}`,
  );
  check(
    "client-view: view carries the agency brand + sell prices",
    (viewData?.view?.agencyName ?? "").length > 0 &&
      (viewData?.view?.days ?? []).some((d) => (d.items ?? []).some((i) => i.sellMinor > 0)),
    resolveText.slice(0, 200),
  );
  const forbiddenVocab = ["netRate", "netMinor", "markup", "supplyRef", "provenance", "budgetMode", "tripRequest", "agencyId"];
  const leaked = forbiddenVocab.filter((k) => resolveText.includes(k));
  check("client-view: payload carries ZERO agent-confidential vocabulary (SC-003)", leaked.length === 0, `leaked: ${leaked.join(",")}`);

  // 9d. The anonymous PAGE is white-label (INV-020): agency brand, no platform naming.
  const pageRes = await get(`/view/${token}`);
  const pageHtml = await pageRes.text();
  check("client-view: /view/{token} renders (200)", pageRes.status === 200, `got ${pageRes.status}`);
  check(
    "client-view: page carries the agency's brand, not the platform's",
    pageHtml.includes(`L3 Booking Agency ${stamp}`) && !pageHtml.includes("TripForge") && !pageHtml.includes("Trellis"),
    `brand=${pageHtml.includes(`L3 Booking Agency ${stamp}`)} platform=${pageHtml.includes("TripForge") || pageHtml.includes("Trellis")}`,
  );

  // 9e. Unknown token: typed not_found — the unavailable state reveals nothing (FR-003).
  const unknownRes = await get(
    `/api/trpc/clientView.itinerary?input=${encodeURIComponent(JSON.stringify({ token: "00000000-0000-4000-8000-000000000000" }))}`,
  );
  const unknownJson = await unknownRes.json().catch(() => ({}));
  check(
    "client-view: unknown token resolves typed not_found",
    unknownRes.status === 200 && unknownJson?.result?.data?.status === "not_found",
    `got ${unknownRes.status}`,
  );

  if (failures > 0) {
    console.error(`\nL3 smoke FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nL3 smoke PASSED.");
}

// Global budget: fail hard rather than hang the gate.
const budget = setTimeout(() => {
  console.error(`FAIL: L3 smoke exceeded its ${GLOBAL_BUDGET_MS / 1000}s budget.`);
  process.exit(1);
}, GLOBAL_BUDGET_MS);

main()
  .then(() => clearTimeout(budget))
  .catch((err) => {
    // REG-L3-MSG: when nothing is listening, print a legible gate verdict instead of a
    // raw fetch stack dump. Behaviour is unchanged — still a real failure, still exit 1.
    const code = err?.cause?.code || err?.code || "";
    const unreachable =
      /ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|ETIMEDOUT/.test(code) ||
      /fetch failed/i.test(String(err?.message ?? ""));
    if (unreachable) {
      console.error(`FAIL: app not reachable at ${BASE}${code ? ` (${code})` : ""}`);
    } else {
      console.error("L3 smoke crashed:", err);
    }
    process.exit(1);
  });
