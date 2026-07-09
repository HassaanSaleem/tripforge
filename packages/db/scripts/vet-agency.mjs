// Platform operator action (spec 006 FR-001, contracts §6): vet an agency for
// marketplace participation by inserting its agency_vetting row. This is the
// ONLY writer of that table — no product code path vets an agency, and signing
// up never implies vetting (Constitution VI "vetted agents list", D-0006.a).
// Idempotent: re-vetting an already-vetted agency is a no-op reported loudly.
//
// Usage: DATABASE_URL=… node packages/db/scripts/vet-agency.mjs <agency-slug-or-id> [vetted-by-note]
import pg from "pg";

const target = process.argv[2];
const vettedBy = process.argv[3] ?? "operator";
if (!target) {
  console.error("vet-agency: usage — node vet-agency.mjs <agency-slug-or-id> [vetted-by-note]");
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("vet-agency: DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const org = await client.query('SELECT id, name, slug FROM "organization" WHERE slug = $1 OR id = $1 LIMIT 1', [
    target,
  ]);
  const agency = org.rows[0];
  if (!agency) {
    console.error(`vet-agency: no agency found for "${target}" (by slug or id)`);
    process.exitCode = 1;
  } else {
    const res = await client.query(
      "INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ($1, $2) ON CONFLICT (agency_id) DO NOTHING RETURNING vetted_at",
      [agency.id, vettedBy],
    );
    const state = await client.query("SELECT vetted_at, vetted_by FROM agency_vetting WHERE agency_id = $1", [
      agency.id,
    ]);
    const row = state.rows[0];
    const verb = res.rowCount === 1 ? "VETTED" : "already vetted";
    console.log(
      `vet-agency: ${agency.name} (${agency.slug}, ${agency.id}) ${verb} — vetted_at=${row.vetted_at.toISOString()} vetted_by=${row.vetted_by}`,
    );
  }
} catch (err) {
  console.error(`vet-agency: FAILED — ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
