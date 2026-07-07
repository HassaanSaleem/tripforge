// L3 integration smoke (unbeatable-tests L3 + INV-027). Runs against a REAL running
// stack (the built compose image or `next start` + compose Postgres) — never a mock.
// Proves: the server boots, routes resolve, middleware runs, and Postgres is reachable.
//
// Usage:  BASE_URL=http://localhost:3000 node tests/integration/smoke.mjs
// Exit 0 = all assertions pass; non-zero = a real failure (nothing is skipped silently).

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`L3 smoke against ${BASE}`);

  // 1. Health endpoint does a REAL Postgres round-trip (state/ground-truth, not a constant).
  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json().catch(() => ({}));
  check("GET /api/health returns 200", healthRes.status === 200, `got ${healthRes.status}`);
  check("health.status === 'ok'", health.status === "ok", JSON.stringify(health));
  check("health.db === 'up' (real DB round-trip)", health.db === "up", JSON.stringify(health));

  // 2. Auth-gated workspace procedure is rejected with NO session (middleware runs on
  //    the real server — INV-023/024), not just in unit tests.
  const gatedRes = await fetch(`${BASE}/api/trpc/workspace.whoami`);
  check(
    "auth-gated workspace.whoami rejected without a session",
    gatedRes.status === 401 || gatedRes.status === 403,
    `expected 401/403, got ${gatedRes.status}`,
  );

  // 3. Public health tRPC procedure is open to anyone.
  const publicRes = await fetch(`${BASE}/api/trpc/health`);
  check("public tRPC health resolves (200)", publicRes.status === 200, `got ${publicRes.status}`);

  if (failures > 0) {
    console.error(`\nL3 smoke FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nL3 smoke PASSED.");
}

main().catch((err) => {
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
