# Phase 0 Research: L3 State-Delta Harness + PMF Instrumentation Events

All Technical Context unknowns resolved. Decisions below carry rationale and
rejected alternatives.

## D1 — How the dependency-free harness reaches Postgres

**Decision**: `docker compose exec -T postgres psql -U tripforge -d tripforge
--csv -v ON_ERROR_STOP=1` via `child_process.execFile`, wrapped in
`tests/integration/harness.mjs`. Multi-statement fixtures run through psql
stdin so BEGIN/…/ROLLBACK executes as one session.

**Rationale**: smoke.mjs must stay a plain `node` script (the sealed oracle
command runs it with no install step; the loop host cannot `pnpm install`).
The compose project (`name: tripforge`) is fixed and postgres is always up in
every context where the L3 gate runs (Execute live gate, Regress
REG-L3-STACK). psql ships in the postgres:17-alpine image — zero host deps.

**Alternatives considered**:
- `pg`/`postgres` npm driver from smoke.mjs — requires node_modules on the
  host; the loop runtime cannot install them (ENV-PNPM-DENY). Rejected.
- Host `psql` binary to 127.0.0.1:5432 — not guaranteed installed on macOS/CI
  hosts. Rejected.
- An app debug endpoint exposing row counts — product surface built for tests;
  INV-024 surface risk and a lie about "no mocks at the boundary". Rejected.

## D2 — Proving action for state deltas (today's only real business action)

**Decision**: Better Auth email+password sign-up (`POST
/api/auth/sign-up/email`): expect `user` +1, `account` +1, `session` +1;
duplicate sign-up expects HTTP 4xx and zero delta across watched tables
(`user`, `account`, `session`, `organization`, `member`, `pmf_event`).
Run-unique email (`l3-smoke-<epoch>-<pid>@example.test`) so re-runs against a
long-lived stack stay exact.

**Rationale**: the only mutation available on main; exercises the full
HTTP → auth → Drizzle → Postgres pipeline; the duplicate branch is a genuine
failure-path conservation check (the pattern Constitution VI requires of money
paths).

**Alternatives considered**: direct DB insert as the "action" — proves nothing
about the running app; rejected. Waiting for booking (seed-0005) — leaves the
oracle blind for another iteration; rejected.

## D3 — Where PMF metric read models live

**Decision**: four SQL views (`pmf_gbv`, `pmf_take_rate_per_active_agent`,
`pmf_resold_vs_self_built`, `pmf_plan_to_book`) defined in
`packages/db/sql/pmf-views.sql` as idempotent `DROP VIEW IF EXISTS … CREATE
VIEW …`, applied by `packages/db/scripts/apply-views.mjs` (uses the package's
existing `pg` dependency) as part of the migrate one-shot container command.

**Rationale**: views make the metrics exist in *every migrated environment*
with no app code path, are queryable by psql (live-testable from the
dep-free harness inside a rolled-back transaction), and keep the arithmetic in
exactly one place. DROP+CREATE is change-proof (no CREATE OR REPLACE column
mismatch failures); views hold no data so drop is lossless.

**Alternatives considered**:
- drizzle `pgView()` in schema.ts + `drizzle-kit push` — view support in the
  pinned drizzle-kit 0.28 push path is uncertain; a silent no-op or prompt
  would break the migrate container for every consumer (fresh clone, regress
  boot). Rejected on determinism.
- TS query helpers only (no views) — metrics then exist only where the TS runs;
  the dep-free oracle could not verify them without duplicating the SQL
  (drift risk). Rejected.
- Materialized views — premature (INV-025 materialization is for expensive
  computations; these are cheap aggregates over an append-only table). Rejected.

## D4 — Event vocabulary (FR-008)

**Decision**: three types covering the four mandated metrics:

| Event type | Dimensions | Money | Feeds |
|---|---|---|---|
| `trip_created` | `source: self_built \| licensed`, `itinerary_id` | — | resold:self-built ratio; plan→book denominator |
| `booking_confirmed` | `itinerary_id` | `amount_minor` (GBV), `currency` | GBV; plan→book numerator |
| `take_rate_accrued` | optional `itinerary_id` | `amount_minor` (platform revenue), `currency` | take-rate revenue per active agent |

**Rationale**: minimal closed set; each constitution metric is derivable from
exactly one or two types; "plan" in plan→book IS the created trip (PRD §9.1 —
the itinerary is the plan). Later seeds may extend the vocabulary through the
normal SDD flow (the type column is text + TS union; views filter by type, so
additive extension is non-breaking).

