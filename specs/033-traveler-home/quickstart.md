# Quickstart: verify the Traveler Home

Against the built compose stack (INV-027): `docker compose down -v && docker compose up --build --wait`.

## 1. Token-less sign-up lands on a real home (US1)
1. Open a fresh signed-out browser at `http://localhost:3000/for-travelers`.
2. Click "Sign in to plan a trip →" → `/view/sign-in`; follow "Create an account" → `/view/sign-up`
   (note: **no** `?token=` in the URL).
3. Create an account (name / email / password).
4. **Expect**: you land on `/view` showing a home that greets you by your name, with a **My Trips**
   affordance and **Plan a trip** / **Discover** shown as *coming soon*. You do **not** see the old
   "This is the traveler-facing view…" placeholder.

## 2. Reach My Trips + sign out (US1/US2)
1. From the home, click **My Trips** → lands on `/view/my-trips` (empty state for a brand-new
   traveler: "No trips yet…").
2. Go back to `/view`, click **Sign out**.
3. **Expect**: session ends; `/view` now shows the anonymous welcome (Sign in / Create an account),
   not your name.

## 3. Trust boundary (US3)
1. Signed out, open `/view`.
2. **Expect**: a brand-neutral welcome — no "TripForge"/"Trellis" text, tab title is not the
   platform name, no "Agency workspace" link, no trip data.
3. Sign in again and confirm the signed-in home likewise shows no "TripForge"/"Trellis" and no
   "Agency workspace" link.

## 4. Automated
- `pnpm test` (in-image) — L1/L2/L3 incl. `l3-traveler-accounts.test.ts` (INV-023 FORBIDDEN).
- `pnpm exec playwright test traveler-account-journey smoke trust-boundary` — traveler home journey
  + preserved anonymous `/view` invariants.
