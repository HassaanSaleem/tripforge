# Phase 0 Research: Traveler Trip History — "My Trips"

No `[NEEDS CLARIFICATION]` markers were left in spec.md — the Technical Context in plan.md has no
unresolved unknowns. This file records the design decisions the ticket itself flagged as open,
resolved by reading the existing codebase rather than by guesswork.

## D1: What is the association trigger?

**Decision**: "Attach on view" — the first time a signed-in visitor's browser successfully renders
`/view/<token>` (the identity-resolution branch that already runs for spec 030's pre-fill), a
`client_trip_link` row is upserted for `(userId, itineraryId)`.

**Rationale**: The ticket names three candidate sources: group-travel seat joins, trip-handoff
submissions, and share-link views.
- Group-travel seats (`group_departure_seat`) are joined via `joinedByAgencyId` — an AGENCY acts on
  behalf of travelers (`packages/db/src/schema-group-travel.ts:52-58`); there is no
  traveler-authenticated event in v0 to attach to. Confirmed by reading `group-travel.ts` router:
  the join procedure is agent-gated, not traveler-gated.
- Trip-handoff requests (`trip_handoff_request`) are always submitted from the SAME `/view/<token>`
  page a visitor already opened (`trip-fork.tsx`'s handoff form lives on that page) — so "attach on
  view" already captures every handoff-adjacent trip; a second linking path at submission time
  would be a redundant write to the same row, not new coverage.
- Share-link views are the only path that is (a) already an authenticated request when the visitor
  is signed in (spec 030's `resolveIdentity` already derives `ctx.session.userId` there) and (b)
  covers 100% of the traffic the other two paths are subsets of.

**Alternatives considered**: A dedicated "save this trip" button was rejected — it adds a second
user action for zero additional coverage (a visitor who bothers to click it has, by definition,
already viewed the trip) and contradicts spec.md's FR-002 ("appears if and only if...opened").

## D2: Where does the trigger live — client-side or server-side?

**Decision**: Server-side, inside the existing `/view/[token]/page.tsx` server component, as a
second call alongside `resolveIdentity()`.

**Rationale**: spec 030 already resolves the signed-in identity server-side
(`getAuthenticatedCaller(headers)` → `clientView.me()`) before the page renders. Adding
`clientView.attachTrip({token})` right after a successful `me()` call reuses the SAME caller/
session derivation with no new client-side JS, no extra round-trip after hydration, and is
naturally idempotent to re-renders (React's `cache()` de-dupes within one request; the DB write
itself is `onConflictDoNothing`, so repeat requests across visits are also safe).

**Alternatives considered**: A client-side `useEffect` firing a mutation after mount — rejected as
strictly worse: extra client JS, a visible delay before the row exists, and no benefit over the
already-available server-side session.

## D3: How does `myTrips` compute each trip's client-facing summary?

**Decision**: Reuse `resolveShareLink(container, token)` unmodified, once per linked token. The
`client_trip_link` table stores `(userId, itineraryId)`; a join to `itinerary_share_link` (already
`UNIQUE(itinerary_id)`) recovers each linked itinerary's token, and `resolveShareLink` produces the
exact same `ClientItineraryView` (title, agencyName, currency, totalSellMinor, booked status per
item) the trip's own page already renders.

**Rationale**: `toClientItineraryView` (the INV-020 allowlist boundary) already exists and is
already proven by spec 010/013/030's test suites. Re-deriving a second, parallel "summary"
projection would duplicate that trust-boundary logic — exactly what Pre-Write Discipline (extend,
don't duplicate) forbids. At v0 scale (one traveler's own visit count — expected single digits to
low tens), N sequential lookups is the simplest correct design; pagination/batching is deferred
until evidence of scale (YAGNI, constitution "Simplicity default").

**Alternatives considered**: A dedicated SQL view/join across `client_trip_link` +
`booking_component` computing totals directly in the DB — rejected: it would duplicate
`toClientItineraryView`'s booked-vs-estimated pricing rule (spec 013 FR-001) in a second place,
risking drift between what "My Trips" shows and what the trip page itself shows for the exact same
trip.

## D4: Table placement

**Decision**: `client_trip_link` lives in `packages/db/src/schema-itinerary.ts`, not
`schema-auth.ts`.

**Rationale**: `schema-itinerary.ts` already hosts `itineraryShareLink` and `mediaAsset` — both
itinerary-adjacent bolt-on tables that reference `itinerary.id` and are NOT part of Better Auth's
core user/session/org tables. `client_trip_link` is the same shape: a record ABOUT an itinerary (who
has viewed it), not a change to how a user/session itself is represented. `schema-auth.ts` remains
untouched, matching spec 030's precedent of never modifying `user`/`session`/`member`.
