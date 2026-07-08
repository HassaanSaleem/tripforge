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
