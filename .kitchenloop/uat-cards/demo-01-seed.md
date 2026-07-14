# User Test Card: demo-01-seed

## Feature (one sentence)
A fresh `docker compose up` shows a populated platform — pre-vetted demo
agencies with sign-in-capable users, drafted trips with real curated
hero-city content and budget breakdowns, marketplace listings with ratings
and non-zero seller earnings — with zero empty states anywhere.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] The stack was booted from a fresh volume (`docker compose down -v` then
      `docker compose up --build --wait`) so the seed step ran exactly once

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/demo-01-seed/`.

### Step 1: Sign in with a documented demo login
**Browser action:** navigate to http://localhost:3000/sign-in, fill "Email" with "owner@azure-travel-demo.test", fill "Password" with "TripForgeDemo!2026", click the "Sign in" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Priya Shah" and "Azure Travel Co"
**Expected NOT visible:** any error alert, "Invalid email or password"
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: The dashboard shows populated stats, not zero-states
**Browser action:** read the "At a glance" panel on http://localhost:3000/dashboard
**Expected visible result:** "Earnings" shows "405.00 USD", "Active trips" shows "3", "Listings" shows "1", "Licenses" shows "1", and "Recent activity" lists at least one "Trip drafted:" line
**Expected NOT visible:** "Earnings" showing "0.00 USD" or "—" for Active trips/Listings/Licenses
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: The trips list shows seeded trips, not an empty state
**Browser action:** click the "Trips" link in the sidebar
**Expected visible result:** three rows are listed: "Reykjavik balanced trip", "Tokyo balanced trip", and "Lisbon balanced trip" — the Lisbon row shows a "Listed · 450.00 USD" badge
**Expected NOT visible:** "No trips yet" or any empty-state message
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: An opened trip shows curated content, a gallery photo, and a budget breakdown
**Browser action:** click the "Open" button on the "Lisbon balanced trip" row
**Expected visible result:** a "Gallery" section with a photo, a "Day 1" section showing "Casa do Alfama" and a "Day subtotal:" amount ending in "USD"
**Expected NOT visible:** "Lisbon Grand" or "Lisbon Boutique" (the old generic placeholder names)
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: The marketplace shows listings with ratings, verified sellers, and earnings
**Browser action:** click the "Marketplace" link in the sidebar
**Expected visible result:** a listing card titled "Lisbon Getaway — white-label ready" showing "by Azure Travel Co", a "✓ Verified" badge, "★ 5.0 (1)", "450.00 USD", and the line "1 license · 405.00 USD earned"
**Expected NOT visible:** "0 USD earned", "Not yet rated" on the Lisbon Getaway card
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: A second seller's listing also shows a verified badge and multiple ratings
**Browser action:** on the same http://localhost:3000/marketplace page, read the "Marrakech Escape — white-label ready" card
**Expected visible result:** "by Meridian DMC", a "✓ Verified" badge, and "★ 4.5 (2)"
**Expected NOT visible:** "Not yet rated" on the Marrakech Escape card
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: A fresh draft for a curated hero city shows realistic named content
**Browser action:** click "AI Builder" in the sidebar, fill "Destination" with "Marrakech", fill "Check-in" with "2026-12-01", fill "Check-out" with "2026-12-04", fill "Budget" with "3000", fill "Currency" with "USD", click "Draft itinerary", wait up to 60 seconds
**Expected visible result:** the "Compare your options" section shows an option mentioning "Riad Dar Zahia" or "Kasbah Atlas Lodge" or "Jemaa Courtyard Suites" (the curated Marrakech hotels)
**Expected NOT visible:** "Marrakech Grand" or "Marrakech Boutique" (the old generic placeholder names)
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: A fresh draft for a NON-curated destination is unaffected (regression check)
**Browser action:** on the same AI Builder page, fill "Destination" with "Paris", fill "Check-in" with "2026-12-10", fill "Check-out" with "2026-12-13", fill "Budget" with "3000", fill "Currency" with "USD", click "Draft itinerary", wait up to 60 seconds
**Expected visible result:** the "Compare your options" section mentions "Paris Boutique" or "Paris Grand" (the existing generic placeholder pattern, proving curated content did not leak into non-curated destinations)
**Expected NOT visible:** any curated hero-city hotel name (e.g. "Casa do Alfama", "Riad Dar Zahia", "Yanaka Machiya House")
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: Log review — no unexpected errors from the seed step or the journey above
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | wc -l
```
**Expected exit code:** 0
**Expected output contains:** "0"
**Expected output does NOT contain:** "Unhandled"

## Artifacts
- `.kitchenloop/uat-runs/demo-01-seed/evidence.md` — step-by-step raw output and per-step verdicts, ending with a line `**Overall:** PASS` or `**Overall:** PRODUCT_FAIL`
- `.kitchenloop/uat-runs/demo-01-seed/step-1.png` … `step-8.png` (browser steps)

## Constraints
- MAX_DURATION: 300
