# Quickstart: validating Bring-Your-Own Itinerary

Prereqs: Docker (compose stack), repo root. Loop sessions: host `pnpm` may be
denied — run gates in-image per the recipe in memory
`tripforge-in-image-verify-recipe`.

## 1. Unit + adapter gates (L1/L2)

```bash
pnpm test          # root — createManual validation/persist tests, the new
                    # itineraries.ts service unit tests, and the unchanged
                    # planner.ts/licensing.ts insert-site tests (creationSource
                    # added, source: "self_built"/"licensed" untouched)
pnpm run lint
```

## 2. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
```

## 3. L3 suite against the compose Postgres

In-image (loop sessions; expects the verify image built with
`docker build -f apps/web/Dockerfile --target build -t tripforge-verify .`):

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expected: a new `l3-manual-itinerary.test.ts` (or extension of an existing
itinerary L3 file) runs and is green — real-Postgres state deltas for:
create → row exists with `creation_source = 'manual'` and a valid
`trip_request`; the item stays excluded from `bookable` at quote time until a
rate is attached via `applyChatEdit`; once attached, quote → book completes
with the SAME conservation guarantees as an AI-drafted item (no orphan
`booking_quote`/`booking_component` rows on a forced failure); list → license
→ white-label copy gets `creation_source = 'licensed_copy'` independent of
the original's value; client-view of an unpriced manual item renders `null`
price with zero markup/net-rate leakage (INV-020 negative assertion).

## 4. Live journey witness (evidence for the PR)

With the stack up, drive the journey end-to-end via the app's HTTP surface
(Better Auth sign-up establishes real sessions):

1. Sign up an agent, create an agency.
2. Start a new itinerary via the manual builder (not the AI chat) — enter a
   title, destination, dates, party size.
3. Add 2 days; add a stay item to day 1 (title, check-in/out, occupancy), an
   activity item to day 2 (title, start time) — save without picking any
   supplier rate.
4. Reopen the itinerary from the workspace list → confirm it shows the
   entered days/items and an "AI-drafted"-vs-"Self-built" origin badge
   distinct from AI-drafted trips already in the demo seed.
5. Use chat-edit (`applyChatEdit`/the chat panel) to attach a real sandbox
   supplier rate to the stay item → confirm the item now shows a price.
6. Run quote-then-book on the itinerary → confirm the priced stay item books;
   the still-unpriced activity item is excluded from the booking (visible in
   the UI, no error).
7. List the itinerary on the marketplace; sign up a second agency, license
   and white-label it → confirm the copy carries the "Licensed copy"
   badge (not the manual/AI-drafted badge) and the revenue-share split
   conserves as usual.
8. Share the itinerary to a client-view link; open it signed-out → confirm
   the days/items render with client-facing prices only (the unpriced
   activity shows no price), no markup/net-rate strings anywhere in the page.
9. Screenshot each step (Playwright MCP) into
   `.kitchenloop/evidence/<iteration>/agent-upload-own-itinerary/`; scan
   compose logs (`docker compose logs --no-color`) for non-allowlisted
   `ERROR|FATAL|Unhandled`.

## 5. Teardown

```bash
docker compose down -v
```

Contract details: [contracts/manual-itinerary.md](./contracts/manual-itinerary.md).
Entities: [data-model.md](./data-model.md).
