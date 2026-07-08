// L3 state-delta harness (spec 004, FR-003/FR-004). Dependency-free plain node:
// the sealed oracle command (`node tests/integration/smoke.mjs`) must run with no
// install step, so Postgres is reached through the compose-managed container's own
// psql (`docker compose exec`) rather than an npm driver (research D1). Works in
// every context where the L3 gate runs — the stack is booted there by definition.
//
// Failure mode is LOUD: unreachable docker/postgres throws with a legible message;
// callers report FAIL and exit non-zero. Nothing here skips silently.
import { execFile } from "node:child_process";

/**
 * Tables watched by default for delta/conservation assertions. Money-path seeds
 * (booking, marketplace) extend this list as their tables land.
 */
export const WATCHED_TABLES = [
  "user",
  "account",
  "session",
  "organization",
  "member",
  "pmf_event",
];

// -q suppresses command tags (BEGIN/INSERT 0 n/ROLLBACK) so stdout carries query
// output only — callers parse CSV headers + rows and `\echo` marker lines.
const PSQL_ARGS = [
  "compose",
  "exec",
  "-T",
  "postgres",
  "psql",
  "-q",
  "-U",
  "tripforge",
  "-d",
  "tripforge",
  "--csv",
  "-v",
  "ON_ERROR_STOP=1",
  "-f",
  "-",
];

/**
 * Run SQL statements in ONE psql session (so BEGIN/.../ROLLBACK fixtures hold)
 * and return raw stdout (CSV per SELECT). Throws on non-zero exit or timeout.
 */
export function sql(statements, { timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      PSQL_ARGS,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `psql via docker compose failed (is the compose stack up?): ${err.message}\n${stderr}`,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin.on("error", () => {
      // EPIPE when docker dies before reading stdin — surfaced by the exec callback.
    });
    child.stdin.write(statements);
    child.stdin.end();
  });
}

/** Row-count snapshot of the watched tables. Missing table => count -1 (absent). */
export async function snapshotTables(tables = WATCHED_TABLES) {
  const selects = tables
    .map(
      (t) =>
        `SELECT '${t}' AS tbl, CASE WHEN to_regclass('public."${t}"') IS NULL THEN -1 ELSE (SELECT COUNT(*) FROM public."${t}") END AS n;`,
    )
    .join("\n");
  const out = await sql(selects);
  const counts = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/^([A-Za-z_]+),(-?\d+)$/);
    if (m) counts.set(m[1], Number(m[2]));
  }
  for (const t of tables) {
    if (!counts.has(t)) {
      throw new Error(`snapshotTables: no count parsed for table "${t}" — psql output:\n${out}`);
    }
  }
  return counts;
}

/** Per-table difference between two snapshots. */
export function diffSnapshots(before, after) {
  const delta = {};
  for (const [table, countBefore] of before) {
    delta[table] = (after.get(table) ?? 0) - countBefore;
  }
  return delta;
}

/**
 * Exact-delta assertion: every table in `expected` must match exactly, and every
 * OTHER watched table must have delta 0. Returns { ok, detail }.
 */
export function assertDelta(before, after, expected) {
  const delta = diffSnapshots(before, after);
  const problems = [];
  for (const table of Object.keys(delta)) {
    const want = expected[table] ?? 0;
    if (delta[table] !== want) {
      problems.push(`${table}: expected ${want >= 0 ? "+" + want : want}, got ${delta[table]}`);
    }
  }
  return { ok: problems.length === 0, detail: problems.join("; ") };
}

/** Zero-delta (conservation) assertion — the money-path failure-branch shape. */
export function assertConserved(before, after) {
  return assertDelta(before, after, {});
}
