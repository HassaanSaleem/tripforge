# Research: Consumer "What's Hot" Discovery Feed

**Feature**: 039-consumer-whats-hot-feed | **Date**: 2026-07-27

## Decision 1 — Reuse the existing curated feed data unchanged

**Decision**: The consumer feed reads the same `apps/web/lib/discover-feed.ts` module (`WHATS_HOT_FEED`, `feedItemsForDestination`, `DiscoverFeedItem`) the agent workspace uses. No new content, no backend fetch, no new data module.

**Rationale**: The data is non-tenant, non-money, hand-curated content with already-vetted licensed imagery/attribution (spec 023 research). There is nothing traveler-specific about which places are "hot" — the same curated set serves both surfaces. Duplicating it would create a drift/attribution-integrity risk for zero benefit.

**Alternatives rejected**: A separate consumer feed data module (needless duplication, drift risk). A backend/tRPC-driven trending feed (out of scope this cycle; the agent side is static too — a later concern).

## Decision 2 — Extract the presentational components to a neutral module, generalized by `planPath`

**Decision**: Move `feed-item-card.tsx` and `discover-feed-view.tsx` out of `apps/web/app/(workspace)/discover/` into the neutral `apps/web/app/components/` directory as `discover-feed-card.tsx` and `discover-feed-view.tsx`, and add a required `planPath` prop threaded to the card so "Plan this" links to `${planPath}?destination=…`. The workspace Discover page passes `planPath="/workspace"`; the consumer page passes `planPath="/view/plan"`.

**Rationale**: INV-024 forbids workspace UI leaking into the client experience — importing `(workspace)/discover/*` into `(client-view)/*` is exactly that. `apps/web/app/components/` already hosts user-type-agnostic shared components (`marketing-nav.tsx`, `media-thumb-image.tsx`), so it is the boundary-correct home. Generalizing the existing card (rather than copying it) is the Pre-Write "generalize/extract" decision and avoids a near-duplicate export. The components are pure presentation (picker + image cards + a `Link`) with no workspace affordance or branding, so they are safe to share.

**Alternatives rejected**:
- *Import the workspace components directly into the consumer page* — violates INV-024 (workspace-grouped UI in the client surface); also couples the two route groups.
- *Copy the card/view into the consumer surface* — near-duplicate export, drift risk, review-blocking under Pre-Write discipline.
- *A `surface: "agent"|"consumer"` flag on a shared component* — INV-024 says surfaces are separated by structure, not toggled by flags; `planPath` is a plain presentational parameter (a link target), not a surface toggle, so it is acceptable — but the shell/guard/branding differences stay in each page, never inside the shared component.

**Preservation constraint**: The moved components keep identical `data-testid` values (`discover-destination-picker`, `discover-destination-option`, `discover-feed-grid`, `discover-feed-card`, `discover-hotel-highlight`, `discover-plan-this`, `discover-card-image-fallback`) and class names so the existing `tests/e2e/discover-journey.spec.ts` (workspace) stays green.

## Decision 3 — Deliver the destination seed to the chat-first consumer planner as a pre-filled first message

**Decision**: `/view/plan/page.tsx` reads `?destination=` (same shape as the workspace `?destination=` param, spec 023) and passes `initialDestination` to `ConsumerPlanner`. When present, the planner initializes its chat composer text with `Plan a trip to ${destination}` (not auto-submitted). Absent/empty → today's empty composer.

**Rationale**: The consumer planner is chat-first (spec 038) with **no** destination form field — the workspace planner's approach (switch to a pre-seeded form field) does not apply. The chat-first analog is to pre-fill the composer so the traveler proceeds with one Send, satisfying "opens pre-seeded, no typing required to proceed" (FR-006, US2 AS1/AS2) while leaving the LLM interpret/confirm flow and all validation intact (FR-007). Not auto-submitting keeps the behavior deterministic and testable (no surprise LLM call on navigation) and matches the workspace precedent of pre-filling rather than auto-generating.

**Alternatives rejected**: Auto-submitting the seed (surprising; fires an interpret call on navigation; harder to test deterministically). A hidden destination field (the planner has no form; would be dead UI). Threading the destination through a new procedure argument (no server change needed — the seed is purely client-side composer text).

## Decision 4 — Signed-in-gated consumer Discover, mirroring `/view/plan`

**Decision**: `/view/discover/page.tsx` becomes a signed-in-only server page: `getSessionContext(headers)` → redirect to `/view/sign-in` when anonymous, else render inside `ClientSurfaceShell` (`activeNav="discover"`, brand-neutral `data-plain`). It replaces the `DiscoveryComing` placeholder body.

**Rationale**: The consumer surface's Discover lives inside the signed-in traveler nav (`client-nav.ts`), exactly like `/view/plan`. Matching that gate keeps the surface coherent and avoids introducing a new anonymous public surface this cycle (out of scope, Assumptions). As a static route segment, `/view/discover` already resolves ahead of the dynamic `/view/[token]` catch-all (the reason `DiscoveryComing` existed — FRICTION-7), so the redirect can never fall through to the dead-token message.

**Alternatives rejected**: An anonymous public Discover (larger scope; a new brand-neutral anonymous surface with its own guard reasoning — deferred). Leaving Discover as a "coming soon" placeholder (the whole point of the ticket is to make it real).

## Decision 5 — Flip the nav entry, not the shell

**Decision**: In `apps/web/lib/client-nav.ts`, change the `discover` destination from `{ href: null, status: "soon" }` to `{ href: "/view/discover", status: "live" }`. No other file changes for nav — the sidebar and active marker both read this single source of truth (documented in the file itself).

**Rationale**: `client-nav.ts` is the documented single source of truth; flipping a "soon" section to "live" is a one-line change by design once its route lands. `groupTrips` stays "soon" (its ticket is separate).
