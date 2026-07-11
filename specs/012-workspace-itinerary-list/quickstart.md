# Quickstart: Workspace Itinerary List (spec 012)

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
# L1/L2/L3 inside the built image (loop sessions: host pnpm denied)
docker compose exec web pnpm test          # or: pnpm test (interactive setups)
# L3 smoke against the live stack
node tests/integration/smoke.mjs
# The feature's e2e journey + full suite
npx playwright test tests/e2e/workspace-list-journey.spec.ts
npx playwright test
```

Expect: all green; the workspace-list journey covers empty state → draft →
list-without-reload → open/continue → cross-agency license → copy listed.

## 3. Manual browser journey (what the e2e automates)

1. `http://localhost:3000/sign-up` → create agency A (owner session lands in
   the workspace).
2. `/workspace`: below the planner, the **Your trips** panel shows the empty
   state (planner + marketplace guidance) — not a blank.
3. Draft a trip (e.g. Lisbon, any near-future dates, budget 2500 EUR
   hardCap). When the draft renders, the panel now lists the trip — title,
   currency badge, created date — WITHOUT reloading the page.
4. Click **Open** on the row: day-by-day plan renders (same look as the
   drafted view), with the booking controls and client-share control
   beneath. Quote → book works exactly as on a fresh draft. **Back to
   trips** returns to the list.
5. Marketplace check: sign up agency B in a second browser context, list a
   trip from B (marketplace → sell form), then as agency A license it
   (`/marketplace`). Navigate to `/workspace` → the white-label copy appears
   in A's list.
6. Tenant isolation spot-check: B's workspace never shows A's trips.

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

- Contract: [contracts/workspace-list-ui.md](./contracts/workspace-list-ui.md)
- Data model: [data-model.md](./data-model.md)
- Decisions: [research.md](./research.md) (D1–D10)
