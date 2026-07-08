// Applies the PMF metric views (sql/pmf-views.sql) to the database at
// DATABASE_URL. Runs as the second step of the compose migrate one-shot, after
// drizzle-kit push — drizzle-kit's view push support is uncertain on the pinned
// toolchain (spec 004 research D3), so views are applied from a plain SQL file
// through the package's own pg dependency. Idempotent (DROP + CREATE).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, "..", "sql", "pmf-views.sql");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("apply-views: DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
try {
  const ddl = await readFile(sqlPath, "utf8");
  await client.connect();
  await client.query(ddl);
  console.log("apply-views: PMF metric views applied");
} catch (err) {
  console.error(`apply-views: FAILED — ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
