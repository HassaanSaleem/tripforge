# User Test Card: seed-0009c

## Feature (one sentence)
From a drafted itinerary on the agency workspace, a signed-in travel agent can click "Share with client" to mint a private share link, and anyone opening that link with no account sees a read-only, agency-branded trip page — day-by-day items with client prices and a trip total — with no platform branding anywhere (page or browser-tab title) and none of the agency's confidential numbers (net rates, markup, budget breakdown), while an unknown link shows a neutral "isn't available" page.

## Prerequisites
- [ ] The live app stack is running and healthy at http://localhost:3000 (the implementer booted it)
- [ ] A Chromium browser is available via the Playwright MCP browser tools

## Prerequisite Verification Commands
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health   # should print 200
curl -s http://localhost:3000/api/health                                  # should contain "ok"
```

## Steps

All steps are browser actions executed with the Playwright MCP browser tools against the live stack. Every browser step MUST capture a screenshot into the evidence directory `.kitchenloop/uat-runs/seed-0009c/`.

Note on timing: the stack may run a live AI planner. After submitting a draft, allow up to 90 seconds for the result to render. If the message "The planner could not produce a usable plan this time. Please try again." appears, click "Draft itinerary" once more and keep waiting — one retry is part of normal operation, not a failure. If a sign-up shows "Too many requests. Please try again later.", wait 15 seconds and click "Create account & agency" once more — that is the platform's rate limiter, not a failure.

### Step 1: Self-serve sign-up lands in the workspace
**Browser action:** navigate to http://localhost:3000/sign-up, then fill "Your name" with "Cleo UAT", fill "Email" with "uat-cleo-0009c@example.test", fill "Password" with "uat-lisbon-88", fill "Agency name" with "Cleo Compass Travel", then click "Create account & agency"
**Expected visible result:** the page URL becomes http://localhost:3000/workspace; the page shows "Cleo UAT", "Cleo Compass Travel", and "owner"; a trip form with a "Draft itinerary" button is visible
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft a trip
**Browser action:** on http://localhost:3000/workspace fill "Destination" with "Paris", fill "Check-in" with "2026-09-01", fill "Check-out" with "2026-09-04", leave "Adults" at "2" and "Children" at "0", select "balanced" for "Trip style", fill "Budget" with "1000", leave "Budget mode" at "hardCap", clear "Currency" and fill it with "USD", then click "Draft itinerary" and wait (up to 90 seconds)
**Expected visible result:** a rendered itinerary (a trip-title heading, a heading starting with "Day 1", at least one item line containing " USD"); below it a section titled "Share with your client" with a button "Share with client"
**Expected NOT visible:** any raw JSON error, any stack trace
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Share with client mints the private link
**Browser action:** click "Share with client" and wait for the link to render (a few seconds)
**Expected visible result:** inside the "Share with your client" section, a URL of the form http://localhost:3000/view/ followed by a long random token (8-4-4-4-12 hexadecimal groups), and a "Copy link" button
**Expected NOT visible:** any error alert
**Screenshot:** save as step-3.png in the evidence directory
**Record:** copy the FULL displayed URL exactly — later steps open it. Call it SHARE_URL below (it is a concrete visible value on this page, not a placeholder).

### Step 4: Sign out so the browser holds no session
**Browser action:** click "Sign out", then navigate to http://localhost:3000/workspace
**Expected visible result:** text containing "agency membership" and a "Sign in" link (no workspace greeting)
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: The traveler's view — branded, priced, read-only
**Browser action:** navigate to SHARE_URL (the exact URL recorded in Step 3)
**Expected visible result:** a page carrying "Cleo Compass Travel" (the agency name) as the brand line and in the text "Prepared for you by Cleo Compass Travel."; a trip-title heading; "Trip total" followed by an amount ending in " USD"; a heading starting with "Day 1"; at least one item line with an amount ending in " USD"; the footer "Shared with you by Cleo Compass Travel."
**Expected NOT visible:** the word "TripForge" anywhere on the page; the word "Trellis" anywhere on the page; any "Sign in" or "Sign out" or "workspace" link or button; any field or text named "Markup"; any text "Net rate"; any budget-category table (no "accommodation"/"buffer" allocation rows)
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: The browser tab title carries the agency, not the platform
**Browser action:** on the SHARE_URL page, read the document title (browser tab text)
**Expected visible result:** the tab title contains "Cleo Compass Travel" and does NOT contain "TripForge" or "Trellis"
**Verification command (equivalent alternative):**
```bash
curl -s SHARE_URL | grep -o "<title>[^<]*</title>"   # replace SHARE_URL with the exact recorded URL; output must contain "Cleo Compass Travel" and must not contain "TripForge" or "Trellis"
```
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: The page source leaks no confidential vocabulary
**Verification command:**
```bash
curl -s SHARE_URL | grep -c -e netRate -e netMinor -e markupBps -e supplyRef -e budgetMode   # replace SHARE_URL with the exact recorded URL; must print 0 (grep exits 1 when nothing matches — that exit code is the PASS)
```
**Expected result:** the count printed is 0
**Screenshot:** not applicable (command step) — paste the command output into notes.md instead

### Step 8: An unknown link shows the neutral unavailable page
**Browser action:** navigate to http://localhost:3000/view/00000000-0000-4000-8000-000000000000
**Expected visible result:** heading "Your trip" and text containing "This trip link isn't available"
**Expected NOT visible:** the word "TripForge"; the word "Trellis"; any error/stack trace; anything about whether such a trip exists
**Screenshot:** save as step-8.png in the evidence directory

## Verdict

Report `**Overall:** PASS` only if every step's expected results were observed (including every "Expected NOT visible"). Otherwise report `**Overall:** PRODUCT_FAIL` with the failing step number(s) and what was actually observed.
