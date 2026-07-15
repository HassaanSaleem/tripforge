# User Test Card: agent-upload-own-itinerary

## Feature (one sentence)
An agent can build an itinerary entirely by hand — days and items typed in directly, no AI drafting — and it shows up in their trips list marked "Self-built", opens exactly like any other trip, and correctly reports that its unpriced items are not yet bookable.

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
> `.kitchenloop/uat-runs/agent-upload-own-itinerary/`.

### Step 1: Create the agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Manny Manual", fill "Email" with "uat29-manny@example.test", fill "Password" with "uat29-pass-123", fill "Agency name" with "UAT Handbuilt 29", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Manny Manual" and "UAT Handbuilt 29"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Open the trips panel and start a manual build
**Browser action:** click the "Trips" link in the left navigation; on the Trips page, click the "+ Build a trip manually" button
**Expected visible result:** a heading "Bring your own itinerary" appears with a form containing labeled fields "Trip title", "Currency", "Destination", "Check-in", "Check-out", "Adults", "Children"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Fill the trip-level fields
**Browser action:** fill "Trip title" with "Hand-built Lisbon weekend", fill "Currency" with "USD", fill "Destination" with "Lisbon", fill "Check-in" with "2026-10-01", fill "Check-out" with "2026-10-04"
**Expected visible result:** all five fields show the typed values
**Expected NOT visible:** any error alert
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Add a stay item to Day 1
**Browser action:** click the "+ Stay" button inside the "Day 1" section; fill the new item's "Title" field with "Boutique hotel in Alfama", fill its "Check-in" field with "2026-10-01", fill its "Check-out" field with "2026-10-04"
**Expected visible result:** a row labeled "stay" appears inside Day 1 showing the title "Boutique hotel in Alfama"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Add a second day with an activity item
**Browser action:** click the "+ Add day" button; inside the new "Day 2" section, click "+ Activity"; fill that item's "Title" field with "Fado evening"
**Expected visible result:** a "Day 2" section appears with a row labeled "activity" showing the title "Fado evening"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Create the trip
**Browser action:** click the "Create trip" button
**Expected visible result:** the page shows a heading "Hand-built Lisbon weekend", a "Day 1" section containing "Boutique hotel in Alfama", and a "Day 2" section containing "Fado evening"
**Expected NOT visible:** any error alert, and NOT visible: "Bring your own itinerary" (the create form is gone, replaced by the opened trip)
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: The trip shows the Self-built badge in the list
**Browser action:** click the "← Back to trips" button
**Expected visible result:** a trip row for "Hand-built Lisbon weekend" appears showing a badge reading exactly "Self-built"
**Expected NOT visible:** a badge reading "Licensed copy" on this row
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: Quoting an all-unpriced manual trip refuses gracefully
**Browser action:** click the "Open" button on the "Hand-built Lisbon weekend" row; scroll to the "Book this trip at your markup" section and click "Quote live prices"
**Expected visible result:** the text "No items could be held at live prices. Adjust the plan or quote again." appears
**Expected NOT visible:** any text starting with "Booking confirmed" or any browser error page
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/agent-upload-own-itinerary/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/agent-upload-own-itinerary/step-1.png` … `step-8.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
