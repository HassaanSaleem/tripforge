# Data Model: L3 State-Delta Harness + PMF Instrumentation Events

## Table: `pmf_event` (packages/db, Drizzle `pmfEvent`)

Append-only, tenant-scoped event store (INV-004, INV-009, INV-021). Not part
of the canonical itinerary schema (Constitution IV untouched — itineraries are
referenced by opaque id only).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, `default gen_random_uuid()` (PG17 built-in) |
| `type` | `text` | NOT NULL | closed TS vocabulary: `trip_created` \| `booking_confirmed` \| `take_rate_accrued` |
| `agency_id` | `text` | NOT NULL | FK → `organization.id`, `on delete cascade` — the owning tenant (INV-004) |
| `actor_user_id` | `text` | NULL | FK → `user.id`, `on delete set null` — who performed the action, when known |
| `itinerary_id` | `text` | NULL | opaque reference; required by `trip_created`/`booking_confirmed` (TS-validated, not DB-enforced — the itineraries table does not exist yet) |
| `source` | `text` | NULL | only for `trip_created`: `self_built` \| `licensed` |
| `amount_minor` | `bigint` | NULL | only for monetary types; integer minor units, ≥ 0 (INV-009) |
| `currency` | `text` | NULL | only with `amount_minor`; ISO-4217 alpha-3 uppercase |
| `created_at` | `timestamp` | NOT NULL | `default now()` — the business action time (same tx, INV-021) |

Index: `(type, agency_id)` — the access path of every view and future
per-tenant metric query.

**Validation invariants (TS, enforced before insert — see contracts):**

- unknown `type` → reject
- `agencyId` empty → reject
- monetary type (`booking_confirmed`, `take_rate_accrued`) ⇔ `amountMinor`
  required, `Number.isSafeInteger`, ≥ 0, and `currency` required `^[A-Z]{3}$`
- non-monetary type with `amountMinor`/`currency` present → reject
- `trip_created` ⇔ `source` required ∈ {`self_built`, `licensed`};
  other types with `source` → reject
- `trip_created`/`booking_confirmed` require `itineraryId` non-empty

**State transitions**: none — append-only; rows are never updated or deleted
by application code (metric integrity).

## Views (packages/db/sql/pmf-views.sql — idempotent DROP+CREATE)

All money aggregation is grouped by currency; no cross-currency sums (INV-009).

### `pmf_gbv` — North Star

```sql
SELECT currency,
       SUM(amount_minor)::bigint AS gbv_minor,
       COUNT(*)                  AS bookings
FROM pmf_event
WHERE type = 'booking_confirmed'
GROUP BY currency;
```

### `pmf_take_rate_per_active_agent`

Active agent (v0 definition, spec Assumptions): an agency with ≥ 1
`take_rate_accrued` event in that currency.

```sql
SELECT currency,
       SUM(amount_minor)::bigint                          AS revenue_minor,
       COUNT(DISTINCT agency_id)                          AS active_agents,
       (SUM(amount_minor) / COUNT(DISTINCT agency_id))::bigint
                                                          AS revenue_minor_per_active_agent
FROM pmf_event
WHERE type = 'take_rate_accrued'
GROUP BY currency;
```

(Integer floor division — documented; minor-unit precision loss ≤ 1 unit is a
reporting convention, not a ledger value.)

### `pmf_resold_vs_self_built`

```sql
SELECT COUNT(*) FILTER (WHERE source = 'licensed')   AS resold_trips,
       COUNT(*) FILTER (WHERE source = 'self_built') AS self_built_trips
FROM pmf_event
WHERE type = 'trip_created';
```

### `pmf_plan_to_book`

A trip (plan) converts when at least one booking is confirmed against its
itinerary.

```sql
SELECT (SELECT COUNT(*) FROM pmf_event WHERE type = 'trip_created')  AS trips_created,
       (SELECT COUNT(DISTINCT itinerary_id) FROM pmf_event
         WHERE type = 'booking_confirmed')                            AS trips_booked;
```

Empty-store behavior: `pmf_gbv`/`pmf_take_rate_per_active_agent` return zero
rows; `pmf_resold_vs_self_built`/`pmf_plan_to_book` return one all-zero row —
both are valid "no data yet" answers (edge case in spec).

## Harness value shapes (tests/integration/harness.mjs — plain JS)

- **Snapshot**: `Map<tableName, rowCount>` over a declared watched-table list.
- **Delta**: `{ [tableName]: after - before }` — compared against an exact
  expected object; `assertConserved` = expected all-zeros.
- **Watched tables v0**: `user`, `account`, `session`, `organization`,
  `member`, `pmf_event`.

## Log allowlist (tests/live/log-allowlist.json)

```json
{
  "entries": []
}
```

Each future entry: `{ "substring": "<exact log fragment>", "justification":
"<why benign + PR reference>" }`. An entry with an empty justification does
not allowlist anything (scan treats it as absent).
