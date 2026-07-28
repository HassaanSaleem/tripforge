# Contract: Consumer Discover → Consumer Planner handoff

**Feature**: 039-consumer-whats-hot-feed

This is a **client-side navigation contract** (a query param on a page URL), not a network/tRPC contract — no server procedure is added or changed. It mirrors the existing agent-side `?destination=` handoff (spec 023 `contracts/discover-to-builder-handoff.md`), retargeted at the consumer planner.

## Producer — consumer Discover feed card

Each `DiscoverFeedCard` rendered on `/view/discover` emits a "Plan this" link:

```
href = "/view/plan?destination=" + encodeURIComponent(item.planDestination)
```

- `planPath` is `"/view/plan"` for the consumer surface (`"/workspace"` for the workspace surface — same component, different prop).
- `item.planDestination` is the exact `"${city}, ${country}"` string from the curated feed (e.g. `"Lisbon, Portugal"`).

## Consumer — `/view/plan` page

`apps/web/app/(client-view)/view/plan/page.tsx`:

1. Reads `searchParams.destination`.
2. `initialDestination = typeof destination === "string" && destination.trim() ? destination : undefined`
   (an array value or empty string → `undefined`, i.e. no seed).
3. Passes `initialDestination` to `<ConsumerPlanner … />`.

## Consumer — `ConsumerPlanner` component

- When `initialDestination` is present, the chat composer (`draftText`) initializes to `Plan a trip to ${initialDestination}`.
- The seed is **only** pre-filled text. It:
  - MUST NOT auto-submit the message.
  - MUST NOT skip the "Build my trip" confirm step or any interpret/needs-info step.
  - MUST NOT bypass any validation.
- When `initialDestination` is absent/empty, the composer starts empty — **byte-identical** to opening `/view/plan` directly today (FR-006).

## Guarantees

| Case | Behavior |
|------|----------|
| Signed-in traveler, valid seed | Planner opens, composer pre-filled, one Send proceeds to interpret → build. |
| Signed-in traveler, no/empty seed | Today's empty-composer planner (unchanged). |
| Signed-in traveler, unrecognized destination text (hand-edited URL) | Composer pre-filled with that text; the existing interpret/needs-info flow handles it gracefully (no crash). |
| Anonymous visitor to `/view/discover` or `/view/plan` | Redirected to `/view/sign-in` (existing gate); no feed/planner rendered, no seed leak. |

## Non-goals

- No server-side persistence of the seed.
- No change to `clientView.planInterpret` / `planDraft` / `requestPlan` procedure signatures.
- No new PMF/analytics event (the existing planner-flow events remain the measurement surface).
