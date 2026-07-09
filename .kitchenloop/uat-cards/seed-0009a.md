# User Test Card: seed-0009a

## Feature (one sentence)
A signed-in travel agent can describe a trip (destination, dates, party, budget) on the agency workspace page and see an AI-drafted, day-by-day itinerary with real prices and a per-category budget summary rendered in the browser — with hopeless budgets refused in plain language and the planner hidden from anyone without an agency membership.

## Prerequisites
- [ ] The live app stack is running and healthy at http://localhost:3000 (the implementer booted it)
- [ ] A Chromium browser is available via the Playwright MCP browser tools

## Prerequisite Verification Commands
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health   # should print 200
curl -s http://localhost:3000/api/health                                  # should contain "ok"
```

## Steps

All steps are browser actions executed with the Playwright MCP browser tools against the live stack. Every step MUST capture a screenshot into the evidence directory `.kitchenloop/uat-runs/seed-0009a/`.

Note on timing: the stack may run a live AI planner. After submitting a draft, allow up to 90 seconds for the result to render. If the message "The planner could not produce a usable plan this time. Please try again." appears, click "Draft itinerary" once more and keep waiting — one retry is part of normal operation, not a failure.

### Step 1: Anonymous visitor never sees the planner
**Browser action:** navigate to http://localhost:3000/workspace
**Expected visible result:** heading "Agency workspace", text containing "agency membership", and a "Sign in" link
**Expected NOT visible:** a "Draft itinerary" button, any trip form field labeled "Destination"
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Self-serve sign-up lands in the workspace with the planner form
**Browser action:** navigate to http://localhost:3000/sign-up, then fill "Your name" with "Uma UAT", fill "Email" with "uat-uma-0009a@example.test", fill "Password" with "uat-lisbon-88", fill "Agency name" with "Uma Atlantic Travel", then click "Create account & agency"
**Expected visible result:** the page URL becomes http://localhost:3000/workspace; the page shows "Uma UAT", "Uma Atlantic Travel", and "owner"; a form with fields labeled "Destination", "Check-in", "Check-out", "Adults", "Children", "Trip style", "Budget", "Budget mode", "Currency" and a button "Draft itinerary" is visible
**Expected NOT visible:** any long random identifier string in the greeting
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Draft a trip and see the rendered itinerary
**Browser action:** on http://localhost:3000/workspace fill "Destination" with "Lisbon", fill "Check-in" with "2026-09-07", fill "Check-out" with "2026-09-10", leave "Adults" at "2" and "Children" at "0", select "balanced" for "Trip style", fill "Budget" with "2500", leave "Budget mode" at "hardCap" and "Currency" at "EUR", then click "Draft itinerary" and wait (up to 90 seconds; the button may read "Drafting…" while the draft is prepared — if the draft renders too fast to observe that, it is not a failure)
**Expected visible result:** a rendered itinerary: a heading with a trip title (wording varies), a heading starting with "Day 1", at least one itinerary line containing " EUR" after an item name, the word "Total" followed by an amount ending in " EUR", and a "Budget summary" table with a row containing "accommodation" and a state reading "fits", "underFilled", or "overTarget"
**Expected NOT visible:** any raw JSON error, any stack trace
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: A hopeless budget is refused in plain language (negative test)
**Browser action:** on the same page, change "Budget" to "1" and click "Draft itinerary", then wait (up to 90 seconds)
**Expected visible result:** EITHER the message "No bookable options fit this trip and budget. Try adjusting the budget, dates, or destination." OR the message "The planner could not produce a usable plan this time. Please try again." — and the "Destination" field still contains "Lisbon"
**Expected NOT visible:** a newly rendered itinerary for this 1-EUR submission, any raw error object or stack trace
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Sign out hides the planner again
**Browser action:** click "Sign out", then navigate to http://localhost:3000/workspace
**Expected visible result:** text containing "agency membership" with a "Sign in" link
**Expected NOT visible:** "Uma UAT", a "Draft itinerary" button
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Application log stays clean during the journey
```bash
docker logs tripforge-web-1 2>&1 | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | wc -l
```
**Expected exit code:** 0
**Expected output contains:** "0"
**Expected output does NOT contain:** any non-zero count
**Screenshot:** not required for this shell step; paste the raw command output into evidence.md

## Artifacts
- `.kitchenloop/uat-runs/seed-0009a/evidence.md` — per-step raw results (URL, visible/not-visible assertion outcomes, raw shell output for Step 6) for all 6 steps
- `.kitchenloop/uat-runs/seed-0009a/step-1.png` … `step-5.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
