# Quickstart: Consumer "What's Hot" Discovery Feed

**Feature**: 039-consumer-whats-hot-feed

## What it does

Turns the traveler surface's `/view/discover` "coming soon" placeholder into a real, image-forward "What's Hot" feed and makes the consumer AI planner accept a pre-seeded destination, so a signed-in traveler can go Discover → pick a place → "Plan this" → build a live-priced trip in one flow.

## Manual verification (against the built compose stack)

```bash
docker compose down -v && docker compose up --build --wait
```

1. Open `http://localhost:3000/view/discover` **signed out** → you are redirected to `/view/sign-in`.
2. Sign up / sign in as a traveler (no agency), then open **Discover** from the left nav (it is now a live link, not a "Soon" signpost).
3. The page shows a destination picker (Lisbon / Tokyo / Marrakech / Reykjavik) and a grid of ≥3 cards for the selected destination — each with a real photo, an attribution line, a "what's happening" blurb, and a hotel highlight.
4. Switch destinations → the grid replaces with the new destination's own cards (no stale items).
5. Tap **"Plan this"** on any card → you land on `/view/plan` and the chat composer is pre-filled with `Plan a trip to <that destination>`.
6. Press **Send** (no retyping) → the planner interprets, you confirm "Build my trip", and live-priced options appear; the request-an-agent / self-book fork is available.
7. Inspect the Discover page source: no "TripForge"/"Trellis" wordmark in the body or the tab title (INV-020).

## Automated verification

```bash
# in the built image (per repo recipe)
pnpm test          # L1/L2 — shared card planPath handoff + fallback; consumer feed = curated set
pnpm run lint
npx playwright test consumer-discover-journey   # e2e: Discover → pick → feed → Plan this → planner seeded; signed-out redirect; brand-neutral
npx playwright test discover-journey            # e2e: workspace Discover unchanged (regression guard for the extraction)
```

## Key files

- `apps/web/app/components/discover-feed-view.tsx`, `discover-feed-card.tsx` — extracted shared feed UI (`planPath` prop).
- `apps/web/app/(client-view)/view/discover/page.tsx` — new consumer Discover page (signed-in, brand-neutral).
- `apps/web/app/(client-view)/view/plan/page.tsx` + `consumer-planner.tsx` — seed destination pre-fill.
- `apps/web/lib/client-nav.ts` — `discover` nav entry flipped to live.
- `apps/web/app/(workspace)/discover/page.tsx` — repointed to the shared view (`planPath="/workspace"`), behavior preserved.