**Alternatives considered**: separate `plan_created` event — duplicates
`trip_created` semantics (an itinerary draft IS the plan); rejected. A generic
`payload jsonb` envelope — weakens typing, invites schema drift, money inside
jsonb dodges INV-009 column discipline; rejected (dedicated nullable typed
columns instead).

## D5 — Recorder transactional shape (INV-021)

**Decision**: `recordPmfEvent(executor, event)` where `executor` is any
object with Drizzle's `insert` capability (`Db` or a transaction handle —
structurally `Pick<Db, "insert">`). The caller owns the transaction; the
recorder never opens one.

**Rationale**: "same transaction as the business action" is only guaranteeable
when the action's own `db.transaction(async (tx) => …)` hands `tx` in.
Structural typing keeps both `db` (rare, for backfills/tests) and `tx` (the
INV-021 path) usable.

**Alternatives considered**: recorder opens its own transaction — violates
INV-021 (event could survive an action rollback or vice versa); rejected.
Event emitted post-commit via hook/queue — same violation + new infra; rejected.

## D6 — Validation without zod in packages/db

**Decision**: hand-rolled `validatePmfEvent()` returning a discriminated
result, thrown as typed `PmfEventValidationError` by the recorder; rules:
known type; non-empty `agencyId`; `amountMinor` present ⇔ type is monetary,
integer, ≥ 0, safe-integer; `currency` present ⇔ monetary, exactly 3
uppercase letters; `source` present ⇔ `trip_created`, one of the closed set.

**Rationale**: adding zod to `packages/db/package.json` changes the pnpm
lockfile importer for that package — impossible in the loop runtime
(ENV-PNPM-DENY, CI `--frozen-lockfile`). The matrix is small and exhaustively
unit-testable.

**Alternatives considered**: import zod anyway (it exists in the workspace
for other packages) without declaring it — phantom dependency, breaks strict
pnpm isolation and dependency-cruiser honesty; rejected.

## D7 — Log-scan + allowlist format

**Decision**: `tests/live/log-scan.mjs <logfile|-> ` applies the live gate's
exact pattern `/ERROR|FATAL|Unhandled/` (case-sensitive, matching
`verification.live.log_error_pattern`) line-by-line; allowlist
`tests/live/log-allowlist.json` is `{ "entries": [ { "substring": …,
"justification": … } ] }`, starts with `entries: []`; a match is allowlisted
only if an entry's substring occurs in the line AND the entry has a non-empty
justification. Allowlisted matches are printed as `SKIP (allowlisted)` —
visible, never silent. Exit 1 on any non-allowlisted match.

**Rationale**: mirrors the sealed gate's pattern without touching the sealed
config; the JSON shape makes a justification structurally mandatory (FR-011,
quality-bar "allowlist additions require justification").

**Alternatives considered**: regex entries in the allowlist — over-powered,
easy to over-match (`.*` hides everything); substring + justification is
auditable. Rejected regex for v0.

## D8 — Evidence helper scope

**Decision**: `tests/live/collect-evidence.mjs --iteration <n> --ticket <id>
[--dir <override>]`: `mkdir -p` the evidence dir, capture `docker compose logs
--no-color` → `compose.log`, copy `.kitchenloop/evidence/test-results` and
`playwright-report` (the playwright outputDirs already configured) into the
dir if present, then run the log-scan on the captured log and exit with its
verdict.

**Rationale**: one command = capture + scan, so "forgot to scan" cannot
happen; playwright artifact locations come from the existing
`playwright.config.ts` (unchanged).

**Alternatives considered**: changing playwright outputDir per-ticket via env
— touches a shared config for cosmetic gain, risks breaking the operator-wired
e2e command; rejected.

## D9 — Vitest discovery for harness unit tests

**Decision**: extend `vitest.config.ts` include with
`"tests/live/**/__tests__/**/*.test.ts"`.

**Rationale**: the root config currently only scans `packages/**`; the
log-scan logic must be unit-covered in CI (FR-014). This ticket IS test
infrastructure, so the guardrail "don't modify test infra unless the ticket is
about test infra" is satisfied.

**Alternatives considered**: placing the test inside a package — wrong owner
(the script is repo-level tooling, not a package export); rejected.

## D10 — Bounded time (SC-001)

**Decision**: smoke.mjs wraps the whole run in a 60 s `AbortSignal.timeout`
budget; every fetch and psql exec carries its own 15 s timeout; timeout =
loud FAIL.

**Rationale**: the oracle is a gate — a hang is a red, not a wait.
