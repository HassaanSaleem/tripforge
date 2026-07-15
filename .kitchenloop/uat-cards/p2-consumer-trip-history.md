# User Test Card: p2-consumer-trip-history

## Feature (one sentence)
A signed-in traveler sees a "My Trips" list of every shared trip they have previously opened (and only those trips), and selecting one opens the exact same branded trip page.

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
> `.kitchenloop/uat-runs/p2-consumer-trip-history/`. Stay in the SAME
> browser tab for every step below — do not open a new tab or a new browser
> context.

### Step 1: Create an agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uat31 Agent", fill "Email" with "uat31-agent@example.test", fill "Password" with "uat31-pass-123", fill "Agency name" with "UAT History Trails", click the button labeled exactly "Create account & agency"
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uat31 Agent" and "UAT History Trails"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft the first itinerary (Trip A)
**Browser action:** click the "AI Builder" link in the sidebar; fill "Destination" with "Lisbon", fill "Check-in" with "2026-10-01", fill "Check-out" with "2026-10-04", fill "Adults" with "2", fill "Children" with "0", in the "Trip style" group of buttons click the button labeled exactly "Balanced", fill "Budget" with "1000", in the "Budget mode" group of buttons click the button labeled exactly "Hard cap", fill "Currency" with "USD", click the "Draft itinerary" button, wait up to 90 seconds
**Expected visible result:** a heading "Compare your options" appears with 2-3 cards, each with a "Choose this option" button
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Choose an option and share Trip A
**Browser action:** click the first "Choose this option" button on the page, wait up to 30 seconds, then click the "Share with client" button, wait up to 15 seconds for a share link to appear in a code block. Read the EXACT text of that share link from the page's accessibility tree (not from a screenshot image) — do not retype or re-key any character of it by hand. Call this "Trip A link" and reuse it exactly in later steps.
**Expected visible result:** a code block showing a URL starting with "http://localhost:3000/view/"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Draft a second itinerary (Trip B) and share it
**Browser action:** click the "AI Builder" link in the sidebar again; fill "Destination" with "Rome", fill "Check-in" with "2026-11-01", fill "Check-out" with "2026-11-04", fill "Adults" with "2", fill "Children" with "0", in the "Trip style" group of buttons click the button labeled exactly "Balanced", fill "Budget" with "1200", in the "Budget mode" group of buttons click the button labeled exactly "Hard cap", fill "Currency" with "USD", click the "Draft itinerary" button, wait up to 90 seconds, click the first "Choose this option" button, wait up to 30 seconds, click the "Share with client" button, wait up to 15 seconds. Read the EXACT share-link text from the accessibility tree the same way as Step 3. Call this "Trip B link".
**Expected visible result:** a code block showing a URL starting with "http://localhost:3000/view/" that is DIFFERENT from the Trip A link
**Expected NOT visible:** any error alert
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Sign out of the agency account
**Browser action:** click the "Sign out" button in the top banner
**Expected visible result:** the browser lands on http://localhost:3000/sign-in
**Expected NOT visible:** "UAT History Trails" anywhere on the page
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Open Trip A anonymously — confirm no "My Trips" affordance
**Browser action:** navigate this same browser tab directly to the EXACT Trip A link captured in Step 3
**Expected visible result:** the page shows "Prepared for you by UAT History Trails" and, further down, the text "Have an account?" followed by a "Sign in" link
**Expected NOT visible:** the text "My Trips" anywhere on the page
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Create a traveler account from Trip A
**Browser action:** click the "Sign in" link inside the "Have an account?" text, then click the "Create an account" link, then fill "Your name" with "Uat31 Traveler", fill "Email" with "uat31-traveler@example.test", fill "Password" with "uat31-trav-pass", click the button labeled exactly "Create account"
**Expected visible result:** the browser lands back on the exact same URL as the Trip A link, and the text "Signed in as Uat31 Traveler" appears on the page next to a "My Trips" link
**Expected NOT visible:** any field or text containing the word "Agency" or "organization" anywhere in this step's forms
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: Open "My Trips" — only Trip A is listed
**Browser action:** click the "My Trips" link
**Expected visible result:** the browser lands on http://localhost:3000/view/my-trips with a heading "My Trips", and the list shows EXACTLY ONE trip row
**Expected NOT visible:** two or more trip rows; the text "No trips yet"
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: Selecting the listed trip opens Trip A
**Browser action:** click the single trip row in the "My Trips" list
**Expected visible result:** the browser lands on the exact same URL as the Trip A link, showing "Prepared for you by UAT History Trails"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-9.png in the evidence directory

### Step 10: Open Trip B while signed in, then revisit "My Trips"
**Browser action:** navigate this same browser tab directly to the EXACT Trip B link captured in Step 4, then click the "My Trips" link that appears on that page
**Expected visible result:** the "My Trips" list now shows EXACTLY TWO trip rows
**Expected NOT visible:** only one trip row; "No trips yet"
**Screenshot:** save as step-10.png in the evidence directory

### Step 11: Sign out and confirm "My Trips" is unreachable
**Browser action:** navigate this same browser tab directly to the EXACT Trip A link, click the "Sign out" button that appears next to the "Signed in as" text, then navigate this same browser tab directly to http://localhost:3000/view/my-trips
**Expected visible result:** the browser is redirected to http://localhost:3000/view/sign-in
**Expected NOT visible:** the heading "My Trips"; any trip row
**Screenshot:** save as step-11.png in the evidence directory

### Step 12: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/p2-consumer-trip-history/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/p2-consumer-trip-history/step-1.png` … `step-11.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
