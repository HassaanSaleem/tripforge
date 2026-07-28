# Quickstart: Consumer-surface navigation side panel

## What this is

A persistent, brand-neutral navigation panel on the signed-in traveler consumer
surface (`/view` home, `/view/my-trips`). Home + My Trips are live links; Plan a
trip, Discover / What's Hot, and Group trips are honest "coming soon" signposts;
Account/sign-out lives in the panel. The anonymous share view and welcome are
unchanged.

## Verify locally (built compose stack, INV-027)

```bash
# From repo root — boot the BUILT image (not a dev server)
docker compose down -v && docker compose up --build --wait

# L1 (nav data invariants) + full suite, in the built image (keyless FakeLLM ok)
docker run --rm --network host tripforge-verify pnpm test

# e2e against the running stack
BASE_URL=http://localhost:3000 npx playwright test tests/e2e/consumer-nav-journey.spec.ts
```

## Browser journey (manual QA / UAT card)

1. Go to `/view` **signed out** → brand-neutral welcome, NO nav panel, no
   "TripForge"/"Trellis". (INV-020)
2. Create a traveler account (`Create an account` → sign-up, no agency field).
3. Land on `/view` **signed in** → the **navigation panel** is now visible with:
   Home (current), My Trips (link), Plan a trip / Discover / Group trips (each
   marked "Soon", not clickable), and an Account area with **Sign out**.
4. Click **My Trips** in the panel → `/view/my-trips`, panel persists, "My Trips"
   is marked current, empty-state shown.
5. Click **Home** in the panel → back to `/view`, "Home" marked current.
6. Confirm the coming-soon items render no link (no navigation on click).
7. Narrow the viewport to ~390px → the panel collapses to a toggle; open it via the
   hamburger; **no horizontal scroll** anywhere.
8. Click **Sign out** in the panel → returned to the anonymous `/view` welcome.
9. Open an agency `/view/[token]` share link **signed out** → white-label proposal,
   **NO nav panel**, agent brand only (unchanged).

## Success signals

- Panel present on both signed-in pages, absent on both anonymous surfaces.
- Coming-soon sections are non-links (no dead ends).
- Zero "TripForge"/"Trellis" on the traveler surface (body + title).
- No horizontal scroll at mobile width; nav reachable via toggle.
- No agency/workspace affordance anywhere on the traveler surface.
