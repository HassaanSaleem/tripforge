# Quickstart: validating traveler client accounts

Prereqs: Docker (compose stack), repo root. Loop sessions: host `pnpm` may be denied — run
gates in-image per the recipe in `.kitchenloop/quality-bar.md`/memory
(tripforge-in-image-verify-recipe).

## 1. Unit + adapter gates (L1/L2)

```bash
pnpm test          # includes getUserIdentity/getSignedInIdentity service tests and the
                    # clientView.me contract (UNAUTHORIZED when anonymous)
pnpm run lint
```

## 2. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
```

## 3. L3 traveler-accounts suite against the compose Postgres

In-image (loop sessions; expects the verify image built with
`docker build -f apps/web/Dockerfile --target build -t tripforge-verify .`):

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expected: `l3-traveler-accounts.test.ts` runs (not skipped) and is green:

- Anonymous `clientView.itinerary` + `clientView.requestHandoff` are byte-identical to
  their pre-feature behavior (regression guard, spec 010/022's existing assertions still
  pass unmodified).
- `clientView.me` throws `UNAUTHORIZED` for `callerFor(null)`.
- A traveler session (`{ userId }`, no membership) calling `clientView.me` gets back
  exactly their own `{ name, email }` — never another traveler's.
- The SAME traveler session calling ANY `workspace.*` procedure (e.g. `workspace.whoami`)
  is rejected `FORBIDDEN` (INV-024) — proves sign-in never grants workspace access.
- A signed-in agent's own `clientView.me` also succeeds (FR-005), and the payload never
  contains net rate/markup/budget fields regardless of caller (INV-020 regression check).

## 4. Live journey witness (evidence for the PR)

With the stack up, drive the journey end-to-end via the app's HTTP surface:

1. Sign up agent A → create agency A → vet it (operator action):
   `docker compose exec web node packages/db/scripts/vet-agency.mjs <slug>`.
2. As A: draft/persist an itinerary and mint a share link → note the `/view/<token>` URL.
3. In a FRESH (unauthenticated) browser context, open `/view/<token>` → confirm the page
   renders exactly as before (regression witness — same header, same items, same fork).
4. Click through to "Have an agent arrange this for me" WITHOUT signing in → confirm the
   name/email fields are blank and editable, exactly as before this feature.
5. Navigate to `/view/sign-up?token=<token>` → confirm the form has NO field, button, or
   copy mentioning an agency/organization anywhere (INV-024 negative check) → sign up as
   a traveler ("Amina Yusuf" / `amina@example.test`) → confirm landing back on
   `/view/<token>` signed in.
6. Click "Have an agent arrange this for me" → confirm the name field shows
   "Amina Yusuf" and the email field shows `amina@example.test`, both editable.
7. Edit the name to "Amina (on behalf of family)" and submit → verify in Postgres the
   created `trip_handoff_request.contact_name` is the EDITED value, not the account name
   (`trip_handoff_request` schema/shape unchanged from spec 022).
8. Sign out → reload `/view/<token>` → confirm the fork form is blank again (no residual
   pre-fill).
9. Sign back in via `/view/sign-in?token=<token>` → open a DIFFERENT shared trip (a second
   itinerary/token) → confirm the SAME pre-fill appears (per-account, not per-trip).
10. As agent A, open the workspace "Trip requests" inbox → confirm the request from step 7
    appears exactly as any other request would (no new fields, no schema change visible).
11. Screenshot each step (Playwright MCP) into
    `.kitchenloop/evidence/<iteration>/p2-consumer-accounts-identity/`; scan compose logs
    (`docker compose logs --no-color`) for non-allowlisted `ERROR|FATAL|Unhandled`.

## 5. Teardown

```bash
docker compose down -v
```

Contract details: [contracts/traveler-accounts.md](./contracts/traveler-accounts.md).
Entities: [data-model.md](./data-model.md) (no new tables — read shape only).
