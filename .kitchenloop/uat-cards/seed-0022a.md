# User Test Card: seed-0022a

## Feature (one sentence)
An agent can upload a real photo file straight from their device into the media library (no URL typed anywhere), attach it to a trip's gallery, and share the trip so a client sees the same photo on the branded proposal page — served by the platform itself, with no internal library details ever visible to the client.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (the log review step uses it)
- [ ] The repo file `tests/fixtures/uat-photo.jpg` exists (a small real JPEG used for the upload step)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
test -f tests/fixtures/uat-photo.jpg && echo "fixture present"   # should print "fixture present"
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/seed-0022a/`.

### Step 1: Create the agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uma Uploader", fill "Email" with "uat22a-agent@example.test", fill "Password" with "uat22a-pass-123", fill "Agency name" with "UAT Uploads 22a", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uma Uploader" and "UAT Uploads 22a"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Upload a real photo file (no URL typed)
**Browser action:** navigate to http://localhost:3000/media. Find the SECOND form on the page, titled by its "Upload a photo from your device" label (this is separate from the first form, which asks for a "Media URL" — do NOT use that first form for this step). In the second form: leave "Source" as its default "Your upload", click the "Upload a photo from your device" file control and choose the file at the absolute path you get by resolving `tests/fixtures/uat-photo.jpg` from your worktree's repo root, fill "Alt text" with "UAT device photo", click "Upload photo"
**Expected visible result:** within 15 seconds, a media card appears showing the text "UAT device photo" with a visible image thumbnail (the photo itself, not a broken-image icon) and a "Your upload" badge
**Expected NOT visible:** "No media yet", any error alert, a broken/missing image icon
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Draft an itinerary
**Browser action:** navigate to http://localhost:3000/workspace. In the "Plan a trip" form, fill "Destination" with "Paris", "Check-in" with "2026-09-01", "Check-out" with "2026-09-05", "Adults" with "2", "Children" with "0", fill "Budget" with "2500", fill "Currency" with "EUR", click "Draft itinerary", wait up to 90 seconds. When the "Compare your options" panel appears, click "Choose this option" on the card labeled "Balanced"
**Expected visible result:** the compare panel is replaced by a drafted itinerary view (or the page navigates on to show the trip is saved)
**Expected NOT visible:** any error alert
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Open the trip and attach the uploaded photo to the gallery
**Browser action:** navigate to http://localhost:3000/trips, click "Open" on the trip just drafted; once the trip view opens, find the "Gallery" section and its "+ Add to gallery" dropdown, select "UAT device photo" from it
**Expected visible result:** an image thumbnail (the uploaded photo) appears in the Gallery section with a small "×" remove button on it
**Expected NOT visible:** "No gallery photos yet." (that text must be gone once the photo is attached)
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Capture the workspace image address (no manual transcription)
**Browser action:** on the SAME opened trip view, use your browser tool's JavaScript-evaluation capability to run exactly this expression and capture its return value: `document.querySelector('[data-testid="trip-gallery-list"] img').src`
**Expected visible result:** the returned string starts with "http://localhost:3000/api/media/"
**Expected NOT visible:** an empty string or a value starting with "https://images.example.test" (that would mean the URL-registration form was used by mistake in Step 2 — if so, stop and record a PRODUCT_FAIL noting Step 2 used the wrong form)
Record this exact string as MEDIA_URL for Step 8.

### Step 6: Share the trip with the client
**Browser action:** find the "Share with your client" section within the SAME opened trip view, click "Share with client"
**Expected visible result:** a link appears in a code element with the test id "share-url", starting with "http://localhost:3000/view/"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Open the shared link exactly (no manual retyping)
**Browser action:** Do NOT read the link visually from the screenshot and do NOT type it by hand — transcription errors invalidate this step. Instead, use your browser tool's JavaScript-evaluation capability to run exactly this expression on the current page and capture its return value: `document.querySelector('[data-testid="share-url"]').textContent.trim()`. Then navigate the SAME browser tab directly to the exact string that expression returned.
**Expected visible result:** the page loads with the heading "UAT Uploads 22a" (the agency name) visible near the top
**Expected NOT visible:** "isn't available" (that text means the wrong or a mistyped link was used — if you see it, re-run the JavaScript-evaluation step exactly as written and navigate again before recording a failure)
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: The client sees the SAME uploaded photo, served by the platform
**Browser action:** on the page loaded in Step 7, look for a gallery image near the top of the page. Use your browser tool's JavaScript-evaluation capability to run exactly this expression and capture its return value: `document.querySelector('img').src`
**Expected visible result:** the image is visible on the page (not a broken-image icon), AND the JavaScript expression's returned string is EXACTLY EQUAL to the MEDIA_URL string you recorded in Step 5
**Expected NOT visible:** any text reading "UAT22a-agent@example.test" or the word "agent-upload" (the internal source label) anywhere on the page
**Screenshot:** save as step-8.png in the evidence directory

### Step 9: The serving route itself leaks nothing beyond the photo
**Browser action:** on the SAME client-view page from Step 8, use your browser tool's JavaScript-evaluation capability to run exactly this async expression and capture its return value:
`async () => { const src = document.querySelector('img').src; const res = await fetch(src); return { status: res.status, contentType: res.headers.get('content-type'), headerNames: [...res.headers.keys()] }; }`
**Expected visible result:** the returned object has `status: 200` and `contentType` equal to `"image/jpeg"`
**Expected NOT visible:** `headerNames` containing any name like "x-agency-id" or "x-attribution" (only ordinary HTTP/caching headers plus content-type are allowed)

### Step 10: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/seed-0022a/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/seed-0022a/step-1.png` … `step-8.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 300
