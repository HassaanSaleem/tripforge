// Drizzle client factory. Uses a pg Pool — on Vercel serverless this MUST be a
// POOLED Supabase connection string, never a direct unpooled socket (INV-028).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

export interface DbHandle {
  db: ReturnType<typeof drizzle<typeof schema>>;
  pool: Pool;
  /** Real round-trip probe for the health endpoint (FR-007). */
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString });
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
