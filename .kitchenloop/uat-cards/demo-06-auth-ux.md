# User Test Card: demo-06-auth-ux

> This card verifies PR #55's bundle of user-visible changes in one continuous
> journey: demo-06-auth-ux (sign-in/sign-up restyled onto the TripForge design
> system) and demo-07-trust-badges (a "✓ Verified" badge on marketplace
> listing cards for platform-vetted sellers).

## Feature (one sentence)
The sign-in and sign-up screens now show a centered TripForge brand card
instead of a plain unstyled form, and every marketplace listing card shows a
"✓ Verified" badge next to a platform-vetted seller's name.

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
> `.kitchenloop/uat-runs/demo-06-auth-ux/`.

### Step 1: The sign-up screen shows the TripForge brand card
**Browser action:** navigate to http://localhost:3000/sign-up
**Expected visible result:** the text "TripForge" is visible on the page, along with the text "Set up your agency workspace" and a button labelled "Create account & agency"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Sign up a new agency
**Browser action:** on the same page, fill "Your name" with "Uma Owner", fill "Email" with "uat55-seller@example.test", fill "Password" with "uat55-pass-123", fill "Agency name" with "UAT Meridian 55", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Uma Owner" and "UAT Meridian 55"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Sign out and the sign-in screen shows the TripForge brand card
**Browser action:** click the "Sign out" button
**Expected visible result:** the browser lands on http://localhost:3000/sign-in and the text "TripForge" is visible on the page, along with the text "Sign in to your agency workspace." and a button labelled exactly "Sign in"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Sign back in on a fresh session
**Browser action:** fill "Email" with "uat55-seller@example.test", fill "Password" with "uat55-pass-123", click the "Sign in" button
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Uma Owner" and "UAT Meridian 55"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Draft the deterministic Paris trip
**Browser action:** on http://localhost:3000/workspace fill "Destination" with "Paris", "Check-in" with "2026-09-01", "Check-out" with "2026-09-03", fill "Budget" with "1000", fill "Currency" with "USD", click "Draft itinerary", wait up to 90 seconds
**Expected visible result:** the text "Paris balanced trip" appears on the page
**Expected NOT visible:** "Could not reach the server"
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: The platform operator vets the seller agency
```bash
docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "INSERT INTO agency_vetting (agency_id, vetted_by) SELECT id, 'uat-operator' FROM organization WHERE name = 'UAT Meridian 55' ON CONFLICT (agency_id) DO NOTHING; SELECT count(*) FROM agency_vetting v JOIN organization o ON o.id = v.agency_id WHERE o.name = 'UAT Meridian 55';"
```
**Expected exit code:** 0
**Expected output contains:** "1"
**Expected output does NOT contain:** "ERROR"

### Step 7: List the trip on the marketplace
**Browser action:** click the "Marketplace" link in the page header, in the "Itinerary" dropdown select the only real option (the Paris trip), fill "Listing title" with "UAT55 verified demo trip", fill "License fee" with "150", fill "License terms" with "White-label permitted for UAT.", click "List it on the marketplace"
**Expected visible result:** "Listed — your trip is live on the marketplace above." and a listing card titled "UAT55 verified demo trip"
**Expected NOT visible:** "isn't vetted"
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: The new listing shows the Verified badge
**Browser action:** read the "UAT55 verified demo trip" listing card
**Expected visible result:** the exact text "✓ Verified" appears on the "UAT55 verified demo trip" card, next to the seller name "UAT Meridian 55"
**Expected NOT visible:** the "UAT55 verified demo trip" card WITHOUT the "✓ Verified" text
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: Log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | wc -l
```
**Expected exit code:** 0
**Expected output contains:** "0"
**Expected output does NOT contain:** "Unhandled"

## Artifacts
- `.kitchenloop/uat-runs/demo-06-auth-ux/evidence.md` — step-by-step raw output and per-step verdicts, ending with a line `**Overall:** PASS` or `**Overall:** PRODUCT_FAIL`
- `.kitchenloop/uat-runs/demo-06-auth-ux/step-1.png` … `step-8.png` (browser steps)

## Constraints
- MAX_DURATION: 300
