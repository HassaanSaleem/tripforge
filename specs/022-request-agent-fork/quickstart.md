# Quickstart: validating the request-agent fork

Prereqs: Docker (compose stack), repo root. Loop sessions: host `pnpm` may be
denied — run gates in-image per the recipe in
`.kitchenloop/quality-bar.md`/memory (tripforge-in-image-verify-recipe).

## 1. Unit + adapter gates (L1/L2)

```bash
pnpm test          # includes trip-handoffs.ts service tests (submit/list/accept,
                   # idempotent accept, cross-tenant refusal, resolveShareLink-style
                   # not_found on an unknown token)
pnpm run lint
```

## 2. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
```

## 3. L3 trip-handoffs suite against the compose Postgres

In-image (loop sessions; expects the verify image built with
`docker build -f apps/web/Dockerfile --target build -t tripforge-verify .`):

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expected: `l3-trip-handoffs.test.ts` runs (not skipped) and is green — submit
(via a real share token) → the row lands with the itinerary's current
`agency_id` (state-delta assertion) → tenant-scoped list shows it only to the
owning agency, never to another agency's session → accept transitions
`new → accepted`, and a second accept call on the same id is a no-op returning
the same outcome (SC-002/SC-003 from spec.md).

## 4. Live journey witness (evidence for the PR)

With the stack up, drive the journey end-to-end via the app's HTTP surface:

1. Sign up agent A → create agency A; vet it (operator action):
   `docker compose exec web node packages/db/scripts/vet-agency.mjs <slug>`.
2. As A: draft/persist an itinerary and mint a share link
   (`clientView.itinerary` already does this per spec 010) → note the
   `/view/<token>` URL.
3. Open `/view/<token>` in a fresh (unauthenticated) browser context — confirm
   the two-choice fork renders below the itinerary, with zero platform
   branding (INV-020, same check as the existing client-view live-test
   witness).
4. Choose "Book it myself" → confirm a clear confirmation message, no broken
   navigation, and (via Postgres) that NO `trip_handoff_request` row was
   created for this interaction.
5. Reload `/view/<token>`, choose "Have an agent arrange this for me," submit
   a name and a note (leave email blank) → confirm a success confirmation in
   the UI, then verify in Postgres:
   `SELECT contact_name, contact_email, status, agency_id FROM trip_handoff_request
   ORDER BY created_at DESC LIMIT 1;` — expect the submitted name, `NULL`
   email, `status = 'new'`, and `agency_id` equal to agency A's id.
6. As agent A, open the workspace "Trip requests" inbox → confirm the request
   appears with the submitted name/note and status `new`.
7. Click Accept → confirm the status updates to `accepted` in the UI without a
   full page reload, and re-clicking Accept (or reloading and clicking again)
   stays `accepted` with no error.
8. Sign up a second agent B (different agency) → confirm B's own "Trip
   requests" inbox does NOT show agency A's request (INV-004 tenant scoping,
   SC-002).
9. Screenshot each step (Playwright MCP) into
   `.kitchenloop/evidence/<iteration>/demo-09-request-agent/`; scan compose
   logs (`docker compose logs --no-color`) for non-allowlisted
   `ERROR|FATAL|Unhandled`.

## 5. Teardown

```bash
docker compose down -v
```

Contract details: [contracts/request-agent-fork.md](./contracts/request-agent-fork.md).
Entities: [data-model.md](./data-model.md).
