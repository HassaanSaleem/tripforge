# Research: Traveler Home — the post-auth landing at `/view`

## D1 — Anonymous `/view`: redirect vs. render a welcome

**Decision**: Render a **brand-neutral welcome** (sign-in / create-account CTAs) for an anonymous
visitor to `/view`; do **not** redirect to `/view/sign-in`.

**Why**: Two existing invariant e2e specs navigate to `/view` **anonymously** and assert INV-020 /
INV-024 negatives directly on that page:
- `tests/e2e/smoke.spec.ts` — heading matches `/Your trip/i`, no `TripForge`/`Trellis` text.
- `tests/e2e/trust-boundary.spec.ts` — same heading, no platform text, tab title not
  `TripForge|Trellis`, no "Agency workspace" link, no "agency membership" prompt.

A redirect to `/view/sign-in` would move the anonymous landing off `/view`, so the heading
assertion (`/Your trip/i`) would break and those invariant guards would have to be edited — an
avoidable weakening of pinned trust-boundary tests. Rendering a welcome that keeps a `Your trip…`
heading preserves every assertion **and** upgrades the current dead placeholder into a real entry
(sign in / create an account). The welcome computes **no** trip data, so FR-005 holds.

**Alternative rejected**: redirect anonymous `/view` → `/view/sign-in`. Cleaner-looking but forces
edits to two invariant specs and provides no product benefit over an in-place welcome.

## D2 — Greeting identity source

**Decision**: Reuse the existing `clientView.me` procedure (returns `TravelerIdentity {name,
email}`) for the greeting; do **not** add a new auth helper or procedure.

**Why**: `clientView.me` is already a `protectedProcedure` (any authenticated user) used by the
shared-trip fork's account strip. It gives exactly the display name the home needs. Adding a
`getTravelerIdentity` server helper or a new procedure would duplicate an existing capability and
widen the trust surface for no gain (INV-023 stays untouched if we add nothing). `me()` may return
`null` (defense in depth) → greet generically.

**Alternative rejected**: a new `getTravelerIdentity(headers)` in `apps/web/lib/auth.ts`. Rejected
as a near-duplicate of an existing capability (Pre-Write: reuse over new).

## D3 — Trip-count / My Trips affordance

**Decision**: Reuse `clientView.myTrips` (already batched O(1) per lookup kind, perf-031) to show a
count on the "My Trips" affordance, and link to `/view/my-trips`. The home does **not** re-render
the list (that's the My Trips page's job) — it only counts + links.

**Why**: Reuse the single source of truth for "what a traveler may see about their trips"
(`resolveShareLink` projection, batched). Rendering only a count keeps the home light and avoids
duplicating the list UI/empty-state (owned by spec 031 / `my-trips-empty-state-nav`).

## D4 — "Plan a trip" / "Discover" — coming-soon vs. wire to something

**Decision**: Signpost both as **coming soon** (non-interactive cards), not links.

**Why**: No self-serve consumer planner exists (`planner.tsx` lives only in `(workspace)`, which is
INV-024-gated away from travelers), and the "What's Hot" feed (goal-consumer-whats-hot) is not
built on the consumer surface. Wiring "Plan a trip" to the agent planner would violate INV-024;
linking to nothing would dead-end. Honest coming-soon matches the shipped precedent (demo-02's
"honest Discover coming-soon" on the agent shell) and the standing consumer-copy-honesty concern.
When goal-consumer-planner / goal-consumer-whats-hot land, they convert these signposts to real
links.

## D5 — Sign-out control

**Decision**: A small **new** client component in the `(client-view)` group that calls the existing
`signOut()` (auth-client) and returns the visitor to `/view` (which then renders the anonymous
welcome).

**Why (Pre-Write: new, justified)**:
- `apps/web/app/(workspace)/workspace/sign-out-button.tsx` hardcodes `router.push("/sign-in")` (the
  **agent** sign-in) and lives in the workspace route group — reusing it would land travelers on
  the agent surface and cross a route-group boundary.
- `trip-fork.tsx`'s sign-out is an **inline** handler inside the fork panel, not an extracted
  reusable component.
So the two existing sign-outs are not directly reusable for a brand-neutral traveler home that must
return to `/view`. The new control is ~15 lines mirroring the established `signOut` + `router`
pattern. (A future quality-sweep may converge the three sign-outs onto one `redirectTo`-parametrized
component; deliberately out of scope here to keep blast radius on the agent/fork paths at zero.)

## D6 — Route resolution: does `/view` collide with `/view/[token]`?

**Decision**: No change needed. `/view` is the route-group index; `/view/[token]` is the dynamic
child. The index already renders today (placeholder); we only change what it renders based on
session. Sibling static segments (`/view/sign-in`, `/view/sign-up`, `/view/my-trips`) already win
over `[token]` (a uuid) — unchanged.

## D7 — Post-auth redirect target

**Decision**: Unchanged. `resolve-client-auth-return-to.ts` already returns `/view` when there is
no token; the forms `router.push(returnTo)`. Making `/view` a real home is exactly what that
existing redirect needs. No change to the resolver or the forms.
