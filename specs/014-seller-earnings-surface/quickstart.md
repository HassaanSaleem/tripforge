# Quickstart: Seller Earnings Surface (spec 014)

Validation guide — proves the feature end-to-end against the BUILT compose
image (INV-027). Runs keyless: empty `ANTHROPIC_API_KEY` → deterministic
FakeLLM planner.

## Prerequisites

- Docker + compose; ports 3000/5432/8025 free
- Repo root; no host `node_modules` needed (hermetic image)

## 1. Boot the built stack

```bash
docker compose down -v && docker compose up --build --wait
```

Expect: all services healthy, exit 0.

## 2. Deterministic suites

```bash
# L1/L2/L3 inside the built image (loop sessions: host pnpm denied)
docker compose exec web pnpm test
# L3 smoke against the live stack
node tests/integration/smoke.mjs
# Full e2e suite
npx playwright test
```

Expect: all green, including the new L3 assertions in
`l3-marketplace.test.ts` (N-license earnings exactness) and
`l3-itinerary-list.test.ts` (Listed-mark presence/absence).

## 3. Manual browser journey (what the e2e automates)

1. `http://localhost:3000/sign-up` → create agency A (seller).
2. Draft a trip, then list it on the marketplace (`/marketplace` sell form,
   any fee/share). Note the fee/currency shown.
3. Navigate to `/workspace` → **Your trips**: the listed trip now shows a
   **Listed** mark with the same fee/currency.
4. Sign up agency B in a second browser context; license A's listing from
   `/marketplace`. Sign up agency C; license the same listing again.
5. Back in agency A's browser: reload `/marketplace`. A's own listing card
   now shows **2 licenses** and a seller-credit total equal to the sum of
   both licenses' recorded `sellerCreditMinor` (visible on B's and C's own
   license receipts, or cross-checked against `revenue_share_ledger`).
6. Cross-tenant spot-check: agency B's view of A's listing card shows NO
   earnings figure (B only sees its own listings' earnings, none here since
   B hasn't listed anything).
7. Deactivate the listing as agency A (`Take off marketplace` control, if
   present) → the workspace trip list no longer shows the Listed mark for
   that trip; the marketplace page no longer shows the card at all (existing
   behavior, unchanged).

## 4. Log scan

```bash
docker compose logs --no-color > /tmp/compose.log
grep -nE "ERROR|FATAL|Unhandled" /tmp/compose.log   # expect: no non-allowlisted hits
```

Known-benign: one duplicate-key ERROR on `booking_component_itinerary_item_idx`
if the L3 booking race test ran against this DB (documented, allowlist
untouched).

## 5. Teardown

```bash
docker compose down -v
```

## References

- Contract: [contracts/seller-earnings.md](./contracts/seller-earnings.md)
- Data model: [data-model.md](./data-model.md)
- Decisions: [research.md](./research.md) (D1–D5)
