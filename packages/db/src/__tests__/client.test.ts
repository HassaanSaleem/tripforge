// L1 — pool safety configuration (ticket e2e-traveler-trip-history-signout-hang).
// Pure/offline: `createDb` builds a pg Pool but issues NO query, so these assertions
// never touch a live Postgres and run in the L1/L2 lane (no DATABASE_URL gate).
//
// THE REGRESSION THIS GUARDS: the pool was created as `new Pool({ connectionString })`
// with pg's defaults, where `connectionTimeoutMillis` is 0 = "wait forever". A briefly
// exhausted pool then turned into a SILENT, INFINITE hang — the traveler client-view
// render (force-dynamic, several independent queries per request + Better Auth's own)
// could wedge, and the next request (e.g. sign-out) blocked with no error, stalling
// the e2e for its full 10-minute budget. A reversion to the bare `new Pool` — or any
// change that lets the connect wait be unbounded — must fail here, loudly and fast.
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../client.js";

const CONN = "postgres://u:p@localhost:5432/never_connected";

describe("createDb pool safety configuration", () => {
  const opened: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    // Pools never connected, but end() releases the (empty) pool cleanly.
    await Promise.all(opened.splice(0).map((h) => h.close().catch(() => undefined)));
  });

  it("bounds connection acquisition so an exhausted pool fails fast instead of hanging forever", () => {
    const handle = createDb(CONN);
    opened.push(handle);
    const options = handle.pool.options as {
      connectionTimeoutMillis?: number;
      max?: number;
      statement_timeout?: number | false;
    };

    // The crux: NEVER the pg default 0 ("wait forever" for a free client).
    expect(options.connectionTimeoutMillis).toBeGreaterThan(0);
    // Bounded, not accidentally huge — a stalled request must surface well within
    // a browser/test navigation budget.
    expect(options.connectionTimeoutMillis).toBeLessThanOrEqual(30_000);
    // A checked-out-but-wedged statement is also capped, so its client returns.
    expect(options.statement_timeout).toBeGreaterThan(0);
    // Pool size is explicit (not left implicit) so tuning has one obvious home.
    expect(options.max).toBeGreaterThan(0);
  });

  it("honors env overrides for prod pool tuning (INV-028: per-instance pool)", () => {
    const prev = {
      max: process.env.DB_POOL_MAX,
      conn: process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
      stmt: process.env.DB_STATEMENT_TIMEOUT_MS,
    };
    process.env.DB_POOL_MAX = "20";
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = "5000";
    process.env.DB_STATEMENT_TIMEOUT_MS = "15000";
    try {
      const handle = createDb(CONN);
      opened.push(handle);
      const options = handle.pool.options as {
        connectionTimeoutMillis?: number;
        max?: number;
        statement_timeout?: number | false;
      };
      expect(options.max).toBe(20);
      expect(options.connectionTimeoutMillis).toBe(5_000);
      expect(options.statement_timeout).toBe(15_000);
    } finally {
      // Restore (delete when previously unset) so no other test inherits the override.
      for (const [key, value] of [
        ["DB_POOL_MAX", prev.max],
        ["DB_POOL_CONNECTION_TIMEOUT_MS", prev.conn],
        ["DB_STATEMENT_TIMEOUT_MS", prev.stmt],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("falls back to safe defaults when an override is non-numeric or non-positive", () => {
    const prev = process.env.DB_POOL_CONNECTION_TIMEOUT_MS;
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = "not-a-number";
    try {
      const handle = createDb(CONN);
      opened.push(handle);
      const options = handle.pool.options as { connectionTimeoutMillis?: number };
      // Garbage in never re-opens the "wait forever" hole.
      expect(options.connectionTimeoutMillis).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.DB_POOL_CONNECTION_TIMEOUT_MS;
      else process.env.DB_POOL_CONNECTION_TIMEOUT_MS = prev;
    }
  });
});
