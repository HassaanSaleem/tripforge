# User Test Card: seed-0009d

## Feature (one sentence)
A signed-in agent can browse the marketplace, list one of their own drafted itineraries with declared terms (after the platform operator vets the agency), and a second agency can license that listing and receive a white-label copy with the recorded revenue split shown on screen.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (the operator vetting step and the log review use it)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/seed-0009d/`.

### Step 1: Create the SELLER agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uma Seller", fill "Email" with "uat9d-seller@example.test", fill "Password" with "uat9d-pass-123", fill "Agency name" with "UAT Atlas 9d", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Uma Seller" and "UAT Atlas 9d"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft an itinerary in the workspace
**Browser action:** on http://localhost:3000/workspace fill "Destination" with "Paris", "Check-in" with "2026-09-01", "Check-out" with "2026-09-03", "Adults" with "2", "Children" with "0", select "balanced" for "Trip style", fill "Budget" with "1000", select "hardCap" for "Budget mode", fill "Currency" with "USD", click "Draft itinerary", wait up to 90 seconds
**Expected visible result:** a drafted itinerary appears with day-by-day items and a "Budget summary" table
**Expected NOT visible:** "Could not reach the server"
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Open the marketplace from the workspace header
**Browser action:** click the "Marketplace" link in the page header
**Expected visible result:** the URL is http://localhost:3000/marketplace; the page shows the heading "Trade finished trips", a "Live listings" section reading "No trips on the marketplace yet — list one of yours below and be the first.", and a "List a finished itinerary" form
**Expected NOT visible:** any listing card
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Listing BEFORE vetting is refused in plain language
**Browser action:** in the "List a finished itinerary" form, select the first real option of "Itinerary" (the drafted Paris trip), fill "Listing title" with "Paris weekender UAT9D", fill "License fee (USD)" with "250", fill "License terms" with "White-label permitted; keep attribution lineage.", fill "Revenue share %" with "7.5", click "List it on the marketplace"
**Expected visible result:** an explanation containing "isn't vetted for the marketplace yet"
**Expected NOT visible:** "Listed — your trip is live on the marketplace above."
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: The platform operator vets the seller agency
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "INSERT INTO agency_vetting (agency_id, vetted_by) SELECT id, 'uat-operator' FROM organization WHERE name = 'UAT Atlas 9d' ON CONFLICT (agency_id) DO NOTHING; SELECT count(*) FROM agency_vetting v JOIN organization o ON o.id = v.agency_id WHERE o.name = 'UAT Atlas 9d';"
```
**Expected exit code:** 0
**Expected output contains:** "1"
**Expected output does NOT contain:** "ERROR"

### Step 6: The vetted seller lists the itinerary
**Browser action:** click "List it on the marketplace" again (the form still holds the values from Step 4)
**Expected visible result:** "Listed — your trip is live on the marketplace above." AND a listing card titled "Paris weekender UAT9D" appears in "Live listings" showing "250.00 USD", "7.5% revenue share", "Not yet rated", and a "Your listing" badge; the card has NO "License this trip" button
**Expected NOT visible:** "isn't vetted"
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Create the BUYER agency account
**Browser action:** click "Sign out", then navigate to http://localhost:3000/sign-up, fill "Your name" with "Bela Buyer", fill "Email" with "uat9d-buyer@example.test", fill "Password" with "uat9d-pass-123", fill "Agency name" with "UAT Nomad 9d", click "Create account & agency"
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Bela Buyer" and "UAT Nomad 9d"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: The platform operator vets the buyer agency
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "INSERT INTO agency_vetting (agency_id, vetted_by) SELECT id, 'uat-operator' FROM organization WHERE name = 'UAT Nomad 9d' ON CONFLICT (agency_id) DO NOTHING; SELECT count(*) FROM agency_vetting v JOIN organization o ON o.id = v.agency_id WHERE o.name = 'UAT Nomad 9d';"
```
**Expected exit code:** 0
**Expected output contains:** "1"
**Expected output does NOT contain:** "ERROR"

### Step 9: The buyer sees the listing cross-tenant and licenses it
**Browser action:** navigate to http://localhost:3000/marketplace; confirm the "Paris weekender UAT9D" card is visible with seller "UAT Atlas 9d" and WITHOUT a "Your listing" badge; click its "License this trip" button and wait for the receipt
**Expected visible result:** a panel titled "Trip licensed — white-label copy created" showing the rows "License fee 250.00 USD", "Seller credit 225.00 USD", "Platform take 25.00 USD", and a "Copy reference:" code
**Expected NOT visible:** "own listing"
**Screenshot:** save as step-9.png in the evidence directory

### Step 10: Licensing the same trip again is refused benignly
**Browser action:** click "License this trip" on the "Paris weekender UAT9D" card again
**Expected visible result:** "Your agency already licensed this trip — the white-label copy is in your workspace."
**Expected NOT visible:** a second "Trip licensed" receipt appearing for this click (the recorded split must not double)
**Screenshot:** save as step-10.png in the evidence directory

### Step 11: A signed-out visitor never sees marketplace data
**Browser action:** click "Sign out", then navigate to http://localhost:3000/marketplace
**Expected visible result:** "You need an agency membership to trade on the marketplace."
**Expected NOT visible:** "Paris weekender UAT9D"
**Screenshot:** save as step-11.png in the evidence directory

### Step 12: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/seed-0009d/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/seed-0009d/step-1.png` … `step-11.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
