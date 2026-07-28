# UAT Card — goal-marketplace-fork-whitelabel (spec 041): traveler acts on a marketplace itinerary

**Surface:** consumer/traveler web surface, against the live compose stack at `http://localhost:3000`.
**Persona:** a brand-new traveler (no agency) who wants to browse trips agencies have published and act on one.
**Prerequisites (already true on the booted stack):** the demo seed has loaded several **vetted** agencies (e.g. "Azure Travel Co", "Meridian DMC", "Lisbon & Co", "Kaido Journeys", "Nordlight Adventures") who have each published a trip to the marketplace. You do NOT need to create a listing — they already exist.

Drive every step in a real browser (Playwright MCP). Screenshot each numbered step. Do NOT run any shell/database commands — everything is in the browser. Report **PASS** only if every checkpoint's expected result is met; otherwise **PRODUCT_FAIL** with the first failing step.

---

## Step 1 — Create a fresh traveler account
1. Navigate to `http://localhost:3000/view`.
2. Click the **"Create an account"** / sign-up call to action (test id `welcome-sign-up`). You land on `/view/sign-up`.
3. Fill the form:
   - **Your name:** `Uat Marketplace Traveler`
   - **Email:** `uat-mkt-traveler@example.test`
   - **Password:** `uat-marketplace-pass-9`
4. Click **Create account**.

**Expected:** you are signed in and returned to `/view` (the traveler home). No error banner. If you see "Too many requests", wait ~12 seconds and click **Create account** once more.

## Step 2 — Open the Marketplace from the traveler navigation
1. In the left **"Traveler navigation"** panel, click the **Marketplace** link.

**Expected:** the URL becomes `/view/marketplace`. A heading **"Marketplace"** is shown. You see a grid of trip cards (at least **3**). This is NOT a "coming soon" placeholder.

## Step 3 — Inspect a marketplace card (client-safe fields only)
1. Look at any one card in the grid (test id `marketplace-card`).

**Expected — the card shows ALL of:**
- a selling **agency name** (one of the vetted demo agencies, e.g. "Azure Travel Co" or "Meridian DMC"),
- a **"Verified"** badge (test id `marketplace-vetted`),
- a **"from <amount> <currency>"** price line (test id `marketplace-from-price`, e.g. "from 1,234.00 USD"),
- a **"Plan & book this trip"** button (test id `marketplace-fork`).

**Expected — the card and page DO NOT show any of (this is the load-bearing trust check):**
- the words "License fee", "License terms", or "revenue share",
- any percentage like "7.5%" describing a revenue share,
- the words "net rate" or "markup",
- the words "TripForge" or "Trellis" anywhere on the page.

## Step 4 — Fork a listing into your own trip
1. On one card, click **"Plan & book this trip"** (`marketplace-fork`).

**Expected:** you navigate to a trip page whose URL is `/view/<uuid>` (a 36-character token). The page shows the trip, and a choice between **"Book it myself"** (test id `fork-self-drive`) and **"Have an agent arrange this for me"** (test id `fork-handoff`). Note this URL.

## Step 5 — The self-book path is real (do NOT complete a booking)
1. On the trip page, click **"Book it myself"** (`fork-self-drive`).

**Expected:** a review screen appears (test id `self-book-review`) listing the items you would book, with a **Confirm** action. (You do not have to confirm — the point is that the self-book flow is wired, not a stub.) A client price may be shown; no net rate, cost, or markup is shown.

## Step 6 — The forked trip is saved in "My Trips"
1. In the **"Traveler navigation"** panel, click **My Trips**.

**Expected:** the URL becomes `/view/my-trips`. The trip you just forked is listed (test id `my-trips-row`), and its row shows the **selling agency's name** (the same agency whose card you forked in Step 4). The list is NOT the empty "No trips yet" state.

## Step 7 — Re-opening the trip returns to the same page
1. Click the forked trip's row in My Trips.

**Expected:** you return to the **same** `/view/<uuid>` URL you noted in Step 4, showing the same trip.

---

## Verdict
- **PASS** — every checkpoint above met, and Step 3's "DO NOT show" list held (no license fee / revenue share / net / markup / platform wordmark anywhere).
- **PRODUCT_FAIL** — name the first step whose expected result was not met, with a screenshot.

Record the overall result on a final line exactly as: `**Overall:** PASS` or `**Overall:** PRODUCT_FAIL`.
