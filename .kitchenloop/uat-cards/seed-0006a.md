# User Test Card: seed-0006a

## Feature (one sentence)

A marketplace listing whose SELLER has lost their vetting can no longer be
licensed: the license call refuses with the typed status "not_vetted", records
no license, no revenue-share ledger row, no itinerary copy, and no take-rate
event — and re-vetting the seller makes the same attempt succeed.

## Prerequisites

- [ ] The built app stack is running and reachable at http://localhost:3000 (docker compose: web + postgres + mailpit)
- [ ] Docker is available on the host (used for database checks and the operator vetting action)

## Prerequisite Verification Commands

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health   # should print 200
docker compose -p tripforge ps --format '{{.Name}} {{.Status}}' | grep -c healthy   # should print 3
```

## Steps

Every bash step begins by loading shared variables from /tmp/uat6a.env and ends
by saving new ones; run the steps in order.

### Step 1: A seller agent signs up, founds an agency, and the operator vets it
```bash
RND=$(date +%s)
curl -s -c /tmp/uat6a-s.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"email\":\"uat6a-seller-$RND@example.test\",\"password\":\"correct-horse-battery-staple-1\",\"name\":\"UAT Seller Agent\"}" \
  http://localhost:3000/api/auth/sign-up/email > /dev/null
curl -s -b /tmp/uat6a-s.jar -c /tmp/uat6a-s.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"name\":\"UAT Seller DMC\",\"slug\":\"uat6a-seller-$RND\"}" \
  http://localhost:3000/api/auth/organization/create > /tmp/uat6a-org-s.json
ORG_SELLER=$(node -e "const j=require('/tmp/uat6a-org-s.json');console.log(j.id??j.organization?.id??'')")
curl -s -b /tmp/uat6a-s.jar -c /tmp/uat6a-s.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"organizationId\":\"$ORG_SELLER\"}" http://localhost:3000/api/auth/organization/set-active > /dev/null
echo "ORG_SELLER=$ORG_SELLER" > /tmp/uat6a.env
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('$ORG_SELLER', 'uat-operator')"
curl -s -b /tmp/uat6a-s.jar http://localhost:3000/api/trpc/workspace.whoami
```
**Expected exit code:** 0
**Expected output contains:** INSERT 0 1
**Expected output contains:** "agencyId"

### Step 2: The seller drafts an itinerary and lists it on the marketplace
```bash
. /tmp/uat6a.env
curl -s -b /tmp/uat6a-s.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"destination":"Lisbon","checkIn":"2026-10-01","checkOut":"2026-10-04","party":{"adults":2,"children":0},"budget":{"mode":"hardCap","amountMinor":150000,"currency":"USD"}}' \
  http://localhost:3000/api/trpc/workspace.itinerary.draft > /tmp/uat6a-draft.json
ITIN_ID=$(node -e "const j=require('/tmp/uat6a-draft.json');console.log(j.result?.data?.itinerary?.id??'')")
curl -s -b /tmp/uat6a-s.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"itineraryId\":\"$ITIN_ID\",\"title\":\"Lisbon long weekend\",\"priceMinor\":30000,\"licenseTerms\":\"White-label permitted; keep attribution.\",\"revenueShareBps\":800}" \
  http://localhost:3000/api/trpc/workspace.marketplace.createListing > /tmp/uat6a-listing.json
LISTING_ID=$(node -e "const j=require('/tmp/uat6a-listing.json');console.log(j.result?.data?.listingId??'')")
echo "LISTING_ID=$LISTING_ID" >> /tmp/uat6a.env
cat /tmp/uat6a-listing.json
```
**Expected exit code:** 0
**Expected output contains:** "status":"listed"

### Step 3: A vetted reseller licenses the listing — the trade works
```bash
. /tmp/uat6a.env
RND=$(date +%s)
curl -s -c /tmp/uat6a-r1.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"email\":\"uat6a-r1-$RND@example.test\",\"password\":\"correct-horse-battery-staple-1\",\"name\":\"UAT Reseller One\"}" \
  http://localhost:3000/api/auth/sign-up/email > /dev/null
curl -s -b /tmp/uat6a-r1.jar -c /tmp/uat6a-r1.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"name\":\"UAT Reseller One\",\"slug\":\"uat6a-r1-$RND\"}" \
  http://localhost:3000/api/auth/organization/create > /tmp/uat6a-org-r1.json
