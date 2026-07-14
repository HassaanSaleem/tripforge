# User Test Card: demo-09-request-agent

## Feature (one sentence)
On a shared trip page, a traveler can either confirm they'll book it themselves, or ask an agent to take over by leaving their name and a note — and that request shows up in the agent's own "Trip Requests" inbox, where the agent can mark it Accepted.

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
> `.kitchenloop/uat-runs/demo-09-request-agent/`. Stay in the SAME browser
> tab for every step below — do not open a new tab or a new browser context.

### Step 1: Create an agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uat Agent", fill "Email" with "uat09-agent@example.test", fill "Password" with "uat09-pass-123", fill "Agency name" with "UAT Kaido 09", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uat Agent" and "UAT Kaido 09"
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

### Step 4: Share the trip and open the client's view
**Browser action:** click the "Share with client" button, wait up to 15 seconds for a share link to appear in a code block. Read the EXACT text of that share link from the page's accessibility tree (not from a screenshot image) — do not retype or re-key any character of it by hand. Then navigate this same browser tab directly to that exact URL string.
**Expected visible result:** the page now shows "Prepared for you by UAT Kaido 09" and a heading "Ready to move forward?" with two buttons: "Book it myself" and "Have an agent arrange this for me"
**Expected NOT visible:** the word "TripForge" anywhere in the visible page text
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Choose "Book it myself"
**Browser action:** click the "Book it myself" button
**Expected visible result:** a heading "Great — you're booking this trip yourself" and text mentioning reaching out to your travel agent
**Expected NOT visible:** the "Ready to move forward?" heading, or the "Have an agent arrange this for me" button
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Reload the same shared link and try to send a request with no name
**Browser action:** navigate this same browser tab to the EXACT same URL used in Step 4 again. Click "Have an agent arrange this for me". Leave the "Your name" field EMPTY, and click the "Send request" button.
**Expected visible result:** the form (heading "Tell your agent how to reach you") is still visible — the browser refuses to submit because the name field is required
**Expected NOT visible:** a heading "Your agent has been notified"
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Send a real request-an-agent submission
**Browser action:** on the same form, fill "Your name" with "Uat Traveler", fill "Notes (optional)" with "Please help me confirm the hotel.", click the "Send request" button, wait up to 15 seconds
**Expected visible result:** a heading "Your agent has been notified"
**Expected NOT visible:** the "Tell your agent how to reach you" heading
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: The agent sees the request in their inbox
**Browser action:** navigate this same browser tab to http://localhost:3000/trip-requests
**Expected visible result:** a row showing "Uat Traveler", the trip's title, the note "Please help me confirm the hotel.", and a status badge reading "New", plus an "Accept" button on that row
**Expected NOT visible:** a status badge reading "Accepted" on that row
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: Accept the request
**Browser action:** click the "Accept" button on the "Uat Traveler" row
**Expected visible result:** that row's status badge now reads "Accepted", and it no longer shows an "Accept" button
**Expected NOT visible:** a status badge reading "New" on that row
**Screenshot:** save as step-9.png in the evidence directory

### Step 10: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "booking_component_itinerary_item_idx" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/demo-09-request-agent/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/demo-09-request-agent/step-1.png` … `step-9.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 240
