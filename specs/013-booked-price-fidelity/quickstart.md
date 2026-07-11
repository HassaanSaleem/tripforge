# Quickstart: Validating Booked-Price Fidelity

**Feature**: specs/013-booked-price-fidelity

## Prerequisites

- Docker running; ports 3000/5432/8025 free (or use the alternate-port override project —
  BETTER_AUTH_URL must equal the browser origin exactly).
- Keyless is fine: empty `ANTHROPIC_API_KEY` → deterministic FakeLLM planner.

## 1. Boot the built stack

```bash
docker compose down -v && docker compose up --build --wait
```

## 2. Deterministic suites (in the built image — host pnpm may be denied)

```bash
# L1 projection + L3 against the compose Postgres (root pnpm test runs everything)
docker compose exec web pnpm test
# The seed-0025 red-witness: with the fix reverted, the new L3 assertion
# "client view equals the booked ledger sells" fails with the exact markup delta.
```

## 3. E2E specs

```bash
npx playwright test tests/e2e/   # includes the client-view booked-price/estimate specs
```

## 4. Live browser validation (the original repro, now green)

1. `http://localhost:3000` → sign up an agency.
2. Draft any trip (FakeLLM), quote at **22%** markup, book all components — note the booked
   client prices on the confirmation.
3. Share with client → open `/view/<token>` in a fresh/incognito context.
4. **Expect**: every booked item shows the booking confirmation's client price (not the
   lower net figure); the trip total equals the confirmation total; un-booked priced items
   (if any) carry an `estimate` marker and the total says it includes estimates.
5. DB cross-check (exactness witness):

   ```bash
   docker compose exec postgres psql -U tripforge -c \
     "SELECT sum(sell_minor) FROM markup_ledger;"
   ```

   The client-view total for a fully-booked trip must equal this sum for that itinerary's
   components (zero minor-unit delta).

## 5. Live scenario (hard assertion)

```bash
BASE_URL=http://localhost:3000 node scenarios/incubating/reseller-books-copy-live/scenario.mjs
```

The former "price-fidelity observation" is now a hard check: client-view booked sum ==
reseller markup_ledger sell sum. Also re-run the golden path:

```bash
node scenarios/incubating/golden-path-trade-live/scenario.mjs
```

## 6. Log scan

```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled"
```

Only documented-benign lines (L3 race duplicate-key) are acceptable.

## Teardown

```bash
docker compose down -v
```
