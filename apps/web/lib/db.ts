// App-level database handle. A per-instance singleton is safe on Vercel serverless
// (each function instance owns its pool) and MUST use a POOLED connection string in
// prod (INV-028). Local dev/compose points at the compose Postgres.
import { createDb, type DbHandle } from "@tripforge/db";
import { optionalEnv } from "@tripforge/shared";

let handle: DbHandle | undefined;

export function getDb(): DbHandle {
  if (!handle) {
    const url = optionalEnv(
      "DATABASE_URL",
      "postgres://tripforge:tripforge@localhost:5432/tripforge",
    );
    handle = createDb(url);
  }
  return handle;
}
