# User Test Card: demo-11-group-travel

## Feature (one sentence)
An agent posts a finished itinerary as a group departure with a seat capacity and per-seat price, and can join a seat on it for a named client — the seats-left count updates immediately, and once every seat is taken the departure shows a "Sold out" message with no way to join another seat.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (the log review uses it)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/demo-11-group-travel/`.

### Step 1: Create an agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Gia Guide", fill "Email" with "uat11-agent@example.test", fill "Password" with "uat11-pass-123", fill "Agency name" with "UAT Sunset 11", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Gia Guide" and "UAT Sunset 11"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft an itinerary in the AI Builder
**Browser action:** click the "AI Builder" link in the sidebar; fill "Destination" with "Lisbon", fill "Check-in" with "2026-10-01", fill "Check-out" with "2026-10-04", fill "Adults" with "2", fill "Children" with "0", in the "Trip style" group of buttons click the button labeled exactly "Balanced", fill "Budget" with "1000", in the "Budget mode" group of buttons click the button labeled exactly "Hard cap", fill "Currency" with "USD", click the "Draft itinerary" button, wait up to 90 seconds
**Expected visible result:** a heading "Compare your options" appears with 2-3 cards, each with a "Choose this option" button
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Choose an option to persist the trip
**Browser action:** click the first "Choose this option" button on the page, wait up to 30 seconds
**Expected visible result:** a drafted itinerary appears with day-by-day items and a "Total" price line
**Expected NOT visible:** the "Compare your options" heading
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Post the trip as a group departure with 1 seat
**Browser action:** click the "Group Travel" link in the sidebar; in the "Sell seats on a group trip" form, select the first real option (not the placeholder) of the "Itinerary" dropdown, fill "Departure date" with "2026-11-20", fill "Total seats" with "1", fill "Price per seat" with "500", click the "Post this group departure" button
**Expected visible result:** the text "Posted — your group departure is live above." AND a card showing "1 of 1 seats left" and a "Your departure" badge
**Expected NOT visible:** "0 of 1 seats left"
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Join the only seat for a named client
**Browser action:** on the group departure card from Step 4, fill "Client name" with "Priya Nair", click the "Join a seat" button, wait up to 15 seconds
**Expected visible result:** the text "Seat joined — 0 left." AND the badge on that same card now reads "0 of 1 seats left"
**Expected NOT visible:** "1 of 1 seats left"
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: A fresh view of the same departure shows it sold out
**Browser action:** reload the page (navigate to http://localhost:3000/group-travel again)
**Expected visible result:** the same group departure card now shows the text "Sold out — no seats remain." and there is no "Client name" field or "Join a seat" button on that card
**Expected NOT visible:** a "Join a seat" button on the card showing "0 of 1 seats left"
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/demo-11-group-travel/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/demo-11-group-travel/step-1.png` … `step-6.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 240
