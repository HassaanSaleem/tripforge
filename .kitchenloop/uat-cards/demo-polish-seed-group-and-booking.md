# User Test Card: demo-polish-seed-group-and-booking

## Feature (one sentence)
On a fresh boot, the demo seed now posts 3 group departures (so /group-travel is never empty) and completes one real booking (so a demo agency's dashboard GBV stat shows a real amount instead of "—"), all via the platform's existing audited flows.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000), booted FRESH via `docker compose down -v && docker compose up --build --wait` so the seed script has just run
- [ ] Docker CLI available (the log review step uses it)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 3 or more
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/demo-polish-seed-group-and-booking/`. The stack must be
> a FRESH boot (down -v, then up --build --wait) before Step 1 — the seed
> script's amounts below are only reproducible on the first seed run.

### Step 1: Sign in as the seeded demo agency owner
**Browser action:** navigate to http://localhost:3000/sign-in, fill "Email" with "owner@azure-travel-demo.test", fill "Password" with "TripForgeDemo!2026", click the "Sign in" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Priya Shah" and "Azure Travel Co"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: The dashboard GBV stat is non-zero
**Browser action:** none — read the "At a glance" stat tiles already on the dashboard from Step 1
**Expected visible result:** the "GBV" stat tile reads exactly "513.41 USD" (not "—"), and the "Recent activity" list contains a row reading "Booking confirmed: Lisbon balanced trip"
**Expected NOT visible:** a GBV tile reading "—"
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Group Travel shows populated departures, not the empty state
**Browser action:** click the "Group Travel" link in the sidebar
**Expected visible result:** the "Group trips on the marketplace now" section shows 3 departure cards: "Reykjavik balanced trip" (by Meridian DMC, 1,890.00 USD / seat, "10 of 10 seats left"), "Tokyo balanced trip" (by Kaido Journeys, 1,595.00 USD / seat, "8 of 8 seats left"), and "Tokyo balanced trip" (by Azure Travel Co, marked "Your departure", 1,399.00 USD / seat, "11 of 12 seats left")
**Expected NOT visible:** the text "No group departures posted yet"
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: The seat join is real — seats-remaining is below capacity
**Browser action:** none — read the Azure Travel Co card from Step 3
**Expected visible result:** the Azure Travel Co "Tokyo balanced trip" card reads "11 of 12 seats left" (one seat below its 12-seat capacity, from the seeded cross-agency join)
**Expected NOT visible:** "12 of 12 seats left" on that same card
**Screenshot:** reuse step-3.png (no separate screenshot needed)

### Step 5: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/demo-polish-seed-group-and-booking/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/demo-polish-seed-group-and-booking/step-1.png` … `step-3.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 180
