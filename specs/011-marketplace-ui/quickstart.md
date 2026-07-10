# Quickstart — Marketplace UI (011)

Validation guide; contracts in [contracts/marketplace-ui.md](./contracts/marketplace-ui.md),
projections in [data-model.md](./data-model.md).

## Prerequisites

- Docker (compose) — the stack runs keyless: empty `ANTHROPIC_API_KEY` uses the
  deterministic FakeLLM planner and sandbox supply.

## 1. Unit + integration gates

```bash
pnpm run lint      # eslint clean
pnpm test          # root vitest: marketplace-flow L1s + l3-itinerary-list vs Postgres + all priors
```

Expected: all green; the new L1 suite covers every helper in contract §6; the
L3 suite proves INV-004 scoping of `workspace.itinerary.list`.

## 2. Built-stack boot (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
npx playwright test                       # includes marketplace-journey.spec.ts
```

## 3. Browser walkthrough (what a demo shows)

1. `http://localhost:3000/sign-up` → create **Agency A** (any fresh email).
2. `/workspace` → draft any trip (e.g. Lisbon, 2 adults, budget 2500 EUR).
3. Header → **Marketplace** → listing form: pick the draft, title it, fee e.g.
   `450`, terms text, share `10` % → **List it** → confirmation +
   the card appears marked **Your listing** (no license button).
4. Sign out → `/sign-up` → create **Agency B**.
5. **Marketplace** → A's card visible (no marker) → **License this trip** →
   receipt shows the white-label copy id and the recorded split (fee, seller
   credit, platform take) — integers straight from the platform.
6. License again → benign "already licensed" notice; nothing double-recorded.
7. Signed-out visit to `/marketplace` → membership prompt, zero listing data.

## 4. Log scan

```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled"
```

Expected: no non-allowlisted lines (allowlist is empty).

## 5. Teardown

```bash
docker compose down -v
```
