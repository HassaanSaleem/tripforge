# User Test Card: demo-05-planner-ux

## Feature (one sentence)

An agent planning a trip picks the destination from a visual picker (or types their own) and human-labeled budget/style controls instead of raw code words, and the AI's drafted itinerary comes back as a single polished result card instead of a plain data table.

## Prerequisites

- [ ] The TripForge compose stack is running (web on http://localhost:3000)
- [ ] Docker CLI available (the log review step uses it)

## Prerequisite Verification Commands

```bash
curl -sf http://localhost:3000/api/health    # should print an ok/health JSON
docker compose ps --format '{{.Name}} {{.Status}}' | grep -c running   # should print 2 or more
```

## Steps

> All browser steps run against http://localhost:3000 with the Playwright MCP
> browser tools. Save every screenshot into the evidence directory
> `.kitchenloop/uat-runs/demo-05-planner-ux/`.

### Step 1: Create an agency account

**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Uma Uat", fill "Email" with "uat05-planner@example.test", fill "Password" with "uat05-pass-123", fill "Agency name" with "UAT Compass 05", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uma Uat" and "UAT Compass 05"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Open the AI itinerary planner and inspect the budget/style controls

**Browser action:** navigate to http://localhost:3000/workspace
**Expected visible result:** a heading "Plan a trip"; a "Budget mode" control with two buttons reading exactly "Hard cap" and "Target budget"; a "Trip style" control with buttons reading "No preference", "Budget-savvy", "Balanced", "Premium"
**Expected NOT visible:** the raw words "hardCap", "target" (as a standalone control label), or "balanced"/"budget"/"premium" written in all-lowercase-no-spaces form anywhere on the page
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Open the destination picker

**Browser action:** click the "Destination" field
**Expected visible result:** a panel appears showing at least four options, including one labeled "Lisbon" with "Portugal" beneath it
**Expected NOT visible:** an empty panel with no options
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Pick Lisbon and fill in the rest of the trip

**Browser action:** click the destination option showing "Lisbon" and "Portugal", then fill "Check-in" with "2026-09-07", fill "Check-out" with "2026-09-10", fill "Budget" with "2500", click the button labeled "Balanced" in the Trip style control, click the "Draft itinerary" button, then wait up to 30 seconds for the text "Drafting…" to disappear
**Expected visible result:** the Destination field reads exactly "Lisbon, Portugal" just before drafting starts
**Expected NOT visible:** n/a
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Inspect the drafted result card

**Browser action:** observe the page after drafting finishes (from Step 4)
**Expected visible result:** a single visually-styled result card containing the word "Lisbon" in its heading, the text "Total" followed by a price ending in "EUR", and at least one "Day 1" heading below it; a "Budget summary" section is present further down
**Expected NOT visible:** the raw word "hardCap" anywhere on the page; a plain HTML table as the very first thing shown for the result (the price/title must appear inside a styled header area, not a bare table row)
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Negative test — an impossibly low budget is rejected gracefully

**Browser action:** change the "Budget" field to "1", click the "Draft itinerary" button again, wait up to 30 seconds for the text "Drafting…" to disappear
**Expected visible result:** a visible alert-style message mentioning the budget or that no bookable options fit
**Expected NOT visible:** a blank white page, a raw JSON blob, or a stack trace

**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Compose-log review

```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```

**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts

- `.kitchenloop/uat-runs/demo-05-planner-ux/evidence.md` — per-step raw output and verdicts, one `### Step N` heading per step above
- `.kitchenloop/uat-runs/demo-05-planner-ux/step-1.png` … `step-6.png` — one screenshot per browser step

## Constraints

- MAX_DURATION: 180
