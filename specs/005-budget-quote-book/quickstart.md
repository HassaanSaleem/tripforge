# Quickstart: Budget Allocator + Quote-Then-Book (005)

Validation walk proving the feature end-to-end. Everything runs with zero
paid services (sandbox supply, deterministic planner fake — INV-019).

## Prerequisites

- Docker running; repo checked out at this feature's branch.
- No `ANTHROPIC_API_KEY` needed (FakeLLM path is the default).

## 1. Unit/adapter gates (L1/L2)

```bash
pnpm test           # vitest: domain money/budget/assemble exhaustive,
                    # llm planner tools + fake, api caller tests (RBAC + flows)
pnpm run lint
```

If the host denies pnpm (ENV-PNPM-DENY), run inside the built image:

```bash
docker build --target build -t tripforge-verify .
docker run --rm tripforge-verify pnpm test
docker run --rm tripforge-verify pnpm run lint
```

## 2. Boot the built stack (INV-027 target)

```bash
docker compose down -v && docker compose up --build --wait
```

Expect: postgres healthy, migrate exits 0 (drizzle push creates the five new
tables + PMF views), web healthy on :3000.

## 3. L3 smoke — the sealed oracle, now walking draft→quote→book

```bash
node tests/integration/smoke.mjs
```

Expect (new checks beyond the existing ones): agent bootstrap
(sign-up → organization → session), then

- draft: `itinerary +1`, `pmf_event +1` (trip_created), others conserved;
  response itinerary validates and allocations sum to the budget;
- quote: `booking_quote +N` (N = bookable items), holds carry expiry + MoR;
- book: `booking +1`, `booking_component +N`, `markup_ledger +N`,
  `pmf_event +N` (booking_confirmed), sell − net = markup per row;
- double-book same quote rows: typed failure, **zero** state delta.

## 4. Failure-branch L3 (conservation) — env-gated vitest against compose Postgres

```bash
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm --filter @tripforge/api test
```

Expect `l3-booking.test.ts` to run (not skip) and prove: expired quote →
typed failure + zero delta; partial failure (fail-book offer) → siblings
confirm, failure writes zero rows; all-fail → nothing written; hallucinated
offerId dropped at verification.

## 5. Log scan + teardown

```bash
docker compose logs --no-color > /tmp/compose.log
grep -E "ERROR|FATAL|Unhandled" /tmp/compose.log   # expect: no non-allowlisted hits
docker compose down -v
```

## Traceability

| Spec item | Proven by |
|---|---|
| SC-001/FR-001 | domain budget property tests (step 1) + smoke draft assertions (step 3) |
| SC-002/FR-003 | verification-drop test (step 4) + smoke item↔offer trace (step 3) |
| SC-003/FR-014 | steps 2–3 end-to-end with exact deltas |
| SC-004/FR-009 | expired/consumed tests (steps 3–4) |
| SC-005/FR-007/008 | ledger equality checks (steps 1, 3, 4) |
| SC-006/FR-011 | partial-failure test (step 4) |
| SC-007/FR-012 | PMF event deltas (step 3) + plan→book view query |
| SC-008/FR-015 | schema package untouched (diff) + parseItinerary round-trips |
