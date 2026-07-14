# User Test Card: demo-10-flights-deeplink

## Feature (one sentence)
When an agent drafts or reopens a trip, they see a "Flights" card with 2-3 indicative flight options and their trip's flights budget, plus a link that hands off to an external flight-search site in a new tab — TripForge never books or pays for the flight itself.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (the log review step uses it)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/demo-10-flights-deeplink/`.

### Step 1: Create the agent account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uma Uatester", fill "Email" with "uat-flights-10@example.test", fill "Password" with "uat-flights-pass-9", fill "Agency name" with "UAT Flights Ten", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uma Uatester" and "UAT Flights Ten"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft the trip and pick the Balanced option
**Browser action:** navigate to http://localhost:3000/workspace; fill "Destination" with "Paris", "Check-in" with "2026-09-01", "Check-out" with "2026-09-04", "Adults" with "2", "Children" with "0"; in the "Trip style" group click the "Balanced" option; fill "Budget" with "1000"; in the "Budget mode" group click "Hard cap"; fill "Currency" with "USD"; click "Draft itinerary"; wait up to 90 seconds for the "Compare your options" section; click the "Choose this option" button inside the card whose top label reads exactly "Balanced"; wait up to 90 seconds for the drafted result
**Expected visible result:** a drafted itinerary titled "Paris balanced trip" appears with day-by-day items and a "Budget summary" table
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: The Flights card shows the exact indicative options and budget
**Browser action:** on the same drafted-result page, scroll to the "Flights" section below the day-by-day itinerary
**Expected visible result:** a card with the eyebrow text "FLIGHTS", the heading "Indicative flight options", the line "Your flights budget: 400.00 USD", and exactly 3 option rows reading exactly:
- "Coastal Jet" with "Departs 2026-09-01, 14:05 · Returns 2026-09-04, 14:05" and "1,111.90 USD"
- "Aurora Airlines" with "Departs 2026-09-01, 17:50 · Returns 2026-09-04, 17:50" and "537.47 USD"
- "Skyline Airways" with "Departs 2026-09-01, 08:15 · Returns 2026-09-04, 11:30" and "360.74 USD"

and a link labeled "Search flights on partner ↗". Also confirm the existing "Budget summary" table's "flightsTransport" row reads "400.00 USD" allocated and "0.00 USD" planned.
**Expected NOT visible:** any text saying "Book" or "confirm" on the Flights card itself (it is display + deep-link only, never a booking action)
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: The deep-link opens an external tab and books nothing in-platform
**Browser action:** click the "Search flights on partner ↗" link on the Flights card; a new browser tab opens — switch to it
**Expected visible result:** the new tab's URL starts with "https://www.google.com/travel/flights?q=" and contains "Paris" and "2026-09-01" and "2026-09-04"
**Expected NOT visible:** the new tab's URL containing "localhost"
**Screenshot:** save as step-4.png in the evidence directory (screenshot the NEW tab)

### Step 5: The original trip is unaffected by the deep-link handoff
**Browser action:** close the new tab and switch back to the original TripForge tab
**Expected visible result:** the page is still on http://localhost:3000/workspace showing the same drafted "Paris balanced trip" result, the Flights card is still visible with the same 3 options as Step 3, and the "Book this trip at your markup" section still shows the default "Markup %" value of "15" with no booking confirmation anywhere on the page
**Expected NOT visible:** any text containing "Booking confirmed" or "booking_id"
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Reopening the trip from Trips shows the SAME flights card
**Browser action:** click the "Trips" link in the main navigation; click the "Open" button on the "Paris balanced trip" row; wait for the day-by-day plan to render
**Expected visible result:** the same "Flights" card renders again with the exact same 3 option rows as Step 3 ("Coastal Jet" / "1,111.90 USD", "Aurora Airlines" / "537.47 USD", "Skyline Airways" / "360.74 USD") and the same "Your flights budget: 400.00 USD" line — proving the options are deterministic, not re-randomized on reopen
**Expected NOT visible:** any option row with a different airline name or price than Step 3
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/demo-10-flights-deeplink/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/demo-10-flights-deeplink/step-1.png` … `step-6.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 240
