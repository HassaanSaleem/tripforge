# Quickstart Validation: Supply Adapter Port Family

How to prove this feature works, end to end, with zero paid services and zero
supplier credentials (INV-019). Loop-runtime note: host `pnpm` may be denied
(desk row ENV-PNPM-DENY) — every step below has an in-image equivalent.

## Prerequisites

- Docker (compose) — the only hard requirement for the in-image path.
- Repo checkout at this feature's branch.

## 1. L1/L2 — contract suite green (SC-001/002/003/005)

Host (if pnpm allowed):

```bash
pnpm test
```

In-image (loop runtime):

```bash
docker build --target build -t tripforge-verify -f apps/web/Dockerfile .
docker run --rm tripforge-verify pnpm test
```

**Expected**: all vitest suites pass, including
`packages/supply-adapter/src/__tests__/` — 4 × `*.contract.test.ts` (one per
component, same shared suite) + `partial-failure.test.ts`. Existing 51 tests
stay green.

## 2. Lint + boundaries (INV-017, SC-004)

```bash
docker run --rm tripforge-verify pnpm run lint
docker run --rm tripforge-verify pnpm run depcruise
```

Supplier-shape leak audit (SC-004) — expect ZERO matches outside
`packages/supply-adapter` and this spec directory:

```bash
grep -rniE "ratehawk|hotelbeds|webbeds|\btbo\b|viator|getyourguide|tiqets|klook|mozio|jayride|holidaytaxis|cartrawler" \
  apps packages tests --include='*.ts' --include='*.tsx'
```

**Expected**: no output (the sandbox adapters themselves use OUR shapes, so
even inside the package these identifiers appear only in boundary comments,
if at all).

## 3. Schema untouched (SC-006, FR-012, D-006)

```bash
git diff origin/main -- packages/itinerary-schema
```

**Expected**: empty diff.

## 4. Live gate (INV-027 — composition root is in the boot path)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
docker compose logs --no-color   # scan: no ERROR|FATAL|Unhandled beyond allowlist (allowlist is empty)
docker compose down -v
```

**Expected**: `--wait` exits 0 (all services healthy), smoke 5/5, log scan
clean. No browser journey — no UI-facing change (recorded in the PR body).

## 5. Swap-cost demonstration (US4)

The contract suite file is implementation-agnostic: point its harness at any
other `SupplyPort` implementation and it runs unchanged. Today's proof: the
same suite file instantiated four times against four different adapters; the
only per-adapter code is fixtures/criteria (see the four
`*.contract.test.ts` files, each < ~30 lines).
