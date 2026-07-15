# User Test Card: ai-builder-chat-first-entry

## Feature (one sentence)
On the AI Builder page, an agent can type a plain-language trip request into a chat box (instead of filling in the destination/dates/budget form) and reach the same trip-option comparison the form produces; if the message is missing a destination or a budget, the assistant asks for it instead of guessing.

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
> `.kitchenloop/uat-runs/ai-builder-chat-first-entry/`.

### Step 1: Create a fresh agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "Chat Card QA", fill "Email" with "uatchat-qa@example.test", fill "Password" with "uatchat-pass-123", fill "Agency name" with "UAT Chat Agency", click the "Create account & agency" button
**Expected visible result:** the browser lands on http://localhost:3000/workspace and the header shows "Chat Card QA" and "UAT Chat Agency"
**Expected NOT visible:** any error alert
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: The AI Builder shows a chat box alongside the form
**Browser action:** on http://localhost:3000/workspace, look below the "Plan a trip" form
**Expected visible result:** a heading "Describe the trip you want" with a text box (placeholder text starting with `Plan 4 days in Lisbon`) and a "Send" button
**Expected NOT visible:** "Compare your options"
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Start a trip entirely by chatting
**Browser action:** click the text box under "Describe the trip you want", type exactly `Plan 4 days in Lisbon for 2, EUR 2000, boutique stay`, then click "Send"; wait up to 30 seconds
**Expected visible result:** a "Compare your options" heading appears with exactly 3 option cards, each with a "Choose this option" button; the text "Within budget" appears at least once; the text "2,000.00 EUR" appears at least once
**Expected NOT visible:** "Which destination"
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Choose an option — the rest of the flow is unchanged
**Browser action:** click the "Choose this option" button on the option card whose eyebrow text reads "Balanced"; wait up to 30 seconds
**Expected visible result:** a drafted itinerary appears with a "Budget summary" table, a "Book this trip at your markup" heading, a "Share with your client" heading, and (further down) an "Ask to add, remove, or swap something" heading — the same booking/share/chat-refine controls the structured form path produces
**Expected NOT visible:** any error alert
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: An incomplete chat message asks for what's missing, without drafting anything
**Browser action:** navigate to http://localhost:3000/workspace (a fresh AI Builder view), click the text box under "Describe the trip you want", type exactly `Plan a trip for 2 with a EUR 2000 budget`, then click "Send"; wait up to 15 seconds
**Expected visible result:** a reply appears in the chat box containing the word "destination"; the "Plan a trip" form heading is still visible on the page
**Expected NOT visible:** "Compare your options"
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: The structured form still works on its own, unchanged
**Browser action:** on the same fresh AI Builder view, fill "Destination" with "Tokyo, Japan", fill "Check-in" with "2026-09-01", fill "Check-out" with "2026-09-05", fill "Budget" with "2500", click "Draft itinerary"; wait up to 30 seconds
**Expected visible result:** a "Compare your options" heading appears with option cards
**Expected NOT visible:** any error alert
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Compose-log review
```bash
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled" | grep -v "duplicate key value violates unique constraint" | head -20
```
**Expected exit code:** 0 or 1 (grep finding nothing exits 1 — that is the PASS case)
**Expected output contains:** "" (empty output is the expected result)
**Expected output does NOT contain:** "FATAL"

## Artifacts
- `.kitchenloop/uat-runs/ai-builder-chat-first-entry/evidence.md` — per-step raw output and verdicts
- `.kitchenloop/uat-runs/ai-builder-chat-first-entry/step-1.png` … `step-6.png` — one screenshot per browser step

## Constraints
- MAX_DURATION: 240
