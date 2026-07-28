# UAT Card — Two-sided landing pages (goal-landing-pages / spec 032)

**Surface**: public marketing pages (no sign-in needed) on the live compose stack.
**Base URL**: `http://localhost:3000`
**How to run**: use a real browser (Playwright MCP). Take a screenshot after every
step. Do NOT edit any product file. Record each step PASS/FAIL with what you saw.

You are verifying three public pages of a travel product: a global landing that
presents two audiences (travelers and travel agents), a `/for-travelers` page,
and a `/for-agents` page. No account or token is required.

---

## Step 1 — Global landing presents both sides
1. Navigate to `http://localhost:3000/`.
2. Confirm the page shows a large heading with the exact text **TripForge**.
3. Confirm the page visibly presents BOTH a travelers story and a travel-agents
   story (look for a section that splits into a "For travelers" panel and a "For
   travel agents" panel, each with its own short description and a button).

**Expected**: A heading "TripForge" is visible AND both a travelers panel and an
agents panel are visible on the page.

## Step 2 — The home page keeps an "Agency workspace" link
1. Still on `/`, find a link whose visible text contains **Agency workspace**.

**Expected**: exactly such a link exists and is visible (it lives in the agents
panel).

## Step 3 — Navigate to the travelers page from the top nav
1. In the top navigation bar, click the link labelled **For travelers**.
2. Confirm the browser URL is now `http://localhost:3000/for-travelers`.

**Expected**: URL ends with `/for-travelers` and a travelers-focused page loads
(a heading about planning your trip; three numbered steps describing plan →
priced-for-real → book-yourself-or-ask-an-agent).

## Step 4 — Travelers page has a real demo video that does NOT auto-play
1. On `/for-travelers`, find the video player.
2. Confirm the video shows a still/poster image and is NOT already playing (no
   motion, no sound) when the page loads.
3. Confirm the video has visible playback controls (a play button / control bar).
4. Press play once and confirm the video begins to play.

**Expected**: the video is present with a poster image, is paused on load (no
autoplay, silent), exposes user controls, and plays when you press play.

## Step 5 — Travelers primary call-to-action points at traveler sign-in
1. On `/for-travelers`, find the primary button labelled **Sign in to plan a trip**.
2. Confirm its link target (href) is `/view/sign-in` (you may hover/inspect the
   link, or click it and confirm the URL becomes `http://localhost:3000/view/sign-in`,
   then navigate back to `/for-travelers`).

**Expected**: the CTA points to `/view/sign-in`.

## Step 6 — Navigate to the agents page from the top nav
1. From `/for-travelers`, in the top navigation bar click the link labelled
   **For agents**.
2. Confirm the URL is now `http://localhost:3000/for-agents`.

**Expected**: URL ends with `/for-agents` and an agents-focused page loads
(a heading about building client-ready trips; three numbered steps about
building with AI, booking at net rates with markup, and reselling/white-labeling
on the marketplace).

## Step 7 — Agents page has a real demo video that does NOT auto-play
1. On `/for-agents`, find the video player.
2. Confirm it shows a poster image, is NOT auto-playing (paused, silent) on load,
   and has visible controls.
3. Press play once and confirm it plays.

**Expected**: the agent demo video is present with a poster, paused on load,
controllable, and plays on demand.

## Step 8 — Agents primary call-to-action points at agent sign-up
1. On `/for-agents`, find the primary button labelled **Create an agency account**.
2. Confirm its link target is `/sign-up` (hover/inspect, or click and confirm the
   URL becomes `http://localhost:3000/sign-up`, then navigate back).

**Expected**: the CTA points to `/sign-up`.

## Step 9 — Nav round-trip has no dead ends
1. From `/for-agents`, in the top nav click the brand/logo **TripForge** (top-left).
2. Confirm you return to `http://localhost:3000/` and the "TripForge" heading is
   visible again.

**Expected**: the brand link returns you to the home page; every page reached in
Steps 1–9 was a real rendered page (never an error page).

## Step 10 — No horizontal scrolling on a phone-width screen
1. Resize the browser window to a narrow mobile width of **375 pixels** wide
   (e.g. `browser_resize` to width 375, height 800).
2. Visit each of `http://localhost:3000/`, `http://localhost:3000/for-travelers`,
   and `http://localhost:3000/for-agents` at this width.
3. On each, confirm there is NO horizontal scrollbar and content does not run off
   the right edge (you should not be able to scroll sideways).

**Expected**: none of the three pages scrolls horizontally at 375px wide; the
layout reflows to a single column and everything fits.

---

## Verdict
- **PASS** — all ten steps met their Expected result.
- **PRODUCT_FAIL** — one or more steps did not (state which step and what you saw).

Record the outcome on the last line exactly as:

`**Overall:** PASS`  or  `**Overall:** PRODUCT_FAIL`
