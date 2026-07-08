# Contracts: Harness Scripts + PMF Event API

## 1. `packages/db` public surface additions (TypeScript)

```ts
// Event union (closed vocabulary, FR-008)
export type PmfEvent =
  | {
      type: "trip_created";
      agencyId: string;
      itineraryId: string;
      source: "self_built" | "licensed";
      actorUserId?: string;
    }
  | {
      type: "booking_confirmed";
      agencyId: string;
      itineraryId: string;
      amountMinor: number;   // integer minor units (GBV contribution), >= 0
      currency: string;      // ISO-4217 alpha-3, uppercase
      actorUserId?: string;
    }
  | {
      type: "take_rate_accrued";
      agencyId: string;
      amountMinor: number;   // integer minor units (platform revenue), >= 0
      currency: string;
      itineraryId?: string;
      actorUserId?: string;
    };

// Thrown by recordPmfEvent on invalid input; never writes first.
export class PmfEventValidationError extends Error {
  readonly reason:
    | "unknown_type" | "missing_agency" | "missing_itinerary"
    | "missing_amount" | "non_integer_amount" | "negative_amount"
    | "missing_currency" | "malformed_currency" | "unexpected_money_fields"
    | "missing_source" | "invalid_source" | "unexpected_source";
}

// Pure check (exported for reuse/testing): returns the typed reason or null.
export function validatePmfEvent(event: unknown): PmfEventValidationError | null;

// Transactional recorder (INV-021). `executor` is the CALLER's transaction
// (or a Db for backfills/tests). Never opens its own transaction.
export type PmfEventExecutor = Pick<Db, "insert">;
export function recordPmfEvent(
  executor: PmfEventExecutor,
  event: PmfEvent,
): Promise<void>; // throws PmfEventValidationError before any write

// Drizzle table export
export const pmfEvent: PgTable; // + `schema.pmfEvent`
```

Consumers (seed-0005 booking, seed-0006 marketplace) call inside their action
transaction:

```ts
await db.transaction(async (tx) => {
  // ... business writes ...
  await recordPmfEvent(tx, { type: "booking_confirmed", agencyId, itineraryId,
    amountMinor: totalMinor, currency });
});
```

## 2. Metric views (SQL, applied at migrate time)

See [data-model.md](../data-model.md). Contract: the four views exist after
migration in every environment; columns are stable:

| View | Columns |
|---|---|
| `pmf_gbv` | `currency, gbv_minor, bookings` |
| `pmf_take_rate_per_active_agent` | `currency, revenue_minor, active_agents, revenue_minor_per_active_agent` |
| `pmf_resold_vs_self_built` | `resold_trips, self_built_trips` |
| `pmf_plan_to_book` | `trips_created, trips_booked` |

## 3. `tests/integration/harness.mjs` (plain-node ESM module)

```js
// psql passthrough (docker compose exec postgres). Throws on non-zero exit.
export async function sql(statements, { timeoutMs } = {});           // → raw stdout (CSV)
// Row-count snapshot of the watched tables (or an explicit list).
export async function snapshotTables(tables = WATCHED_TABLES);       // → Map<name, count>
export function diffSnapshots(before, after);                        // → { [table]: delta }
// Exact-delta assertion: every table in `expected` matches; every other
// watched table has delta 0. Returns {ok, detail}.
export function assertDelta(before, after, expected);
export function assertConserved(before, after);                      // = assertDelta(..., {})
export const WATCHED_TABLES; // ["user","account","session","organization","member","pmf_event"]
```

Failure mode: unreachable docker/postgres → thrown error with a legible
message (the caller reports FAIL and exits 1) — never a skip (FR-004).

## 4. `tests/live/log-scan.mjs` (CLI)

```text
node tests/live/log-scan.mjs <logfile | ->
  exit 0  — no non-allowlisted match; allowlisted matches printed as
            "SKIP (allowlisted): <line>  [justification]"
  exit 1  — non-allowlisted matches; each printed as "MATCH: <line>"
  exit 2  — usage/IO error (missing file, unreadable allowlist)
Pattern: /ERROR|FATAL|Unhandled/ applied per line (mirrors
verification.live.log_error_pattern; the sealed config is not read to avoid
a yaml parser dependency — the pattern equivalence is asserted in the unit test
fixture docs and reviewed on any gate change).
Allowlist: tests/live/log-allowlist.json (entries require non-empty justification).
Exports (for unit tests): scanLines(lines, allowlistEntries) → { matches, skipped }.
```

## 5. `tests/live/collect-evidence.mjs` (CLI)

```text
node tests/live/collect-evidence.mjs --iteration <n> --ticket <id> [--dir <path>]
  1. dir = --dir ?? .kitchenloop/evidence/<n>/<id>/   (mkdir -p)
  2. docker compose logs --no-color > dir/compose.log   (daemon down → exit 2, loud)
  3. copy .kitchenloop/evidence/test-results/ and
     .kitchenloop/evidence/playwright-report/ into dir when present
  4. node tests/live/log-scan.mjs dir/compose.log
  exit code = log-scan verdict (0 clean / 1 findings / 2 IO error)
```

## 6. Extended oracle (`tests/integration/smoke.mjs`) — same command, new checks

Order of checks (all within a 60 s global budget, FR/SC-001):

1–4. existing: health 200/ok/db-up; anonymous workspace.whoami 401/403;
     public tRPC health 200 *(unchanged)*
5. sign-up state delta: snapshot → `POST /api/auth/sign-up/email`
   (run-unique email) → assert `{user:+1, account:+1, session:+1}`, others 0
6. duplicate sign-up conservation: snapshot → same email again → assert
   HTTP 4xx AND zero delta on all watched tables
7. PMF schema present: `pmf_event` table + 4 views exist (`to_regclass`)
8. PMF views compute: inside one psql session —
   `BEGIN; INSERT 6 fixture events (2 agencies, 2 currencies, licensed+self
   built, booked and unbooked trips); SELECT from each view; ROLLBACK;` —
   assert exact expected numbers (hand-computed in the test) and afterwards
   assert `pmf_event` count returned to its pre-fixture value (no residue).

Fixture note: fixture agencies are inserted inside the same rolled-back
transaction (FK to `organization` requires parent rows); IDs are prefixed
`l3fix-` for legibility.
