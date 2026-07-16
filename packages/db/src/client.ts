// Drizzle client factory. Uses a pg Pool — on Vercel serverless this MUST be a
// POOLED Supabase connection string, never a direct unpooled socket (INV-028).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { schema } from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

export interface DbHandle {
  db: ReturnType<typeof drizzle<typeof schema>>;
  pool: Pool;
  /** Real round-trip probe for the health endpoint (FR-007). */
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

/**
 * Pool safety defaults (ticket e2e-traveler-trip-history-signout-hang). The pg
 * default `connectionTimeoutMillis: 0` means "wait forever" for a free client —
 * so a briefly exhausted pool (the client-view render fires several independent
 * queries per request under `force-dynamic`, and Better Auth adds its own) turns
 * a transient shortage into a SILENT, INFINITE hang: `pool.query` never resolves,
 * the RSC render never completes, the HTTP response never sends, and the browser
 * (or the next request, e.g. sign-out) blocks with no error to surface. A bounded
 * timeout makes an exhausted pool FAIL FAST and retryably instead of hanging, and
 * `statement_timeout` bounds a query that is checked out but wedged server-side.
 * Overridable by env for prod tuning (INV-028: serverless instances own their
 * own pool). These are ceilings, not behavior changes — no query the app issues
 * legitimately approaches them.
 */
function poolLimits(): Pick<PoolConfig, "max" | "connectionTimeoutMillis" | "statement_timeout"> {
  const toInt = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    max: toInt("DB_POOL_MAX", 10),
    // Never "wait forever" for a free client — the crux of the hang fix.
    connectionTimeoutMillis: toInt("DB_POOL_CONNECTION_TIMEOUT_MS", 10_000),
    // Cap any single wedged statement so a checked-out client is always returned.
    statement_timeout: toInt("DB_STATEMENT_TIMEOUT_MS", 30_000),
  };
}

export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString, ...poolLimits() });
  // A pooled connection can be dropped by the server while idle (restart, idle
  // reaper). Without a listener, pg re-emits that as an unhandled 'error' on the
  // pool and crashes the whole process; the pool itself already evicts the dead
  // client, so logging is the correct handling (defense in depth for INV-028).
  // `console.warn` (not the structured logger) keeps @tripforge/db dependency-free
  // — this is the one low-level infra edge that would otherwise pull in a package.
  pool.on("error", (err: Error) => {
    console.warn(JSON.stringify({ level: "warn", component: "db", msg: "db.pool.idle_client_error", error: err.message }));
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    ping: async () => {
      const res = await pool.query("select 1 as ok");
      return res.rows[0]?.ok === 1;
    },
    close: async () => {
      await pool.end();
    },
  };
}
