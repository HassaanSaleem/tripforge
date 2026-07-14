# Data Model: Request-an-agent fork

The new table lives in `packages/db/src/schema-trip-handoffs.ts` (new file,
Drizzle, applied via `drizzle-kit push` — no `migrations/` folder in this repo,
see research.md D-context / plan.md Storage), assembled into
`packages/db/src/schema.ts` alongside `schema-group-travel.ts`. Conventions
inherited from spec 010/021: uuid PK (`defaultRandom`), tenant `agency_id →
organization.id` via `agencyFk()` (INV-004), `itinerary_id` via `itineraryFk()`
(cascade — dies with its itinerary, same as `itinerary_share_link`),
timestamps `defaultNow`.

**Naming**: `TripHandoffRequest` / `trip_handoff_request` — deliberately NOT
`TripRequest`/`trip_request`, which already names an unrelated, pervasive type
(the planner's search criteria). See research.md D5.

## trip_handoff_request (FR-001–FR-011, research D1/D3/D4/D5)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| itinerary_id | uuid NOT NULL → itinerary.id (`itineraryFk`, cascade) | the trip being viewed when the request was made |
| agency_id | text NOT NULL → organization.id (cascade, `agencyFk`) | the itinerary's CURRENT owning agency at submission time (research D4) — this, not any provenance field, decides whose inbox the request lands in |
| contact_name | text NOT NULL | required so the agent always has someone to contact (FR-002/FR-004) |
| contact_email | text NULL | optional (FR-002); `z.email().optional()` at the zod boundary, mirroring `group-departures.ts`'s `travelerEmail` convention |
| notes | text NULL | optional free-text from the traveler (FR-002) |
| status | text NOT NULL | closed enum: `new` \| `accepted` (FR-003/FR-008) |
| created_at | timestamp NOT NULL defaultNow | newest-first ordering for the inbox (FR-006) |

Indexes: `index(agency_id, created_at)` — the inbox query is always `WHERE
agency_id = ? ORDER BY created_at DESC`, so a composite index serves it
directly without a separate sort step.

State transitions: `new → accepted` (agent action, FR-008); one-way, no
`accepted → new` transition exists (matches the "no in-place edit" simplicity
convention of `group_departure`'s `active → cancelled`). Re-applying `new →
accepted` to an already-`accepted` row is idempotent (research D3) — not
modeled as a separate transition, just a no-op UPDATE outcome.

No `mode` column: "Book it myself" is a UI-only stub with no persisted record
(research D1) — every row in this table is, by construction, a request-an-agent
submission. If a future ticket needs to persist the self-drive choice too, that
is a new column/decision for that ticket, not speculative work here (YAGNI).

## Existing tables touched

- **`itinerary`**: read-only. `trip_handoff_request.agency_id` is populated
  from `itinerary.agency_id` at submission time (research D4) — no column
  added or changed on `itinerary` itself.
- **`itinerary_share_link`**: read-only, via the SAME token-resolution path
  `client-view.ts` already uses to serve `/view/[token]` — the request-handoff
  mutation validates the token exactly as the existing view query does (FR-010),
  no new token/validation logic introduced.

## Canonical itinerary schema

**NO change** — a trip handoff request is bolt-on side data about an
itinerary, exactly like `itinerary_share_link`/`group_departure`. No
`SCHEMA_VERSION` bump, hence no operator schema gate.
