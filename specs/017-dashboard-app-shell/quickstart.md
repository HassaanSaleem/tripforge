# Quickstart: Dashboard App Shell (spec 017)

Validation guide — proves the feature end-to-end against the BUILT compose
image (INV-027). Runs keyless: empty `ANTHROPIC_API_KEY` → deterministic
FakeLLM planner.

## Prerequisites

- Docker + compose; ports 3000/5432/8025 free
- Repo root; no host `node_modules` needed (hermetic image, seed-0010)

## 1. Boot the built stack

```bash
docker compose down -v && docker compose up --build --wait
```

Expect: all services healthy, exit 0.

## 2. Deterministic suites

```bash
docker compose exec web pnpm test          # L1/L2/L3 inside the built image
node tests/integration/smoke.mjs           # L3 smoke against the live stack
npx playwright test tests/e2e/dashboard-shell-journey.spec.ts
npx playwright test                        # full suite (updated nav specs included)
```

Expect: all green; the dashboard-shell journey covers zero-state dashboard →
sidebar reachability of all six destinations → populated dashboard after live
activity.

## 3. Manual browser journey (what the e2e automates)

1. `http://localhost:3000/sign-up` → create a fresh agency. Sign-in lands
   directly on **`/dashboard`** (not the old single-column workspace).
2. Dashboard shows: a persistent left sidebar (Dashboard / AI Builder / Trips
   / Marketplace / Media / Discover, brand mark, Dashboard marked active),
   the existing top header unchanged (identity, role badge, sign-out), stat
   tiles all showing correct **zero** values (GBV, earnings, active trips,
   listings, licenses), a friendly empty recent-activity state, and two
   quick-action cards.
3. Select **AI Builder** in the sidebar → lands on `/workspace` with only the
   planner (no trips/media panels below it anymore). Draft a trip (e.g.
   Lisbon, near-future dates, budget 2500 EUR hardCap).
4. Select **Trips** in the sidebar → `/trips` shows the just-drafted trip
   (fresh route mount fetches current data — no manual page reload needed).
   Open it, run the booking flow, generate a client-share link — identical to
   the pre-shell behavior.
5. Select **Media** → `/media` shows the media library panel, unchanged
   behavior from before.
6. Select **Marketplace** → `/marketplace` unchanged; list the booked trip,
   then (as a second agency in another browser context) license it.
7. Select **Discover** → a clearly-labeled "coming soon" placeholder, not a
   broken link.
8. Return to **Dashboard**: stat tiles now reflect the real activity above
   (GBV/earnings per currency, trip/listing/license counts), and the
   recent-activity list shows the new events, newest first.
9. Narrow the browser window: the sidebar collapses; open it via its toggle
   and confirm every destination is still reachable.
10. Tenant isolation spot-check: the second agency's dashboard never shows
    the first agency's stats or activity.

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

- Contract: [contracts/dashboard-shell-ui.md](./contracts/dashboard-shell-ui.md)
- Data model: [data-model.md](./data-model.md)
- Decisions: [research.md](./research.md) (D1–D9)
