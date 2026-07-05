// Health endpoint (FR-007): a REAL Postgres round-trip, not a static string. The
// `db` field is the ground truth the L3 smoke asserts on. DB unreachable ⇒ 503 with
// db:"down" (edge case) — the process never crashes or hangs on a probe.
import { getDb } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let dbUp = false;
  try {
    dbUp = await getDb().ping();
  } catch {
    dbUp = false;
  }

  const body = { status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down" } as const;
  return Response.json(body, { status: dbUp ? 200 : 503 });
}
