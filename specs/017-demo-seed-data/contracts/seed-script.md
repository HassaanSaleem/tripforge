# Contract: Demo Seed Script

## Scope

`apps/web/scripts/seed-demo.ts`, invoked as `pnpm --filter @tripforge/web run
db:seed`, run as the final step of the Docker `migrate` stage/service (after
`db:push && db:views`).

## Preconditions

- `DATABASE_URL` is set and points at a schema-pushed, views-applied
  Postgres database (guaranteed by running after `db:push`/`db:views` in the
  same shell invocation).
- No `web` service (HTTP server) needs to be running — the script talks to
  the database and the in-process application layer directly.

## Contract

1. **Exit code 0** on success, whether the database was empty or already
   fully seeded (idempotent — see data-model.md's Idempotency Keys section).
2. **Never throws past its own top-level catch on an "already exists" class
   outcome** — an already-seeded agency/user/listing/license is a logged
   skip, not a failure.
3. **A genuine failure (e.g. database unreachable, an unexpected non-"already"
   typed failure from a router call) exits non-zero** so the Docker migrate
   stage fails loudly rather than silently leaving the demo half-seeded.
4. **Every seeded login is printed to stdout** (agency name, email,
   password) — this becomes the PR body's documented demo credentials.
5. **No money-math is computed inline in the script** — every price/split is
   either a literal integer-minor-units input to a real service call
   (`createListing`'s `priceMinor`, `revenueShareBps`) or a value the
   service call itself returns/records (the license split, PMF events).
6. **No direct writes to any money-ledger table** — `revenue_share_ledger`,
   `pmf_event`, `booking_component`, `markup_ledger` are never touched by
   raw insert; only `organization`/`member`/`agency_vetting` (identity/
   tenancy scaffolding, not money) are inserted directly.

## Output contract (stdout shape, human-readable, not machine-parsed)

```text
seed-demo: agency "Azure Travel Co" (demo-azure-travel-co) — already vetted, skipping
seed-demo: agency "Meridian DMC" (demo-meridian-dmc) — VETTED
seed-demo: user owner@azure-travel-demo.test / <password> — created
...
seed-demo: itinerary "[demo] Lisbon Getaway" (agency demo-azure-travel-co) — drafted, budget fits
seed-demo: listing for "[demo] Lisbon Getaway" — already_listed, skipping
seed-demo: license (listing X, reseller demo-kaido-journeys) — LICENSED, split 250.00=225.00+25.00 USD
seed-demo: rating (listing X, rater demo-kaido-journeys) — RATED 5 stars
seed-demo: done — 5 agencies, 7 itineraries, 4 listings, 3 licenses, 3 ratings
```

## Failure modes (typed, non-throwing)

| Source call | "Already done" outcome treated as skip | Genuine failure (re-thrown / logged as error) |
|---|---|---|
| `signUpEmail` | email already registered | any other error |
| `createListing` | `already_listed` | `not_found`, `not_vetted`, `provenance_incomplete` |
| `licenseListing` | `already_licensed` | `not_found`, `not_vetted`, `own_listing`, `not_active` |
| `rateListing` | N/A — upsert always succeeds | `not_found`, `not_licensee` |
| `workspace.itinerary.draft` | N/A — guarded by the script's own pre-check (see data-model.md) | `infeasible`, `planner_failed` |
