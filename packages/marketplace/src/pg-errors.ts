// Postgres error classification for the constraint-decided races (research
// D9 / FR-012): the partial unique active-listing index and the
// (listing_id, reseller_agency_id) license key refuse duplicates at the
// database, and the flows map that refusal to a typed outcome. Drizzle may
// surface the pg error directly or wrapped, so the `cause` chain is walked.
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 10 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === UNIQUE_VIOLATION) return true;
    current = candidate.cause;
  }
  return false;
}
