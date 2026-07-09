# Quickstart: Booking Flow UI — Quote → Review → Book

**Feature**: specs/009-booking-flow-ui | **Date**: 2026-07-09

Validation guide for the quote → review → book journey. Contracts:
[contracts/booking-ui.md](./contracts/booking-ui.md); mappings:
[data-model.md](./data-model.md).

## Prerequisites

- Docker + docker compose (the stack is keyless by default — deterministic
  planner fake + sandbox supply engine, INV-019)
- Node 22+ with the repo's pnpm workspace installed (or run checks inside the
  built image — see §4)

## 1. Boot the built stack (INV-027 — never a dev server)

```bash
docker compose down -v && docker compose up --build --wait
```

Expect: postgres, mailpit, migrate (exited 0), web — all healthy;
http://localhost:3000 serves the landing page.

## 2. Browser journey (the SC-005 path)

1. Open http://localhost:3000/sign-up → create an account + agency (any fresh
   email) → lands on `/workspace`.
2. Draft the proven trip: Destination `Paris`, Check-in `2026-09-01`, Check-out
   `2026-09-04`, Adults `2`, Trip style `balanced`, Budget `1000`, mode
   `hardCap`, Currency `USD` → **Draft itinerary** → rendered itinerary + budget
   fit appear (spec 008 behavior, unchanged).
3. Below the draft: **Markup %** shows `15`. Click **Quote live prices** →
   button reads "Quoting…" then a review table renders: each bookable item with
   net rate, sell price, `15%` markup, "Held until {time}", checkbox checked.
4. Click **Book selected items** → "Booking…" then a confirmation renders:
   **Booking confirmed**, a booking reference, and one line per component with a
   supplier booking reference and its sell price.
5. Click **Quote live prices** again → the fresh review reports every booked
   item as "Already booked — this item is covered by an existing booking." with
   nothing selectable and the book button disabled.
6. Sign out → `/workspace` shows the membership prompt; no Markup/Quote/Book
   controls anywhere (§2.4).

Money check (SC-003): every displayed amount equals a server value — spot-check
one component: sell price in the confirmation equals the held sell price for the
same item in step 3, and both equal `booking_quote.sell_minor` in the DB:

```bash
docker compose exec postgres psql -U tripforge -c \
  "select item_id, sell_minor, currency, consumed_at is not null as consumed from booking_quote;"
docker compose exec postgres psql -U tripforge -c \
  "select b.status, c.supplier_booking_id, c.sell_minor from booking b join booking_component c on c.booking_id = b.id;"
```

## 3. Automated gates

```bash
pnpm run lint     # ESLint clean
pnpm test         # Vitest — includes the new apps/web/lib booking-flow L1 tests
npx playwright test tests/e2e/booking-journey.spec.ts   # L4 journey vs the running stack
node tests/integration/smoke.mjs                        # L3 smoke (unchanged, must stay green)
```

## 4. In-image variant (when host pnpm is unavailable — loop environments)

```bash
docker build -f apps/web/Dockerfile --target deps -t tripforge-deps .
docker run --rm tripforge-deps pnpm run lint
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-deps pnpm test
```

(Vitest L3 suites need the compose postgres on the shared network; the L1
booking-flow tests are dependency-free.)

## 5. Log scan (INV-027 gate)

```bash
docker compose logs --no-color > /tmp/compose-logs.txt
grep -E "ERROR|FATAL|Unhandled" /tmp/compose-logs.txt   # expect: no non-allowlisted lines
```

## Expected outcomes

- SC-001: steps 2.2–2.4 complete in well under 2 minutes.
- SC-002: every failure path shows a human message (try booking after letting a
  transfer hold lapse >10 min to see "The price hold expired…", or kill the web
  container mid-quote for the network message).
- SC-004: step 2.6 shows zero booking controls for non-agents.
- SC-005: the Playwright journey + archived screenshots under
  `.kitchenloop/evidence/iter-3/seed-0009b/` witness the full path.

## Teardown

```bash
docker compose down -v
```
