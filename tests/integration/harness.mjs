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
  // Build → Book money path (spec 005): delta/conservation assertions cover
  // the whole path so an orphan row anywhere turns the gate red.
  "itinerary",
  "booking_quote",
  "booking",
  "booking_component",
  "markup_ledger",
  // Client-view share (spec 010): watched so an orphan share row anywhere
  // (or a share write on a conserving branch) turns the gate red.
  "itinerary_share_link",
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

/**
 * Parse a raw SSE response body (tRPC v11 subscription wire format, spec 016
 * — INV-028): frames are separated by a blank line, each frame has optional
 * `event:`/`id:` lines and a `data:` line. Returns every frame in order —
 * `{ event: null, data }` for a plain (untracked) event, per
 * `@trpc/server`'s `sseStreamProducer` (no `event:` line unless the server
 * used `tracked()`, which this repo's draft subscription does not).
 */
export function parseSSE(text) {
  return text
    .split("\n\n")
    .map((block) => block.trim())
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
}

/**
 * Cookie-carrying HTTP session against the live stack — the "perform an action
 * via API" half of the L3 harness (spec 004 FR-003). Mirrors a real browser:
 * folds every Set-Cookie into a jar and sends the base Origin (Better Auth
 * CSRF-checks it on state-changing requests). Dependency-free by design.
 */
export function createHttpSession(base) {
  const jar = new Map();
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  return {
    /**
     * JSON request; returns { res, json, text }. Body optional (GET).
     * `timeoutMs` override exists for the one legitimately slow call: a draft
     * against a stack wired with a real ANTHROPIC_API_KEY runs a live Haiku
     * tool loop (INV-013). Deterministic-fake stacks answer in milliseconds.
     */
    async api(method, path, body, { timeoutMs = 15_000 } = {}) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          origin: base,
          ...(jar.size ? { cookie: cookieHeader() } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      absorb(res);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* HTML or empty — caller inspects text */
      }
      return { res, json, text };
    },

    /**
     * SSE subscription request (spec 016, INV-028) — GET with the input as a
     * `?input=` query param (the same unbatched-GET input encoding tRPC uses
     * for queries), `Accept: text/event-stream`. Reads the WHOLE response
     * (the subscription completes and the server closes the stream after its
     * one terminal result event, so this does not hang) and returns every
     * parsed frame plus `outcome` — the terminal `{type:"result"}` event's
     * `.outcome`, or `undefined` if the stream ended without one (treated as
     * a failure by the real client too — spec 016 FR-007).
     * `timeoutMs` override exists for the one legitimately slow call: a draft
     * against a stack wired with a real ANTHROPIC_API_KEY runs a live Haiku
     * tool loop (INV-013). Deterministic-fake stacks answer in milliseconds.
     */
    async apiSubscribe(path, input, { timeoutMs = 15_000 } = {}) {
      const url = `${base}${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          origin: base,
          ...(jar.size ? { cookie: cookieHeader() } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      absorb(res);
      const text = await res.text();
      const frames = parseSSE(text);
      const events = frames.filter((f) => f.event === null).map((f) => JSON.parse(f.data));
      const errorFrame = frames.find((f) => f.event === "serialized-error");
      const terminal = events.find((e) => e?.type === "result");
      return {
        res,
        text,
        frames,
        events,
        outcome: terminal?.outcome,
        error: errorFrame ? JSON.parse(errorFrame.data) : null,
      };
    },
  };
}
