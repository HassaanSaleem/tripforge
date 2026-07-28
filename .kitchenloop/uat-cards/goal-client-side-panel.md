# UAT Card — Consumer-surface navigation side panel (goal-client-side-panel)

**Surface:** web (browser). **Base URL:** http://localhost:3000
**You are a first-time traveler.** Drive a real browser (Playwright MCP). Take a
screenshot at each numbered step. Do not read any source code. At the end, write
one line exactly: `**Overall:** PASS` or `**Overall:** PRODUCT_FAIL`.

Use a fresh, unique email each run so sign-up succeeds, e.g.
`uat-nav-<random>@example.test` with password `uat-nav-pass-8` and name `Sam Traveler`.

## Steps

1. **Anonymous welcome, no panel.** Navigate to `http://localhost:3000/view`.
   - EXPECT: a heading reading **"Your trips"** and two actions **"Sign in"** and
     **"Create an account"**.
   - EXPECT: there is **NO** left-hand navigation panel (no navigation region
     labelled "Traveler navigation").
   - EXPECT: the words **"TripForge"** and **"Trellis"** appear NOWHERE on the page.

2. **Create an account.** Click **"Create an account"**.
   - EXPECT: the URL becomes `http://localhost:3000/view/sign-up`.
   - Fill **Your name** = `Sam Traveler`, **Email** = your unique address,
     **Password** = `uat-nav-pass-8`, then click **"Create account"**.
   - EXPECT: you land back on `http://localhost:3000/view`.

3. **Signed-in home shows the panel.** On `/view` after sign-up:
   - EXPECT: a persistent left navigation panel is now visible. Its header reads
     **"Your travel"**.
   - EXPECT: the panel lists, in order: **Home**, **My Trips**, **Plan a trip**,
     **Discover**, **Group trips**.
   - EXPECT: **Plan a trip**, **Discover**, and **Group trips** each show a small
     **"Soon"** marker.
   - EXPECT: at the bottom of the panel there is an Account area showing the name
     **"Sam Traveler"** and a **"Sign out"** button.
   - EXPECT: **Home** is marked as the current section (highlighted / current page).
   - EXPECT: the main content greets **"Welcome, Sam Traveler"**.
   - EXPECT: the words **"TripForge"** and **"Trellis"** appear NOWHERE on the page.

4. **Coming-soon items are not links.** In the panel, try to click **"Plan a trip"**,
   **"Discover"**, and **"Group trips"**.
   - EXPECT: none of them navigate anywhere — the URL stays `http://localhost:3000/view`.
     They are labelled "Soon" and are not clickable links.

5. **Navigate to My Trips via the panel.** Click **"My Trips"** in the panel.
   - EXPECT: the URL becomes `http://localhost:3000/view/my-trips`.
   - EXPECT: the panel is still present, and **"My Trips"** is now the current
     section.
   - EXPECT: the page shows an empty-state message containing **"No trips yet"**.

6. **Navigate back Home via the panel.** Click **"Home"** in the panel.
   - EXPECT: the URL becomes `http://localhost:3000/view`.
   - EXPECT: **"Home"** is the current section again.

7. **Mobile: responsive collapse, no horizontal scroll.** Resize the browser
   window to a narrow phone width of **390 px** wide (e.g. 390 × 800).
   - EXPECT: there is **no horizontal scrollbar** (the page fits the width).
   - EXPECT: the full sidebar is no longer shown as a column; instead a small
     menu/hamburger button appears near the top-left.
   - Click that menu button. EXPECT: the navigation panel slides in / becomes
     visible with the same items (Home, My Trips, …).

8. **Sign out from the panel.** Resize back to a desktop width (e.g. 1280 × 800),
   go to `http://localhost:3000/view`, and click **"Sign out"** in the panel's
   Account area.
   - EXPECT: you return to the anonymous welcome — heading **"Your trips"** with
     **"Sign in"** / **"Create an account"** — and the navigation panel is GONE.

9. **Share-proposal view carries no panel.** Navigate to
   `http://localhost:3000/view/00000000-0000-4000-8000-000000000000` (a
   share-proposal URL) while signed out.
   - EXPECT: there is **NO** navigation panel (no "Traveler navigation" region).
   - EXPECT: the words **"TripForge"** and **"Trellis"** appear NOWHERE on the page.

## Verdict

- PASS only if every EXPECT above held.
- PRODUCT_FAIL if any EXPECT failed (say which step).
- If you cannot run the browser or reach the site at all, say `ENVIRONMENT_BLOCKED`
  and what blocked you.

Write the final line exactly as `**Overall:** PASS` (or `PRODUCT_FAIL`, or
`ENVIRONMENT_BLOCKED`).
