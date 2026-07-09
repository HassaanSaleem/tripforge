# User Test Card: seed-0005e

## Feature (one sentence)

A booking price hold that has passed its expiry can never be booked: the book
call refuses it with the typed reason "quote_expired", records no booking, no
component, no ledger row, and leaves the hold unconsumed.

## Prerequisites

- [ ] The built app stack is running and reachable at http://localhost:3000 (docker compose: web + postgres + mailpit)
- [ ] Docker is available on the host (used for database checks)

## Prerequisite Verification Commands

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health   # should print 200
docker compose -p tripforge ps --format '{{.Name}} {{.Status}}' | grep -c healthy   # should print 3
```

## Steps

Every bash step begins by loading shared variables from /tmp/uat5e.env and ends
by saving new ones; run the steps in order.

### Step 1: A new agent signs up and founds an agency
```bash
RND=$(date +%s)
curl -s -c /tmp/uat5e.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"email\":\"uat5e-$RND@example.test\",\"password\":\"correct-horse-battery-staple-1\",\"name\":\"UAT Expiry Agent\"}" \
  http://localhost:3000/api/auth/sign-up/email > /dev/null
curl -s -b /tmp/uat5e.jar -c /tmp/uat5e.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"name\":\"UAT Expiry Travel\",\"slug\":\"uat-expiry-$RND\"}" \
  http://localhost:3000/api/auth/organization/create > /tmp/uat5e-org.json
ORG_ID=$(node -e "const j=require('/tmp/uat5e-org.json');console.log(j.id??j.organization?.id??'')")
curl -s -b /tmp/uat5e.jar -c /tmp/uat5e.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"organizationId\":\"$ORG_ID\"}" http://localhost:3000/api/auth/organization/set-active > /dev/null
echo "ORG_ID=$ORG_ID" > /tmp/uat5e.env
curl -s -b /tmp/uat5e.jar http://localhost:3000/api/trpc/workspace.whoami
```
**Expected exit code:** 0
**Expected output contains:** "agencyId"

### Step 2: The agent drafts an itinerary and takes price holds (quote)
```bash
. /tmp/uat5e.env
curl -s -b /tmp/uat5e.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"destination":"Paris","checkIn":"2026-09-01","checkOut":"2026-09-03","party":{"adults":2,"children":0},"budget":{"mode":"hardCap","amountMinor":100000,"currency":"USD"}}' \
  http://localhost:3000/api/trpc/workspace.itinerary.draft > /tmp/uat5e-draft.json
ITIN_ID=$(node -e "const j=require('/tmp/uat5e-draft.json');console.log(j.result?.data?.itinerary?.id??'')")
echo "ITIN_ID=$ITIN_ID" >> /tmp/uat5e.env
curl -s -b /tmp/uat5e.jar -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d "{\"itineraryId\":\"$ITIN_ID\",\"markupBps\":1500}" \
  http://localhost:3000/api/trpc/workspace.booking.quote > /tmp/uat5e-quote.json
node -e "const j=require('/tmp/uat5e-quote.json');const ids=(j.result?.data?.items??[]).filter(i=>i.outcome==='held').map(i=>i.quote.quoteRowId);console.log('HELD='+ids.length);require('fs').appendFileSync('/tmp/uat5e.env','QUOTE_IDS='+ids.join(',')+'\n')"
```
**Expected exit code:** 0
**Expected output contains:** HELD=3

### Step 3: Time passes — every hold ages past its expiry
The sandbox hold window is 15–30 minutes; instead of waiting, age the persisted
holds by one explicit database statement (the persisted expiry is the value the
product must judge holds against).
```bash
. /tmp/uat5e.env
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "UPDATE booking_quote SET expires_at = now() - interval '1 second' WHERE agency_id = '$ORG_ID'"
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "SELECT count(*) FROM booking_quote WHERE agency_id = '$ORG_ID' AND expires_at < now()"
```
**Expected exit code:** 0
**Expected output contains:** UPDATE 3
**Expected output contains:** 3

### Step 4: Booking the expired holds is refused with the typed reason
```bash
. /tmp/uat5e.env
export ITIN_ID QUOTE_IDS
node -e "
const ids = process.env.QUOTE_IDS.split(',');
const body = JSON.stringify({ itineraryId: process.env.ITIN_ID, quoteRowIds: ids });
const fs = require('fs');
const cookie = fs.readFileSync('/tmp/uat5e.jar','utf8').split('\n').filter(l=>l.includes('\t')).map(l=>{const p=l.split('\t');return p[5]+'='+p[6];}).join('; ');
fetch('http://localhost:3000/api/trpc/workspace.booking.book',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000',cookie},body})
  .then(r=>r.json()).then(j=>{console.log(JSON.stringify(j.result?.data))});
"
```
**Expected exit code:** 0
**Expected output contains:** "status":"failed"
**Expected output contains:** "quote_expired"
**Expected output does NOT contain:** "confirmed"

### Step 5: Nothing was recorded and no hold was consumed (state conservation)
```bash
. /tmp/uat5e.env
docker compose -p tripforge exec -T postgres psql -U tripforge -d tripforge -t -A \
  -c "SELECT (SELECT count(*) FROM booking WHERE agency_id='$ORG_ID') || '|' || (SELECT count(*) FROM booking_component WHERE agency_id='$ORG_ID') || '|' || (SELECT count(*) FROM markup_ledger WHERE agency_id='$ORG_ID') || '|' || (SELECT count(*) FROM booking_quote WHERE agency_id='$ORG_ID' AND consumed_at IS NOT NULL)"
```
**Expected exit code:** 0
**Expected output contains:** 0|0|0|0

### Step 6: The home page still renders (browser witness)
**Browser action:** navigate to http://localhost:3000/
**Expected visible result:** the heading "TripForge" and a link labelled "Agency workspace"
**Expected NOT visible:** "Application error" or "500"
**Screenshot:** save as step-6.png in the evidence directory
