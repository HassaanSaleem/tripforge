# Quickstart: validating Group travel

Prereqs: Docker (compose stack), repo root. Loop sessions: host `pnpm` may be denied — run
gates in-image per the recipe in §3 (memory: tripforge-in-image-verify-recipe).

## 1. Unit + adapter gates (L1/L2)

```bash
pnpm test          # root — includes group-departure post/cancel/browse/join refusal paths,
                   # the pmf-event matrix additions (group_departure_posted, seat_joined),
                   # and the licensing.ts additive-copy unit tests
pnpm run lint
```

## 2. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
```

## 3. L3 group-travel suite against the compose Postgres

In-image (loop sessions; expects the verify image built with
`docker build -f apps/web/Dockerfile --target build -t tripforge-verify .`):

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expected: `l3-group-travel.test.ts` runs (not skipped) and is green — post → browse → join
walk with exact state deltas, the CONCURRENT LAST-SEAT RACE (two simultaneous joins against a
capacity-1 departure: exactly one `joined`, one `sold_out`, `seatsRemaining` lands at exactly
0, exactly one `group_departure_seat` row exists — SC-002/SC-003), and the white-label branch
(licensing a group departure produces an independent reseller seat pool that does not affect
the original's `seatsRemaining` — SC-004, plus the unchanged revenue-share conservation
identity from spec 006).

## 4. Live journey witness (evidence for the PR)

With the stack up, drive the journey end-to-end via the app's HTTP surface (Better Auth
sign-up establishes real sessions; tRPC procedures under `/api/trpc/workspace.groupTravel.*`
and the unchanged `/api/trpc/workspace.marketplace.*`):

1. Sign up agent A → create agency A; sign up agent B → agency B. Vet both (operator action):
   `docker compose exec web node packages/db/scripts/vet-agency.mjs <slug>`.
2. As A: draft/persist an itinerary, then `workspace.groupTravel.post` (capacity 2, a
   per-seat price) → expect `posted` with `seatsRemaining = 2`.
3. Browse (`workspace.groupTravel.browse`) as agency B → the departure is visible with
   `seatsRemaining = 2` and A's verified-seller badge.
4. As A: `join` twice for two named clients → both `joined`; `seatsRemaining` reaches 0 in the
   UI card ("0 of 2 seats left"); a third `join` → `sold_out`.
5. Post a FRESH departure (capacity 1) and fire two concurrent `join` calls (e.g. two browser
   tabs or two curl requests in parallel) → verify in Postgres exactly one
   `group_departure_seat` row exists and `group_departure.seats_remaining = 0`.
6. List that itinerary on the marketplace (`workspace.marketplace.createListing`); as B:
   `licenseListing` → expect `licensed`. Verify B now has an independent `group_departure` row
   (`SELECT seats_remaining, capacity FROM group_departure WHERE agency_id = '<B>'`) equal to
   the original's `capacity`, and that A's original `seats_remaining` is unaffected by any
   subsequent joins B's clients make on the copy.
7. Screenshot each step (Playwright MCP) into
   `.kitchenloop/evidence/<iteration>/demo-11-group-travel/`; scan compose logs
   (`docker compose logs --no-color`) for non-allowlisted `ERROR|FATAL|Unhandled`.

## 5. Teardown

```bash
docker compose down -v
```

Contract details: [contracts/group-travel.md](./contracts/group-travel.md).
Entities: [data-model.md](./data-model.md).
