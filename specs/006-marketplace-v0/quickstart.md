# Quickstart: validating Marketplace v0

Prereqs: Docker (compose stack), repo root. Loop sessions: host `pnpm` may be
denied — run gates in-image per the recipe in §3 (memory:
tripforge-in-image-verify-recipe).

## 1. Unit + adapter gates (L1/L2)

```bash
pnpm test          # root — includes domain splitTakeRate, whiteLabelCopy,
                   # pmf-event matrix additions, marketplace refusal paths, RBAC ladder
pnpm run lint
```

## 2. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs        # 13/13 expected
```

## 3. L3 marketplace suite against the compose Postgres

In-image (loop sessions; expects the verify image built with
`docker build -f apps/web/Dockerfile --target build -t tripforge-verify .`):

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expected: `l3-marketplace.test.ts` runs (not skipped) and is green — the
list → license → rate walk, the conservation identity (price = take + credit),
the forced-failure zero-delta branch, the concurrent duplicate-license race
(exactly one winner), and every typed refusal (not_vetted / own_listing /
not_active / already_licensed / not_licensee).

## 4. Live journey witness (evidence for the PR)

With the stack up, drive the trade journey end-to-end via the app's HTTP
surface (Better Auth sign-up establishes real sessions; tRPC procedures under
`/api/trpc/workspace.marketplace.*`):

1. Sign up agent A → create agency A (seller); sign up agent B → agency B.
2. Vet both agencies (operator action):
   `docker compose exec web node packages/db/scripts/vet-agency.mjs <slug>`
   (or run the script against the exposed Postgres).
3. As A: draft/persist an itinerary (existing `workspace.itinerary.draft`),
   then `createListing` → expect `listed`.
4. As B: `browseListings` → the listing is visible; `licenseListing` →
   expect `licensed` with exact split; verify in Postgres:
   `SELECT price_minor, platform_take_minor, seller_credit_minor FROM revenue_share_ledger` —
   identity holds; the copy row exists under agency B with stamped provenance
   (`SELECT document->'provenance' FROM itinerary WHERE id = <copyItineraryId>`).
5. As B: `rateListing` (5 stars) → `rated`; as A: `licenseListing` on own
   listing → `own_listing`; unvetted agency C attempt → `not_vetted`.
6. Screenshot each step (Playwright MCP) into
   `.kitchenloop/evidence/iter-3/seed-0006/`; scan compose logs
   (`docker compose logs --no-color`) for non-allowlisted `ERROR|FATAL|Unhandled`.

## 5. Teardown

```bash
docker compose down -v
```

Contract details: [contracts/marketplace.md](./contracts/marketplace.md).
Entities: [data-model.md](./data-model.md).
