# User Test Card: demo-03-chat-builder

## Feature (one sentence)
A travel agent can refine an already-drafted trip by chatting in plain
English — adding an activity, removing an item, or swapping the hotel via a
suggestion card — instead of starting the plan over.

## Prerequisites
- [ ] The live compose stack is running and reachable at http://localhost:3000

## Prerequisite Verification Commands
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```
**Expected output:** `200`

## Steps

### Step 1: Create an agency account
**Browser action:** navigate to http://localhost:3000/sign-up, fill "Your name" with "UAT Agent", fill "Email" with "uat-chat-020@example.test", fill "Password" with "TripForge2026!", fill "Agency name" with "UAT Chat Travel", then click "Create account & agency"
**Expected visible result:** the page URL becomes `http://localhost:3000/dashboard` and the page shows the text "UAT Agent"
**Expected NOT visible:** any text containing "error" or "invalid"
**Screenshot:** save as step-1.png in the evidence directory

### Step 2: Draft a trip
**Browser action:** navigate to http://localhost:3000/workspace, fill "Destination" with "Paris", fill "Check-in" with "2026-09-01", fill "Check-out" with "2026-09-04", fill "Budget" with "3000", then click "Draft itinerary"
**Expected visible result:** within 15 seconds, the heading "Compare your options" appears, with three option cards labeled "Budget-savvy", "Balanced", and "Premium"
**Expected NOT visible:** any text containing "error" or "failed"
**Screenshot:** save as step-2.png in the evidence directory

### Step 3: Select the Balanced option
**Browser action:** click the "Choose this option" button inside the card labeled "Balanced"
**Expected visible result:** within 15 seconds, the heading "Paris balanced trip" appears, and further down the page a section titled "Refine with chat" with the heading "Ask to add, remove, or swap something" is visible
**Expected NOT visible:** any text containing "error" or "failed"
**Screenshot:** save as step-3.png in the evidence directory

### Step 4: Add an item via chat
**Browser action:** click the chat text input (placeholder text `e.g. "add a food tour on day 2"`), type exactly `add a food tour on day 2`, then click the "Send" button
**Expected visible result:** within 15 seconds, a new line of text appears in the chat reading exactly: `Added "Paris Old Town Walking Tour" to day 2.`
**Expected NOT visible:** the text "Thinking…" still showing (it must disappear once the reply arrives)
**Screenshot:** save as step-4.png in the evidence directory

### Step 5: Remove an item via chat
**Browser action:** click the chat text input, type exactly `remove the Paris River Cruise`, then click the "Send" button
**Expected visible result:** within 15 seconds, a new line of text appears in the chat reading exactly: `Removed "Paris River Cruise" from day 2.`
**Expected NOT visible:** the text "Paris River Cruise" anywhere in the day-by-day itinerary list above the chat (it must be gone from the trip, not just acknowledged)
**Screenshot:** save as step-5.png in the evidence directory

### Step 6: Ask for hotel suggestions
**Browser action:** click the chat text input, type exactly `suggest a hotel`, then click the "Send" button
**Expected visible result:** within 15 seconds, at least one card appears in the chat with a hotel name and a price, and a button labeled "Add to trip" next to it
**Expected NOT visible:** the itinerary's day-by-day list changing yet (the hotel must NOT be swapped until the button below is clicked)
**Screenshot:** save as step-6.png in the evidence directory

### Step 7: Commit the hotel suggestion
**Browser action:** click the "Add to trip" button that appeared in Step 6
**Expected visible result:** within 15 seconds, a new line of text appears in the chat starting with `Added "` and ending with `" to your trip.`, AND the day-by-day itinerary list above the chat now shows a `stay:` line with that same hotel name (not "Paris Boutique" anymore)
**Expected NOT visible:** the text "Paris Boutique" appearing as a `stay:` line anywhere in the itinerary
**Screenshot:** save as step-7.png in the evidence directory

### Step 8: Confirm the changes persisted
**Browser action:** navigate to http://localhost:3000/trips, click the "Open" button on the row titled "Paris balanced trip", then look at the day-by-day itinerary shown
**Expected visible result:** the itinerary still shows the hotel from Step 7 as a `stay:` line, an `activity: Paris Old Town Walking Tour` line on Day 2, and NO `Paris River Cruise` line anywhere
**Expected NOT visible:** the text "Paris River Cruise", or "Paris Boutique" as a `stay:` line
**Screenshot:** save as step-8.png in the evidence directory

## Artifacts
- 8 screenshots (step-1.png through step-8.png) in the evidence directory
- `.kitchenloop/uat-runs/demo-03-chat-builder/evidence.md` with raw output/observations for every step

## Constraints
- MAX_DURATION: 240
