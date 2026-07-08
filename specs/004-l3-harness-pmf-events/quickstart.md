# Quickstart: Validating the L3 Harness + PMF Events

Prerequisites: docker daemon running; repo checkout. No host node_modules
needed for the live path.

## 1. Unit layer (CI-equivalent; no DB, no docker)

```bash
pnpm test          # vitest — includes packages/db pmf-events + tests/live log-scan units
pnpm run lint
```

(Loop runtime fallback: run both inside the built image —
`docker build --target build -t tripforge-verify . && docker run --rm tripforge-verify pnpm test`.)

Expected: all green; new suites `pmf-events.test.ts` and `log-scan.test.ts`
visible in the run.

## 2. Live L3 oracle (the sealed gate command)

```bash
docker compose down -v && docker compose up --build --wait   # verification.live.boot_command
node tests/integration/smoke.mjs                             # verification.oracle.smoke_command
```

Expected output (bounded < 60 s): the four pre-existing checks, then

```
  ok   sign-up state delta: user +1, account +1, session +1 (others conserved)
  ok   duplicate sign-up rejected (4xx) with zero state delta (conservation)
  ok   pmf_event table + 4 metric views present after migration
  ok   PMF views compute exact expected metrics from fixture tx (rolled back, no residue)

L3 smoke PASSED.
```

## 3. Falsifiability probes (SC-002 class — run once, revert)

- Break the delta: after boot, `docker compose exec -T postgres psql -U tripforge
  -d tripforge -c "ALTER TABLE session DISABLE TRIGGER ALL"`? — simpler:
  point smoke at a stack whose migrate didn't run (`docker compose up postgres -d`
  + `next start` without DB push) → checks 5–8 go red loudly.
- Break a view: `DROP VIEW pmf_gbv` → check 7 goes red.

## 4. Log-scan + evidence helpers (L4)

```bash
printf 'clean line\nERROR boom\n' > /tmp/l.log
node tests/live/log-scan.mjs /tmp/l.log                # exit 1, prints "MATCH: ERROR boom"
printf 'clean line\n' > /tmp/l.log
node tests/live/log-scan.mjs /tmp/l.log                # exit 0

# with the stack up:
node tests/live/collect-evidence.mjs --iteration 3 --ticket seed-0004
ls .kitchenloop/evidence/3/seed-0004/                  # compose.log (+ playwright artifacts if any)
echo $?                                                # log-scan verdict of the captured log
```

## 5. INV-021 same-transaction guarantee (unit witness)

`packages/db/src/__tests__/pmf-events.test.ts` includes the rollback-shape
test (stub executor capturing inserts; recorder never commits on its own).
The live rollback proof is oracle check 8 (fixtures vanish with ROLLBACK).

## 6. Teardown

```bash
docker compose down -v
```
