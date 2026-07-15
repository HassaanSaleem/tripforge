# User Test Card: p2-consumer-accounts-identity

## Feature (one sentence)
On a shared trip page, a traveler can optionally create a lightweight account (no travel agency involved) and sign in, after which the "have an agent arrange this for me" form already shows their name and email — and signing out reverts the page to the same blank, anonymous form anyone else sees.

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
> `.kitchenloop/uat-runs/p2-consumer-accounts-identity/`. Stay in the SAME
> browser tab for every step below — do not open a new tab or a new browser
> context.

### Step 1: Create an agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uat30 Agent", fill "Email" with "uat30-agent@example.test", fill "Password" with "uat30-pass-123", fill "Agency name" with "UAT Coastal 30", click the button labeled exactly "Create account & agency"
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uat30 Agent" and "UAT Coastal 30"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft an itinerary in the AI Builder
**Browser action:** click the "AI Builder" link in the sidebar; fill "Destination" with "Lisbon", fill "Check-in" with "2026-10-01", fill "Check-out" with "2026-10-04", fill "Adults" with "2", fill "Children" with "0", in the "Trip style" group of buttons click the button labeled exactly "Balanced", fill "Budget" with "1000", in the "Budget mode" group of buttons click the button labeled exactly "Hard cap", fill "Currency" with "USD", click the "Draft itinerary" button, wait up to 90 seconds
**Expected visible result:** a heading "Compare your options" appears with 2-3 cards, each with a "Choose this option" button
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Choose an option to persist the trip
**Browser action:** click the first "Choose this option" button on the page, wait up to 30 seconds
**Expected visible result:** a drafted itinerary appears with day-by-day items and a "Share with your client" section
**Expected NOT visible:** the "Compare your options" heading
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Share the trip and capture the client link
**Browser action:** click the "Share with client" button, wait up to 15 seconds for a share link to appear in a code block. Read the EXACT text of that share link from the page's accessibility tree (not from a screenshot image) — do not retype or re-key any character of it by hand. You will reuse this exact URL string in later steps; do not navigate to it yet.
**Expected visible result:** a code block showing a URL starting with "http://localhost:3000/view/"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Sign out of the agency account
**Browser action:** click the "Sign out" button in the top banner
**Expected visible result:** the browser lands on http://localhost:3000/sign-in
**Expected NOT visible:** "UAT Coastal 30" anywhere on the page
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Open the shared trip anonymously
**Browser action:** navigate this same browser tab directly to the EXACT URL string captured in Step 4
**Expected visible result:** the page shows "Prepared for you by UAT Coastal 30" and, further down, the text "Have an account?" followed by a "Sign in" link and the words "to fill in your details automatically"
**Expected NOT visible:** the word "TripForge" anywhere in the visible page text
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Open the traveler sign-in page
**Browser action:** click the "Sign in" link inside the "Have an account?" text
**Expected visible result:** a form with labeled fields "Email" and "Password" and a button labeled exactly "Sign in"
**Expected NOT visible:** any field or text containing the word "Agency" anywhere on the page
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: Open the traveler sign-up page
**Browser action:** click the "Create an account" link
**Expected visible result:** a form with labeled fields "Your name", "Email", and "Password", and a button labeled exactly "Create account"
**Expected NOT visible:** any field or text containing the word "Agency" or "organization" anywhere on the page
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: Create the traveler account
**Browser action:** fill "Your name" with "Uat Traveler 30", fill "Email" with "uat30-traveler@example.test", fill "Password" with "uat30-trav-pass", click the button labeled exactly "Create account"
**Expected visible result:** the browser lands back on the exact same URL captured in Step 4, and the text "Signed in as Uat Traveler 30" appears on the page
**Expected NOT visible:** any error alert
**Screenshot:** save as step-9.png in the evidence directory

### Step 10: Open the request-agent form and check the pre-fill
**Browser action:** click the "Have an agent arrange this for me" button
**Expected visible result:** a form appears whose "Your name" field already contains exactly "Uat Traveler 30" and whose "Email (optional)" field already contains exactly "uat30-traveler@example.test", with neither field requiring you to type anything
**Expected NOT visible:** empty "Your name" or "Email (optional)" fields
**Screenshot:** save as step-10.png in the evidence directory

### Step 11: Submit the pre-filled request
**Browser action:** without changing either field, click the "Send request" button, wait up to 15 seconds
**Expected visible result:** a heading "Your agent has been notified"
**Expected NOT visible:** the "Tell your agent how to reach you" heading
**Screenshot:** save as step-11.png in the evidence directory

### Step 12: Sign out and confirm the form reverts to blank
**Browser action:** navigate this same browser tab directly to the EXACT URL string captured in Step 4 again, then click the "Sign out" button that appears next to the "Signed in as" text, then click the "Have an agent arrange this for me" button
**Expected visible result:** the "Your name" field is EMPTY and the text "Have an account?" with a "Sign in" link appears where "Signed in as" used to be
**Expected NOT visible:** "Uat Traveler 30" pre-filled anywhere on the page
**Screenshot:** save as step-12.png in the evidence directory

### Step 13: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/p2-consumer-accounts-identity/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/p2-consumer-accounts-identity/step-1.png` … `step-12.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
