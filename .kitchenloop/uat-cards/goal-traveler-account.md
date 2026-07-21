# UAT Card — goal-traveler-account: Traveler home at /view

**Stack**: http://localhost:3000 (built compose image, already booted for you;
keyless — no live payments or LLM needed for this journey). Drive a real
browser; screenshot every step. Do not modify any product file.

**Feature under test**: a traveler can create an account from the consumer
surface with **no share token**, and lands on a real personalized **home** at
`/view` (greeting + a way to reach "My Trips" + honest "coming soon"
signposts), then can sign out back to a welcome. The traveler surface never
shows platform branding or an agency/workspace affordance.

## Steps

1. Open `http://localhost:3000/view` in a fresh, signed-out browser (do NOT
   append any token or query string).
   **Expect**: a page with a heading that reads exactly `Your trips`. Below it,
   two visible actions: a **Sign in** button and a **Create an account** button.
   The words `TripForge` and `Trellis` appear NOWHERE on the page. There is no
   link labeled `Agency workspace` and no mention of `agency membership`.
   Screenshot.

2. Click the **Create an account** button.
   **Expect**: the address bar shows exactly `/view/sign-up` (no `?token=` and
   no other query string). The form has fields for `Your name`, `Email`, and
   `Password`. There is NO field, label, or text mentioning `agency` or
   `organization` anywhere on the page. Screenshot.

3. In the sign-up form fill: Your name `Nadia Farooqi`, Email
   `uat-travelerhome-a@example.test`, Password `uat-pass-travelerhome`. Click
   **Create account**.
   **Expect**: the address bar changes to exactly `/view` (NOT `/view/sign-up`,
   NOT a token path). You are now signed in. Screenshot.

4. Read the `/view` page you landed on.
   **Expect**: a heading that reads exactly `Welcome, Nadia Farooqi`. The page
   does NOT contain the text `This is the traveler-facing view`. There are three
   cards: one titled `My Trips`, one titled `Plan a trip`, and one titled
   `Discover what's hot`. The `Plan a trip` and `Discover what's hot` cards each
   show the label `Coming soon`. The words `TripForge` and `Trellis` appear
   NOWHERE on the page, and there is no `Agency workspace` link. Screenshot.

5. Click the `My Trips` card.
   **Expect**: the address bar shows exactly `/view/my-trips`. Because this is a
   brand-new traveler who has opened no shared trips, the page shows an empty
   state with text starting `No trips yet`. Screenshot.

6. Confirm the `Plan a trip` and `Discover what's hot` cards are signposts, not
   working links: go back to `http://localhost:3000/view`, then click directly
   on the `Plan a trip` card body.
   **Expect**: the address bar stays on `/view` (the card does not navigate
   anywhere — it is a labeled "Coming soon" placeholder, not a broken link, and
   not an error). Screenshot.

7. On `/view`, find and click the **Sign out** control (a "Sign out" button in
   the footer of the home).
   **Expect**: after a moment the page returns to the signed-out welcome — a
   heading reading `Your trips` with the **Sign in** and **Create an account**
   buttons again, and NO `Welcome, Nadia Farooqi` greeting anywhere. Screenshot.

8. Reload `http://localhost:3000/view` once more (still signed out).
   **Expect**: the same signed-out welcome (heading `Your trips`, Sign in /
   Create an account), NOT a personalized greeting. `TripForge`/`Trellis` still
   appear nowhere. Screenshot.

## Verdict

Report `**Overall:** PASS` only if every step's Expect held exactly.
Otherwise report `**Overall:** PRODUCT_FAIL` with the failing step number(s)
and raw evidence. If a step could not be executed for environment reasons,
report `**Overall:** UAT_SPEC_FAIL` with the blocker.
