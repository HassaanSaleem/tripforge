# UAT Card — Consumer "What's Hot" discovery feed

**Ticket**: goal-consumer-whats-hot
**Surface**: consumer / traveler (browser)
**How to run**: The TripForge application is **ALREADY RUNNING** at **http://127.0.0.1:3100**. Do **NOT** build, install, migrate, boot, or run any shell/Docker command — use **only** the browser (Playwright MCP). Every step is a browser action. If any expected result does not hold exactly, the step FAILS.

Use this exact test account when signing up (the database is fresh, so it is unused):
- Name: `Uat Feedtester`
- Email: `uat-whatshot-iter11@example.test`
- Password: `uat-feed-pass-9`

---

## Step 1 — Discover is gated when signed out
1. Open a fresh browser and navigate to `http://127.0.0.1:3100/view/discover`.

**Expected**: You are redirected to the sign-in page — the URL ends with `/view/sign-in`. A sign-in form (an Email field, a Password field, and a "Sign in" button) is visible. There is **no** feed of destination cards on this page.

## Step 2 — Sign up as a traveler
1. Navigate to `http://127.0.0.1:3100/view/sign-up`.
2. Fill **Your name** = `Uat Feedtester`, **Email** = `uat-whatshot-iter11@example.test`, **Password** = `uat-feed-pass-9`.
3. Click **Create account**. (If you see a "Too many requests" message, wait ~12 seconds and click **Create account** again — up to 3 tries.)

**Expected**: You land on the traveler home at `http://127.0.0.1:3100/view`. The page greets you: **"Welcome, Uat Feedtester"**.

## Step 3 — Discover is a live nav link
1. In the left **"Traveler navigation"** panel, look at the **Discover** entry.

**Expected**: **Discover** is a clickable link (it is **not** greyed out and does **not** carry a "Soon" badge). (For contrast, **Group trips** in the same panel **does** show a "Soon" badge and is not a link.)

2. Click **Discover**.

**Expected**: The URL becomes `http://127.0.0.1:3100/view/discover`. A heading **"What's hot"** is shown. Below it is a row of destination choices including **Lisbon**, **Tokyo**, **Marrakech**, and **Reykjavik**. **Lisbon** is selected by default and **at least 3** cards are shown. Each card has: a photograph, a photo attribution line (reads like "Photo by … on Unsplash"), a short blurb, a **"Hotel highlight"** with a hotel name, and a **"Plan this"** button/link.

## Step 4 — Switching destination replaces the feed
1. Click the **Tokyo** destination choice.

**Expected**: The cards change to **Tokyo** experiences (card titles now reference Tokyo places, e.g. "Senso-ji", "Shibuya", "Tsukiji", or "Sumida"), fully replacing the Lisbon cards. At least 3 Tokyo cards are shown. No Lisbon card remains.

## Step 5 — "Plan this" seeds the AI planner
1. On the **first** Tokyo card, click **"Plan this"**.

**Expected**: The URL becomes `http://127.0.0.1:3100/view/plan?destination=Tokyo%2C%20Japan` (it contains `/view/plan?destination=`). The page heading is **"Plan a trip with our AI"**. The chat text input is **pre-filled** with **`Plan a trip to Tokyo, Japan`**. No chat message has been sent yet — the conversation area still shows the intro hint (a suggestion like `Try "Plan a trip to Lisbon"`), not a sent message bubble.

## Step 6 — Sending the seeded message proceeds into the planner
1. Click the **Send** button (do not retype anything).

**Expected**: Your message **"Plan a trip to Tokyo, Japan"** appears in the conversation as a sent message, and the assistant replies with a follow-up that asks about your **budget** (the reply text contains the word "budget").

## Step 7 — Home tile is live (no stale "coming soon")
1. Click **Home** in the left navigation.

**Expected**: On the home page there is a **"Discover what's hot"** tile that is a clickable link. Its text does **NOT** contain the words **"Coming soon"**.

## Step 8 — Brand neutrality on the Discover surface
1. Go back to `http://127.0.0.1:3100/view/discover`.

**Expected**: The words **"TripForge"** and **"Trellis"** do **NOT** appear anywhere on the page (neither in the visible text nor the browser tab title).

---

## Verdict
- If **all** of Steps 1–8 met their Expected result: **PASS**.
- If a step's Expected result did not hold (and it was not a transient "Too many requests" that later succeeded): **PRODUCT_FAIL**, naming the failing step.
- If you cannot reach `http://127.0.0.1:3100` at all in the browser: **UAT_SPEC_FAIL** (environment).

End your report with a single line exactly:
`**Overall:** PASS` (or `PRODUCT_FAIL` / `UAT_SPEC_FAIL`).
