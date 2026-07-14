# User Test Card: media-upload-serving-hardening

## Feature (one sentence)
When an agent uploads a photo to their media library, the platform serves it back with defense-in-depth response headers (so a browser never sniffs it into executable content), and refuses to store a file whose bytes don't actually match the file type it claims to be.

## Prerequisites
- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (the log review step uses it)
- [ ] The repo file `tests/fixtures/uat-photo.jpg` exists (a small real JPEG)
- [ ] The repo file `tests/fixtures/uat-mismatched-photo.png` exists (the SAME JPEG bytes, but named with a `.png` extension — a browser will offer it as `image/png` even though its content is a JPEG)

## Prerequisite Verification Commands
```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
test -f tests/fixtures/uat-photo.jpg && echo "fixture 1 present"   # should print "fixture 1 present"
test -f tests/fixtures/uat-mismatched-photo.png && echo "fixture 2 present"   # should print "fixture 2 present"
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/media-upload-serving-hardening/`.

### Step 1: Create the agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Hana Hardening", fill "Email" with "uat-hardening-agent@example.test", fill "Password" with "uat-hardening-pass-1", fill "Agency name" with "UAT Hardening Co", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Hana Hardening" and "UAT Hardening Co"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Upload a real, correctly-typed photo
**Browser action:** navigate to http://localhost:3000/media. Find the SECOND form on the page, titled by its "Upload a photo from your device" label (this is separate from the first form, which asks for a "Media URL" — do NOT use that first form for this step). In the second form: leave "Source" as its default "Your upload", click the "Upload a photo from your device" file control and choose the file at the absolute path you get by resolving `tests/fixtures/uat-photo.jpg` from your worktree's repo root, fill "Alt text" with "Good photo", click "Upload photo"
**Expected visible result:** within 15 seconds, a media card appears showing the text "Good photo" with a visible image thumbnail (the photo itself, not a broken-image icon) and a "Your upload" badge
**Expected NOT visible:** "No media yet", any error alert, a broken/missing image icon
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Capture the served image address (no manual transcription) and check its response headers
**Browser action:** on the same `/media` page, use your browser tool's JavaScript-evaluation capability to run exactly this async expression and capture its return value:
`async () => { const src = document.querySelector('img[alt="Good photo"]').src; const res = await fetch(src); return { status: res.status, contentType: res.headers.get('content-type'), nosniff: res.headers.get('x-content-type-options'), disposition: res.headers.get('content-disposition') }; }`
**Expected visible result:** the returned object has `status: 200`, `contentType` equal to `"image/jpeg"`, `nosniff` equal to `"nosniff"`, and `disposition` containing the word `inline`
**Expected NOT visible:** a `nosniff` value that is null/empty, or a `disposition` value that is null/empty

### Step 4: Attempt to upload a file whose bytes don't match its declared type
**Browser action:** still on http://localhost:3000/media, in the SAME "Upload a photo from your device" form: click the file control again and choose the file at the absolute path you get by resolving `tests/fixtures/uat-mismatched-photo.png` from your worktree's repo root, fill "Alt text" with "Bad photo", click "Upload photo"
**Expected visible result:** an error message appears reading "That file's contents don't match its file type. Try a different file."
**Expected NOT visible:** a new media card containing the text "Bad photo" (the upload must be refused, not persisted)
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Confirm nothing from the refused upload persisted
**Browser action:** reload http://localhost:3000/media (full page navigation, not a client-side refresh)
**Expected visible result:** exactly one media card is visible, showing "Good photo" (the Step 2 upload)
**Expected NOT visible:** any card containing the text "Bad photo"
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/media-upload-serving-hardening/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/media-upload-serving-hardening/step-1.png` … `step-5.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 240