ORG_R1=$(node -e "const j=require('/tmp/uat6a-org-r1.json');console.log(j.id??j.organization?.id??'')")
curl -s -b /tmp/uat6a-r1.jar -c /tmp/uat6a-r1.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"organizationId\":\"$ORG_R1\"}" http://localhost:3000/api/auth/organization/set-active > /dev/null
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('$ORG_R1', 'uat-operator')" > /dev/null
curl -s -b /tmp/uat6a-r1.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"listingId\":\"$LISTING_ID\"}" http://localhost:3000/api/trpc/workspace.marketplace.licenseListing
```
**Expected exit code:** 0
**Expected output contains:** "status":"licensed"
**Expected output contains:** "copyItineraryId"

### Step 4: The operator REVOKES the seller's vetting; the listing stays active
```bash
. /tmp/uat6a.env
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "DELETE FROM agency_vetting WHERE agency_id = '$ORG_SELLER'"
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "SELECT status FROM marketplace_listing WHERE id = '$LISTING_ID'"
```
**Expected exit code:** 0
**Expected output contains:** DELETE 1
**Expected output contains:** active

### Step 5: A NEW vetted reseller's license attempt is now refused as not vetted
```bash
. /tmp/uat6a.env
RND=$(date +%s)
curl -s -c /tmp/uat6a-r2.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"email\":\"uat6a-r2-$RND@example.test\",\"password\":\"correct-horse-battery-staple-1\",\"name\":\"UAT Reseller Two\"}" \
  http://localhost:3000/api/auth/sign-up/email > /dev/null
curl -s -b /tmp/uat6a-r2.jar -c /tmp/uat6a-r2.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"name\":\"UAT Reseller Two\",\"slug\":\"uat6a-r2-$RND\"}" \
  http://localhost:3000/api/auth/organization/create > /tmp/uat6a-org-r2.json
ORG_R2=$(node -e "const j=require('/tmp/uat6a-org-r2.json');console.log(j.id??j.organization?.id??'')")
curl -s -b /tmp/uat6a-r2.jar -c /tmp/uat6a-r2.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"organizationId\":\"$ORG_R2\"}" http://localhost:3000/api/auth/organization/set-active > /dev/null
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('$ORG_R2', 'uat-operator')" > /dev/null
echo "ORG_R2=$ORG_R2" >> /tmp/uat6a.env
curl -s -b /tmp/uat6a-r2.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"listingId\":\"$LISTING_ID\"}" http://localhost:3000/api/trpc/workspace.marketplace.licenseListing
```
**Expected exit code:** 0
**Expected output contains:** "status":"not_vetted"
**Expected output does NOT contain:** "status":"licensed"

### Step 6: The refusal recorded NO money state (conservation)
```bash
. /tmp/uat6a.env
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "SELECT (SELECT count(*) FROM marketplace_license WHERE listing_id='$LISTING_ID') || '|' || (SELECT count(*) FROM revenue_share_ledger WHERE seller_agency_id='$ORG_SELLER') || '|' || (SELECT count(*) FROM pmf_event WHERE agency_id='$ORG_SELLER' AND type='take_rate_accrued') || '|' || (SELECT count(*) FROM itinerary WHERE agency_id='$ORG_R2')"
```
**Expected exit code:** 0
**Expected output contains:** 1|1|1|0

### Step 7: Re-vetting the seller makes the SAME attempt succeed (falsifiability)
```bash
. /tmp/uat6a.env
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "INSERT INTO agency_vetting (agency_id, vetted_by) VALUES ('$ORG_SELLER', 'uat-operator')" > /dev/null
curl -s -b /tmp/uat6a-r2.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"listingId\":\"$LISTING_ID\"}" http://localhost:3000/api/trpc/workspace.marketplace.licenseListing
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "SELECT (SELECT count(*) FROM marketplace_license WHERE listing_id='$LISTING_ID') || '|' || (SELECT count(*) FROM revenue_share_ledger WHERE seller_agency_id='$ORG_SELLER') || '|' || (SELECT count(*) FROM pmf_event WHERE agency_id='$ORG_SELLER' AND type='take_rate_accrued') || '|' || (SELECT count(*) FROM itinerary WHERE agency_id='$ORG_R2')"
```
**Expected exit code:** 0
**Expected output contains:** "status":"licensed"
**Expected output contains:** 2|2|2|1

### Step 8: The home page still renders (browser witness)
**Browser action:** navigate to http://localhost:3000/
**Expected visible result:** the heading "TripForge" and a link labelled "Agency workspace"
**Expected NOT visible:** "Application error" or "500"
**Screenshot:** save as step-8.png in the evidence directory
