# Quickstart: validating traveler trip history ("My Trips")

Prereqs: Docker (compose stack), repo root. Loop sessions: host `pnpm` may be denied — run gates
in-image per the recipe in `.kitchenloop/quality-bar.md`/memory (tripforge-in-image-verify-recipe).

## 1. Unit + adapter gates (L1/L2)

```bash
pnpm test          # includes attachTraveler/listTravelerTrips service tests and the
                    # clientView.attachTrip/myTrips contracts (UNAUTHORIZED when anonymous)
pnpm run lint
```

## 2. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
```

## 3. `db:push` picks up the new `client_trip_link` table

The `migrate` compose service runs `drizzle-kit push` on boot (step 2 already exercises this). No
manual step — additive/backfill-free, confirmed by re-running step 2 against an already-migrated
volume and observing zero errors.

## 4. L3 traveler-trip-history suite against the compose Postgres

In-image (loop sessions; expects the verify image built with
`docker build -f apps/web/Dockerfile --target build -t tripforge-verify .`):

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expected: `l3-traveler-trip-history.test.ts` runs (not skipped) and is green:

- Anonymous `clientView.itinerary` + `clientView.requestHandoff` remain byte-identical to their
  pre-feature behavior (regression guard, same class as spec 030's own regression check).
- Anonymous `clientView.attachTrip`/`clientView.myTrips` both throw `UNAUTHORIZED`.
- A signed-in traveler who calls `attachTrip` twice on the same token produces exactly ONE
  `client_trip_link` row (idempotency).
- `myTrips` for that traveler returns exactly the trips they attached — never another traveler's,
  never an agency's internal listing.
- The `myTrips` payload negative-check: serialized JSON never contains `netMinor`/`markup`/agency
  member ids, only the same client-facing fields `resolveShareLink` already allows (INV-020).

## 5. Live journey witness (evidence for the PR)

With the stack up, drive the journey end-to-end via the app's HTTP surface:

1. Sign up agent A → create agency A → vet it (operator action):
   `docker compose exec web node packages/db/scripts/vet-agency.mjs <slug>`.
2. As A: draft/persist TWO itineraries and mint share links for both → note both `/view/<token>`
   URLs.
3. In a FRESH (unauthenticated) browser context, open token #1 → confirm the page renders exactly
   as before, with NO "My Trips" link anywhere (regression witness).
4. Sign up as a traveler from `/view/sign-up?token=<token#1>` ("Amina Yusuf" /
   `amina@example.test`) → confirm landing back on `/view/<token#1>` signed in, and the account
   strip now shows a "My Trips" link alongside "Signed in as Amina Yusuf".
5. Click "My Trips" → confirm the list shows trip #1 (just viewed) and does NOT show trip #2 (never
   viewed by this traveler).
6. Select trip #1 from the list → confirm it opens the exact same `/view/<token#1>` page (same
   title, same agency name, same items).
7. Navigate directly to token #2 (still signed in) → then revisit "My Trips" → confirm BOTH trips
   now appear, newest-viewed first.
8. Revisit token #1 a second time → revisit "My Trips" → confirm trip #1 still appears exactly
   once (no duplicate row).
9. Sign out → navigate directly to `/view/my-trips` → confirm redirect to `/view/sign-in` (no trip
   data ever rendered while signed out).
10. Sign up a SECOND traveler ("Priya Shah") from `/view/sign-up?token=<token#1>` → open token #1
    as Priya → open "My Trips" as Priya → confirm it shows ONLY trip #1 (the one Priya herself
    viewed), never trip #2, and Amina's list is unaffected (cross-traveler isolation witness).
11. Screenshot each step (Playwright MCP) into
    `.kitchenloop/evidence/<iteration>/p2-consumer-trip-history/`; scan compose logs
    (`docker compose logs --no-color`) for non-allowlisted `ERROR|FATAL|Unhandled`.

## 6. Teardown

```bash
docker compose down -v
```

Contract details: [contracts/traveler-trip-history.md](./contracts/traveler-trip-history.md).
Entities: [data-model.md](./data-model.md) (one new table, `client_trip_link`).
