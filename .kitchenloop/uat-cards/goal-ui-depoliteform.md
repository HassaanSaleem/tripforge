# User Test Card: goal-ui-depoliteform

## Feature (one sentence)

The agent and traveler surfaces no longer look like a bare "Google Form": the
sign-in/sign-up pages render a premium two-panel branded layout, the AI planner
groups its fields into titled, hinted sections, and the booking review shows a
polished summary — while every field, action, and the plan→book flow keep
working and the white-label traveler pages never leak the platform name.

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
> `.kitchenloop/uat-runs/goal-ui-depoliteform/`. Steps that say "by screenshot"
> are verified by looking at the captured screenshot image, not the text tree.

### Step 1: Agent sign-up page is a premium two-panel layout (not a bare form)

**Browser action:** navigate to http://localhost:3000/sign-up, then take a full-page screenshot
**Expected visible result (by screenshot):** the page is split into two side-by-side panels on a wide viewport — a dark teal/coral branded story panel on the LEFT (with a product screenshot image) and the account form on the RIGHT. The form still shows the fields "Your name", "Email", "Password", "Agency name" and a "Create account & agency" button.
**Expected NOT visible:** a single narrow centered form as the only element on an otherwise empty page
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Create an agency account

**Browser action:** in the form on the right, fill "Your name" with "Uma Depolite", fill "Email" with "uat-depoliteform@example.test", fill "Password" with "uat-depolite-123", fill "Agency name" with "UAT Depolite Travel", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/dashboard and the header shows "Uma Depolite" and "UAT Depolite Travel"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: The planner is grouped into titled, hinted sections

**Browser action:** navigate to http://localhost:3000/workspace, then take a screenshot
**Expected visible result:** the "Plan a trip" card shows THREE section headings reading exactly "Destination & dates", "Who's travelling", and "Budget & style", each with a small helper sentence beneath it. All of these fields are still present and fillable: "Destination", "Check-in", "Check-out", "Adults", "Children", "Budget", "Currency", a "Trip style" control, and a "Budget mode" control.
**Expected NOT visible:** a flat, ungrouped stack of labels and inputs with no section headings
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Draft a trip end-to-end

**Browser action:** click the "Destination" field, then in the panel click the option showing "Lisbon" and "Portugal"; fill "Check-in" with "2026-09-07", fill "Check-out" with "2026-09-10", fill "Budget" with "3000", click the button labeled "Balanced" in the Trip style control, click "Draft itinerary", then wait up to 40 seconds for the text "Drafting…" to disappear
**Expected visible result:** a drafted itinerary result appears containing the word "Lisbon" in a styled header, a total price ending in "EUR", and at least one "Day 1" heading
**Expected NOT visible:** a blank page, a raw JSON blob, or a stack trace
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Booking review shows a premium summary and books successfully

**Browser action:** scroll to the "Book this trip at your markup" section, fill "Markup %" with "15", click "Quote live prices", wait up to 40 seconds for the text "Quoting…" to disappear
**Expected visible result:** a review appears with the summary line "held at firm net rates" and a table whose column headers read "Book", "Item", "Net rate", "Markup", "Client price", "Hold"
**Expected NOT visible:** a raw error or stack trace
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Complete the booking

**Browser action:** ensure at least one item's "Book" checkbox is checked, click "Book selected items", wait up to 40 seconds for the text "Booking…" to disappear
**Expected visible result:** a booking confirmation appears with a heading such as "Booking confirmed" and a booking reference line
**Expected NOT visible:** a blank page, a raw JSON blob, or a stack trace
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Traveler (white-label) sign-in stays brand-neutral and premium

**Browser action:** open a new page and navigate to http://localhost:3000/view/sign-in, then take a screenshot
**Expected visible result (by screenshot):** a premium layout with a story panel beside the sign-in form; the form shows "Email", "Password" and a "Sign in" button
**Expected NOT visible:** the words "TripForge" or "Trellis" anywhere on the page (this is a white-label traveler surface — the platform name must never appear)
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: Compose-log review

```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```

**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts

- `.kitchenloop/uat-runs/goal-ui-depoliteform/evidence.md` — per-step raw output and verdicts, one `### Step N` heading per step above, ending with a single `**Overall:** PASS` / `**Overall:** PRODUCT_FAIL` line
- `.kitchenloop/uat-runs/goal-ui-depoliteform/step-1.png` … `step-7.png` — one screenshot per browser step

## Constraints

- MAX_DURATION: 240
