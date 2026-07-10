# User Test Card: seed-0006b

## Feature (one sentence)
When one agency licenses another agency's marketplace listing, the platform's take-rate metric event records the FULL money split — license price, platform take, and seller credit — and the three amounts add up exactly.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (operator vetting steps and the metric-row check use it)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}'   # postgres + web healthy
```

## Steps

### Step 1: Create the SELLER agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Sana Seller", fill "Email" with "uat6b-seller@example.test", fill "Password" with "uat6b-pass-123", fill "Agency name" with "UAT Atlas 6b", click "Create account & agency"
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Sana Seller" and "UAT Atlas 6b"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft an itinerary to sell
**Browser action:** on http://localhost:3000/workspace, fill the trip description field with "Paris balanced trip", fill the budget field with "3000", submit the planner form, wait for the draft to render
**Expected visible result:** a rendered itinerary with day-by-day items and prices
**Expected NOT visible:** "Something went wrong"
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: The platform operator vets the seller agency
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "INSERT INTO agency_vetting (agency_id, vetted_by) SELECT id, 'uat-operator' FROM organization WHERE name = 'UAT Atlas 6b' ON CONFLICT (agency_id) DO NOTHING; SELECT count(*) FROM agency_vetting v JOIN organization o ON o.id = v.agency_id WHERE o.name = 'UAT Atlas 6b';"
```
**Expected exit code:** 0
**Expected output contains:** "1"
**Expected output does NOT contain:** "ERROR"

### Step 4: List the itinerary on the marketplace
**Browser action:** navigate to http://localhost:3000/marketplace, in the "List a finished itinerary" form select the first real option of "Itinerary" (the drafted Paris trip), fill "Listing title" with "Paris split witness 6b", fill "License fee (USD)" with "200", fill "License terms" with "White-label permitted.", leave "Revenue share %" at its prefilled default, click "List it on the marketplace"
**Expected visible result:** "Listed — your trip is live on the marketplace above." AND a listing card titled "Paris split witness 6b" showing "200.00 USD"
**Expected NOT visible:** "isn't vetted"
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Create the BUYER agency account
**Browser action:** click "Sign out", then navigate to http://localhost:3000/sign-up, fill "Your name" with "Bela Buyer", fill "Email" with "uat6b-buyer@example.test", fill "Password" with "uat6b-pass-123", fill "Agency name" with "UAT Nomad 6b", click "Create account & agency"
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Bela Buyer" and "UAT Nomad 6b"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: The platform operator vets the buyer agency
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "INSERT INTO agency_vetting (agency_id, vetted_by) SELECT id, 'uat-operator' FROM organization WHERE name = 'UAT Nomad 6b' ON CONFLICT (agency_id) DO NOTHING; SELECT count(*) FROM agency_vetting v JOIN organization o ON o.id = v.agency_id WHERE o.name = 'UAT Nomad 6b';"
```
**Expected exit code:** 0
**Expected output contains:** "1"
**Expected output does NOT contain:** "ERROR"

### Step 7: The buyer licenses the seller's listing
**Browser action:** navigate to http://localhost:3000/marketplace, find the listing card titled "Paris split witness 6b", click its "License this trip" button, wait for the receipt
**Expected visible result:** a license receipt/confirmation showing "200.00" and a split of "180.00" (seller) and "20.00" (platform)
**Expected NOT visible:** "already licensed", any error alert
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: The metric event carries the conserved full split
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "SELECT count(*), min(price_minor), min(amount_minor), min(seller_credit_minor), bool_and(price_minor = amount_minor + seller_credit_minor) FROM pmf_event WHERE type = 'take_rate_accrued';"
```
**Expected exit code:** 0
**Expected output contains:** "1|20000|2000|18000|t"
**Expected output does NOT contain:** "ERROR"

### Step 9: A non-license accrual path stays clean (negative: no orphan split fields)
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "SELECT count(*) FROM pmf_event WHERE type <> 'take_rate_accrued' AND (price_minor IS NOT NULL OR seller_credit_minor IS NOT NULL);"
```
**Expected exit code:** 0
**Expected output contains:** "0"
**Expected output does NOT contain:** "ERROR"

### Step 10: Log review
```bash
docker compose logs --no-color web | grep -c "ERROR" || true
```
**Expected exit code:** 0
**Expected output contains:** "0"

## Artifacts
- step-1.png, step-2.png, step-4.png, step-5.png, step-7.png in the evidence directory
- evidence.md with raw output per step

## Constraints
- MAX_DURATION: 240
