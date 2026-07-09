# User Test Card: seed-0009b

## Feature (one sentence)
From a drafted itinerary on the agency workspace, a signed-in travel agent can set a markup percentage, quote firm live prices for the plan's bookable items (seeing net rate, client price, markup, and hold expiry per item), book the held quotes, and see a booking confirmation with per-item supplier references — with booked items reported as already booked on a re-quote and every booking control hidden from anyone without an agency membership.

## Prerequisites
- [ ] The live app stack is running and healthy at http://localhost:3000 (the implementer booted it)
- [ ] A Chromium browser is available via the Playwright MCP browser tools

## Prerequisite Verification Commands
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health   # should print 200
curl -s http://localhost:3000/api/health                                  # should contain "ok"
```

## Steps

All steps are browser actions executed with the Playwright MCP browser tools against the live stack. Every browser step MUST capture a screenshot into the evidence directory `.kitchenloop/uat-runs/seed-0009b/`.

Note on timing: the stack may run a live AI planner. After submitting a draft, allow up to 90 seconds for the result to render. If the message "The planner could not produce a usable plan this time. Please try again." appears, click "Draft itinerary" once more and keep waiting — one retry is part of normal operation, not a failure. Quote and book calls are fast (a few seconds).

### Step 1: Anonymous visitor never sees booking controls
**Browser action:** navigate to http://localhost:3000/workspace
**Expected visible result:** heading "Agency workspace", text containing "agency membership", and a "Sign in" link
**Expected NOT visible:** a field labeled "Markup %", a "Quote live prices" button, a "Book selected items" button
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Self-serve sign-up lands in the workspace
**Browser action:** navigate to http://localhost:3000/sign-up, then fill "Your name" with "Ben UAT", fill "Email" with "uat-ben-0009b@example.test", fill "Password" with "uat-paris-77", fill "Agency name" with "Ben Meridian Travel", then click "Create account & agency"
**Expected visible result:** the page URL becomes http://localhost:3000/workspace; the page shows "Ben UAT", "Ben Meridian Travel", and "owner"; a trip form with a "Draft itinerary" button is visible
**Expected NOT visible:** a "Quote live prices" button (no draft exists yet)
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Draft a trip and see the booking controls appear with the draft
**Browser action:** on http://localhost:3000/workspace fill "Destination" with "Paris", fill "Check-in" with "2026-09-01", fill "Check-out" with "2026-09-04", leave "Adults" at "2" and "Children" at "0", select "balanced" for "Trip style", fill "Budget" with "1000", leave "Budget mode" at "hardCap", clear "Currency" and fill it with "USD", then click "Draft itinerary" and wait (up to 90 seconds)
**Expected visible result:** a rendered itinerary (a trip-title heading, a heading starting with "Day 1", at least one item line containing " USD"); below it a section titled "Book this trip at your markup" with a field labeled "Markup %" containing the value "15" and a button "Quote live prices"
**Expected NOT visible:** any raw JSON error, any stack trace
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Quote live prices at the default markup
**Browser action:** click "Quote live prices" and wait for the review to render (a few seconds; the button may read "Quoting…" briefly — if it resolves too fast to observe, that is not a failure)
**Expected visible result:** a review table with columns "Book", "Item", "Net rate", "Markup", "Client price", "Hold"; at least one row showing an amount ending in " USD" under both "Net rate" and "Client price", the text "15%", text starting with "Held until", and a checked checkbox; a button "Book selected items" below the table
**Expected NOT visible:** any raw error payload
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Book the held quotes and see the confirmation
**Browser action:** click "Book selected items" and wait for the confirmation to render (a few seconds; the button may read "Booking…" briefly)
**Expected visible result:** a panel with the heading "Booking confirmed", a line starting with "Booking reference:", and for each booked item a line containing "confirmed", "supplier ref", and an amount ending in " USD"
**Expected NOT visible:** "Booking failed", any raw error payload
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: A re-quote reports the items as already booked
**Browser action:** click "Quote live prices" again and wait for the review to render
**Expected visible result:** the text "No items could be held at live prices" and, for each previously booked item, the message "Already booked — this item is covered by an existing booking."
**Expected NOT visible:** a "Book selected items" button, a second "Booking confirmed" panel
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Sign out hides the booking flow again
**Browser action:** click "Sign out", then navigate to http://localhost:3000/workspace
**Expected visible result:** text containing "agency membership" with a "Sign in" link
**Expected NOT visible:** "Ben UAT", a field labeled "Markup %", a "Quote live prices" button
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: Application log stays clean during the journey
```bash
docker logs tripforge-web-1 2>&1 | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | wc -l
```
**Expected exit code:** 0
**Expected output contains:** "0"
**Expected output does NOT contain:** any non-zero count
**Screenshot:** not required for this shell step; paste the raw command output into evidence.md

## Artifacts
- `.kitchenloop/uat-runs/seed-0009b/evidence.md` — per-step raw results (URL, visible/not-visible assertion outcomes, raw shell output for Step 8) for all 8 steps
- `.kitchenloop/uat-runs/seed-0009b/step-1.png` … `step-7.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
