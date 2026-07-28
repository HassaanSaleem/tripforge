# Quickstart — Manual verification: Two-sided landing pages

Prereq: the built compose stack is up (`docker compose down -v && docker compose up --build --wait`) serving the app at `http://localhost:3000`.

## 1. Global landing is a two-sided overview (US1)
1. Open `http://localhost:3000/`.
2. Confirm a heading "TripForge" is visible.
3. Confirm the page presents BOTH a traveler story and an agent story as first-class, with a visible fork/split ("For travelers" and "For agents").
4. Confirm a link whose text matches "Agency workspace" is present (smoke assertion).
5. Resize the window to 375px wide → confirm there is NO horizontal scrollbar.

## 2. Traveler fork + page (US2)
1. From `/`, click the "For travelers" fork → lands on `/for-travelers`.
2. Confirm the consumer story renders (plan a trip with AI; self-drive or request an agent).
3. Confirm a video player is visible with a poster image and playback controls; confirm it is NOT already playing (no autoplay) and produces no sound until you press play.
4. Press play → the traveler demo (`/demos/tripforge-clients.mp4`) plays.
5. Confirm the primary CTA links to traveler sign-in (`/view/sign-in`).
6. Resize to 375px wide → no horizontal scroll.

## 3. Agent fork + page (US3)
1. From `/`, click the "For agents" fork → lands on `/for-agents`.
2. Confirm the professional story renders (budget-aware AI builder; net-rate quote-then-book with markup; marketplace).
3. Confirm a video player is visible with a poster and controls; not autoplaying; silent until pressed.
4. Press play → the agent demo (`/demos/tripforge-agents.mp4`) plays.
5. Confirm the primary CTA links to agent sign-up (`/sign-up`).
6. Resize to 375px wide → no horizontal scroll.

## 4. Shared nav round-trip (US1/US2/US3, SC-002)
1. From `/for-travelers`, use the nav to reach `/for-agents`, then Home, then back — every hop works.
2. Confirm both sign-in links (traveler + agent) are reachable from the nav on each page.

## 5. Automated gates
- `pnpm test` (in the built image) — full suite green, including the preserved `smoke.spec.ts`.
- `pnpm run lint` — clean.
- e2e: `npx playwright test tests/e2e/landing-pages-journey.spec.ts` and `tests/e2e/smoke.spec.ts` — green.

## Expected outcome
All three routes render (HTTP 200), nav has zero dead ends, both demos are user-operable and never autoplay with sound, no page horizontally scrolls at 375px, and the home smoke assertions are unchanged.
