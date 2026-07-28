# UAT Card — Consumer chat-first, budget-aware AI planner (goal-consumer-planner)

**Surface:** web (browser). **Base URL:** http://localhost:3000
**You are a first-time traveler.** Drive a real browser (Playwright MCP). Take a
screenshot at each numbered step. Do not read any source code. At the end, write
one line exactly: `**Overall:** PASS` or `**Overall:** PRODUCT_FAIL`.

Use a fresh, unique email each run so sign-up succeeds, e.g.
`uat-plan-<random>@example.test` with password `uat-plan-pass-8` and name `Priya Rao`.

## Steps

1. **Create a traveler account.** Navigate to `http://localhost:3000/view/sign-up`.
   - Fill **Your name** = `Priya Rao`, **Email** = your unique address,
     **Password** = `uat-plan-pass-8`, then click **"Create account"**.
   - EXPECT: you land on `http://localhost:3000/view`.
   - EXPECT: the words **"TripForge"** and **"Trellis"** appear NOWHERE on the page.

2. **"Plan a trip" is now a LIVE entry.** On `/view`:
   - EXPECT: the **"Plan a trip"** home tile is a real link (it does NOT say
     "Coming soon").
   - EXPECT: in the left navigation panel, **"Plan a trip"** is a link and does NOT
     show a **"Soon"** marker (unlike **Discover** and **Group trips**, which still show "Soon").

3. **Open the planner.** Click the **"Plan a trip"** tile (or the nav entry).
   - EXPECT: the URL becomes `http://localhost:3000/view/plan`.
   - EXPECT: a heading reads **"Plan a trip with our AI"**.
   - EXPECT: a chat box is shown with a prompt inviting you to describe your trip.

4. **Chat turn 1 — destination only.** In the chat input, type
   `Plan a trip to Lisbon` and click **"Send"**.
   - EXPECT: the assistant replies asking for more (e.g. a budget). NO
     **"Build my trip"** button appears yet.

5. **Chat turn 2 — add budget/dates/party.** Type
   `around EUR 2000 for 4 nights, 2 people` and click **"Send"**.
   - EXPECT: the assistant shows a summary mentioning **Lisbon** and a budget
     **around €2,000** (or EUR 2000).
   - EXPECT: a **"Build my trip"** button now appears.

6. **Build the trip.** Click **"Build my trip"**.
   - EXPECT: after a short wait, one or more trip options appear under a heading
     like **"Compare live-priced trips"**.
   - EXPECT: each option shows a **total price** (a currency amount) and a
     per-category breakdown (rows such as **Stays**, **Activities**, **Flights & transport**).
   - EXPECT: the words **"net rate"**, **"markup"**, and **"merchant of record"**
     appear NOWHERE on the page (the traveler sees sell prices only).

7. **Pick an option.** Click **"Choose this trip"** on the first option.
   - EXPECT: a plan detail appears with the option title, a total, and day-by-day
     items (stays / activities / transfers) with prices.
   - EXPECT: a **"What next?"** section offers TWO choices:
     **"Book it myself"** and **"Have an agent arrange & book this for me"**.

8. **"Book it myself" is honest, not a fake booking.** Click **"Book it myself"**.
   - EXPECT: a message explains that self-drive booking runs on trips an agent has
     prepared, and offers to have an agent arrange this one. NO booking confirmation
     / receipt / "Booked" badge appears (no purchase happens).

9. **Request an agent to arrange it.** Click
   **"Have an agent arrange & book this for me"**.
   - EXPECT: a short form appears. The **Your name** field is pre-filled with
     **"Priya Rao"**.
   - Leave the name, then click **"Send request"**.
   - EXPECT: a confirmation appears reading something like **"Request sent"** and
     **"An agent will be in touch"** (mentioning the chosen trip).

10. **Brand-neutral throughout.** Look over the planner pages you visited.
   - EXPECT: the words **"TripForge"** and **"Trellis"** appear NOWHERE, and there
     is no "Agency workspace" link (this is the traveler surface).

## Verdict

- PASS only if every EXPECT above held.
- PRODUCT_FAIL if any EXPECT failed (say which step).
- If you cannot run the browser or reach the site at all, say `ENVIRONMENT_BLOCKED`
  and what blocked you.

Write the final line exactly as `**Overall:** PASS` (or `PRODUCT_FAIL`, or
`ENVIRONMENT_BLOCKED`).
