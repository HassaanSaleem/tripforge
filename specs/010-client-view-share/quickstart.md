# Quickstart: validating Client-View Share (spec 010)

Runnable validation guide — proves the feature end-to-end. Contracts:
[contracts/client-view.md](./contracts/client-view.md); shapes:
[data-model.md](./data-model.md).

## Prerequisites

- Docker running; repo checked out on the feature branch.
- No keys needed (FakeLLM path; sandbox suppliers).

## 1. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
```

Expect: exit 0; postgres, mailpit, migrate (exited-ok), web healthy. The new
`itinerary_share_link` table is applied by the migrate stage (`drizzle-kit push`).

## 2. L1/L2 + L3 suites (in-image when host pnpm is denied)

```bash
docker compose exec web pnpm test        # or: pnpm test (workspace root)
```

Expect: existing suites green + new `client-view-projection.test.ts` (L1 redaction/
total) and `l3-client-view.test.ts` (real Postgres: share, idempotent re-share,
concurrent race → 1 row, cross-tenant NOT_FOUND, unknown token, booked marks,
full-payload confidentiality scan).

## 3. Live smoke

```bash
node tests/integration/smoke.mjs
```

Expect: all checks green, including the new share → anonymous-resolve →
confidentiality/branding checks (contract §5).

## 4. Browser journey (L4)

```bash
npx playwright test tests/e2e/client-view-journey.spec.ts   # new spec
npx playwright test                                          # full suite incl. trust-boundary (must stay green)
```

The journey: sign-up (agent+agency) → draft an itinerary → click "Share with client" →
copy URL → open it in a **fresh anonymous browser context** → assert: agency name
visible; day/items with sell prices; tab title carries trip+agency, NOT
TripForge/Trellis; no netRate/markup/budget values anywhere in the page; no workspace
affordances.

## 5. Manual QA spot-checks

- Open the share URL in a private window (no cookies): renders read-only, no sign-in.
- Mutate the token's last character: neutral "trip link isn't available" state.
- Book an item via the workspace booking flow, reload the share URL: that item shows
  the Booked badge.
- View page source (Cmd-U): search for `netRate`, `netMinor`, `markup`, `supplyRef`,
  `budgetMode`, `TripForge`, `Trellis` — zero hits (SC-002/SC-003).

## 6. Teardown

```bash
docker compose down -v
```
