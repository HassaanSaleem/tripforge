# UAT Card — demo-02-shell: Dashboard app shell (sidebar nav + Agent Home)

**Stack**: http://localhost:3000 (built compose image, already booted for you;
keyless — the planner is deterministic). Drive a real browser; screenshot
every step. Do not modify any product file.

**Feature under test**: signing in now lands on a real dashboard (sidebar
nav + Agent Home stats), not a single scrolling form. The planner, trips
list, and media library each have their own destination in the sidebar.

## Steps

1. Open `http://localhost:3000/sign-up`. Fill: Your name `Uma Shell`, Email
   `uat-demo02-a@example.test`, Password `uat-pass-demo02`, Agency name
   `UAT Shell Co Demo02`. Click **Create account & agency**.
   **Expect**: the browser's address bar shows `/dashboard` (not
   `/workspace`).

2. On the page, find the left sidebar.
   **Expect**: it lists, top to bottom, exactly these six items:
   `Dashboard`, `AI Builder`, `Trips`, `Marketplace`, `Media`, `Discover`.
   `Dashboard` is visually highlighted as the current item. The top-right of
   the page still shows your name `Uma Shell`, the agency name
   `UAT Shell Co Demo02`, a `role` badge reading `owner`, and a **Sign out**
   button. Screenshot.

3. In the main content area, find the "At a glance" card.
   **Expect**: exactly five tiles labeled `GBV`, `EARNINGS`, `ACTIVE TRIPS`,
   `LISTINGS`, `LICENSES`. `GBV` and `EARNINGS` both show `—`. `ACTIVE TRIPS`,
   `LISTINGS`, and `LICENSES` each show `0`. Below it, a "What's happened
   lately" card shows the text `Nothing yet` (not a blank card). Below that,
   two clickable cards titled `Start a new trip` and `Browse marketplace`.
   Screenshot.

4. Click the sidebar item **AI Builder**.
   **Expect**: the address bar shows `/workspace`; `AI Builder` is now the
   highlighted sidebar item (`Dashboard` is not); the page shows a heading
   `Where to next?` and a "Plan a trip" form. The sidebar and the top-right
   identity/Sign-out are still visible, unchanged.

5. In the "Plan a trip" form fill: Destination `Lisbon`, Check-in
   `2026-09-01`, Check-out `2026-09-04`, Adults `2`, Children `0`, Trip
   style `balanced`, Budget `1500`, Budget mode `hardCap`, Currency `USD`.
   Click **Draft itinerary** and wait (up to 30 s) for the drafted itinerary
   to render.
   **Expect**: a drafted itinerary titled `Lisbon balanced trip` with a
   Total shown in USD.

6. In the same drafted view, find the "Inline booking" section. Click
   **Quote live prices** and wait (up to 15 s), then click **Book selected
   items** and wait (up to 15 s).
   **Expect**: a "Booking confirmed" result appears with a booking
   reference.

7. Click the sidebar item **Trips**.
   **Expect**: the address bar shows `/trips`; `Trips` is now the
   highlighted sidebar item. Exactly ONE row is listed: title
   `Lisbon balanced trip`, a `USD` badge, and an **Open** button. Screenshot.

8. Click the sidebar item **Discover**.
   **Expect**: the address bar shows `/discover`; `Discover` is now the
   highlighted sidebar item. The page shows a heading `Coming soon` and body
   text mentioning `What's Hot`. There is no error message and no blank
   page — it is a clearly-labeled placeholder, not a broken link.
   Screenshot.

9. Click the sidebar item **Dashboard**.
   **Expect**: the address bar shows `/dashboard` again. The `GBV` tile no
   longer shows `—` — it now shows a dollar amount ending in ` USD` (exact
   number not important). The `ACTIVE TRIPS` tile now shows `1` (not `0`).
   The "What's happened lately" card now lists at least one entry
   containing the word `drafted` and at least one entry containing the word
   `Booking`. Screenshot.

10. Resize the browser window to a narrow width (around 420 pixels wide, or
    use a mobile viewport preset), then reload `/dashboard`.
    **Expect**: the six-item sidebar list is NOT visible on screen by
    default; instead a single small square button (a menu/hamburger toggle)
    is visible near the top-left. Click that button.
    **Expect**: the sidebar (all six items) slides into view and
    `Marketplace` is clickable — click it and confirm the address bar
    changes to `/marketplace`. Screenshot before and after clicking the
    toggle.

11. Sign out (click **Sign out**), then open `http://localhost:3000/workspace`
    directly without signing in.
    **Expect**: no sidebar, no dashboard — instead a message mentioning
    `agency membership`, with a link to sign in and a link to create an
    account.

## Verdict

Report `**Overall:** PASS` only if every step's Expect held exactly.
Otherwise report `**Overall:** PRODUCT_FAIL` with the failing step number(s)
and raw evidence. If a step could not be executed for environment reasons,
report `**Overall:** UAT_SPEC_FAIL` with the blocker.
