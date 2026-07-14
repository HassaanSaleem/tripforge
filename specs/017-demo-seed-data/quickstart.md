# Quickstart: Validating Demo Seed Data

## Prerequisites

- Docker + Docker Compose
- A clean checkout of this branch (no host `node_modules` leaking in — the
  repo's `.dockerignore` already guarantees this)

## 1. Boot from a completely empty database

```bash
docker compose down -v
docker compose up --build --wait
```

**Expected**: all services (`postgres`, `mailpit`, `migrate`, `web`) reach a
healthy/exited-ok state; `docker compose logs migrate` shows the seed
script's per-agency/per-itinerary/per-listing/per-license/per-rating lines
(see contracts/seed-script.md's Output contract) ending in a `done — N
agencies, ...` summary line with N ≥ 4, 6+ itineraries, 3+ listings, 3+
licenses, 3+ ratings.

## 2. Sign in with a documented demo login

Open `http://localhost:3000/sign-in` and sign in with one of the credentials
printed by the seed step (copied into the PR body). Confirm:

- The workspace loads with existing seeded trips visible (not an empty
  state).
- At least one trip shows a media asset in its gallery.
- Each trip shows a per-category, per-day budget breakdown.

## 3. Browse the marketplace

Open the marketplace page. Confirm:

- At least 3 active listings are visible, from at least 2 different agencies.
- Sellers show a verified/vetted badge.
- At least one listing shows 3+ ratings with star values and comments.

## 4. Confirm seller earnings

Sign in as the seller agency that owns a licensed listing (from the PR
body's credential list). Open the seller-earnings surface. Confirm a
non-zero earnings amount is shown, consistent with the license's recorded
revenue split.

## 5. Confirm curated content for a hero city

In the workspace, start a new AI-planner draft for one of the four curated
cities (Lisbon, Tokyo, Marrakech, Reykjavik). Confirm the resulting itinerary
shows realistic, distinct hotel/activity/transfer names (not the generic
`"<City> Grand"`/`"<City> Boutique"` placeholder pattern).

## 6. Confirm re-run idempotency

```bash
docker compose up --build --wait
```

(no `-v` this time — same database volume). Confirm `docker compose logs
migrate` shows the seed step's "already ..., skipping" lines for every
agency/user/listing/license, and the final summary line's counts are
UNCHANGED from step 1 (no duplication).

## 7. Confirm non-curated destinations are unaffected

Start a new draft for a destination NOT in the curated set (e.g. "Paris").
Confirm the itinerary still shows today's generic procedural placeholder
names — proving no regression for destinations outside the hero set.
