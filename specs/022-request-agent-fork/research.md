# Phase 0 Research: Request-an-agent fork

No `NEEDS CLARIFICATION` markers remained in the Technical Context — this feature
reuses the repo's established stack end-to-end. Findings below consolidate the
codebase investigation that grounds the plan's decisions.

## D1 — What "Book it myself" actually does

**Decision**: A confirmation-only stub. No DB record, no server call — a client
component shows an acknowledgement message when this choice is selected.

**Rationale**: `packages/api/src/routers/booking.ts` exposes exactly two
procedures (`quote`, `book`), both `agentProcedure`-gated — there is no
anonymous/public booking mutation anywhere in the codebase to link into. The
ticket's own wording concedes the ambiguity ("links into the existing booking
flow / or a request-quote") and separately requires "no full consumer auth."
Building a real anonymous checkout here would mean building actual self-serve
consumer booking, which the constitution's MVP Scope Discipline places at P2 —
a much larger scope than the ticket asks for or the operator's demo-drive
authorization covers (see plan.md's Constitution Check, MVP Scope Discipline
row). A stub keeps the fork honest: it shows the intended UX shape without
claiming a capability that doesn't exist.

**Alternatives considered**:
- Redirect to a "request a quote" form that also writes a `trip_handoff_request`
  row (reusing the same table, with a `mode` discriminator column) — rejected:
  conflates two different signals (a client wanting to book vs. a client
  wanting a human agent) into one table/inbox, and the ticket's acceptance
  criteria only requires the agent inbox for the request-AGENT path
  specifically ("a request appears in the agent's inbox" — singular). Keeping
  self-drive record-free is simpler and matches the ticket's narrower
  acceptance bar (YAGNI — don't add a `mode` column with only one real value).
- Building real anonymous checkout — rejected: out of scope (P2), would need
  consumer auth/payment infrastructure this ticket explicitly disclaims.

## D2 — Where the trip-request logic lives (package/file placement)

**Decision**: `packages/api/src/services/trip-handoffs.ts`, a new service
module directly in `packages/api/src/services/`, alongside `client-view.ts`,
`itineraries.ts`, and `booking.ts` — NOT inside `@tripforge/marketplace`.

**Rationale**: `@tripforge/marketplace` exists for the listing/license/resale
transaction family (`listings.ts`, `licensing.ts`, `white-label.ts`,
`vetting.ts`, `earnings.ts`, `group-departures.ts`) — all of it cooperates
inside marketplace transactions and the revenue-share ledger. A trip handoff
request never touches a listing, a license, or the ledger; it is a client-view/
workspace concern (an inbound lead on an itinerary), matching `client-view.ts`
(itinerary read-side, tenant-agnostic-by-token) and `itinerary-list.tsx`'s
workspace read side more closely than anything in `marketplace`.

**Alternatives considered**: put it in `@tripforge/marketplace` since it's
"marketplace-adjacent" per Constitution I framing — rejected: framing a
feature's STRATEGIC importance (feeds the marketplace) is not the same as it
being a marketplace TRANSACTION; forcing it into that package would import
vetting/licensing machinery a trip request never uses (Pre-Write Discipline:
no near-duplicate/no unjustified coupling).

## D3 — Tenant-scoping mechanism for the inbox

**Decision**: Plain `WHERE agency_id = ctx.session.agencyId` reads/writes, the
same discipline used by every other agent-scoped query in the codebase
(`group-travel.ts`'s `requireDb`/`actorOf`, `itineraries.ts`'s
`scopedWhere`). Accept is `UPDATE trip_handoff_request SET status = 'accepted'
WHERE id = $1 AND agency_id = $2` — a cross-tenant id affects zero rows → typed
`NOT_FOUND`; re-accepting an already-`accepted` row is idempotent (same WHERE
clause, `SET status = 'accepted'` on a row that's already `accepted` changes
nothing and still returns success).

**Rationale**: This is not a contended/racy resource like `group_departure`'s
`seats_remaining` — there's no capacity to conserve, no concurrent-decrement
race to resolve. A conditional UPDATE only needs to protect the tenant boundary
and idempotency, both of which the plain `WHERE agency_id = ? AND id = ?` form
already guarantees without a returning-row race check.

**Alternatives considered**: a status-machine guard (`WHERE status = 'new'` on
the accept UPDATE) that would make double-accept a no-op at the SQL level
rather than an idempotent overwrite — considered but rejected as unnecessary
complexity: both forms produce the identical observable outcome (`status =
'accepted'`, exactly one row affected or zero on cross-tenant/missing id), so
the simpler form is preferred (constitution simplicity default).

## D4 — Whose agency a request routes to (ownership vs. authorship)

**Decision**: `trip_handoff_request.agency_id` is resolved from the itinerary's
**current** owning agency at submission time, read directly off the
itinerary row being viewed (the same itinerary row `client-view.ts` already
resolves by token) — never off any `original_author`/provenance field.

**Rationale**: Spec FR-011 requires this explicitly. A licensed/white-labeled
copy has its OWN itinerary row with its OWN `agency_id` (the reseller) — this
is exactly how `group_departure`'s independent-seat-pool copies and
`itinerary_share_link` already work for resold copies elsewhere in the
codebase (INV-002 provenance vs. ownership separation: provenance travels with
the document, but who currently owns/serves it is a separate, current fact).
Routing to the CURRENT owner is what makes "vetted agents list, other agents
license/resell" (Constitution I) actually work for the request-agent flow: a
traveler viewing a reseller's white-labeled copy should reach the reseller,
not the original author who no longer has any relationship with that
traveler.

**Alternatives considered**: route to the original author (via
`provenance.originalAuthorAgencyId`) — rejected: would leak a request to an
agency with no current relationship to the traveler viewing that specific
(possibly resold) copy, and contradicts FR-011 and the ownership-not-authorship
precedent set elsewhere in the codebase.

## D5 — Naming: avoiding collision with the existing `TripRequest` type

**Decision**: the new entity is named `TripHandoffRequest` in code (table
`trip_handoff_request`, service `trip-handoffs.ts`, router `trip-handoffs.ts`,
mutation `requestHandoff`). The spec's plain-English "trip request" language is
kept as-is in spec.md and in user-facing UI copy (the inbox is still labeled
"Trip requests" for the agent) — only the code-level identifiers are
disambiguated.

**Rationale**: a codebase-wide grep for `tripRequest`/`TripRequest` before
writing any code (Pre-Write Discipline) found a large, pervasive, and entirely
unrelated existing usage: `itinerary.trip_request` (a jsonb column,
`packages/db/src/schema-itinerary.ts:25`) stores the planner's SEARCH CRITERIA
(destination, check-in/out, party) for supply re-derivation, threaded through
`itineraries.ts`, `planner.ts`, `booking/*.ts`, and `planner.tsx`. Reusing the
same name for "a client's request that an agent take over" would create two
unrelated domain concepts sharing one name across the same codebase — exactly
the kind of confusion the reuse-scan step exists to catch before it's baked
into table/type names that are expensive to rename later.

**Alternatives considered**: name the new table `trip_request` anyway and rely
on qualified imports/comments to disambiguate — rejected: the existing
`TripRequest` type is imported unqualified (`import type { TripRequest } from
...`) in a dozen+ call sites; a same-named second type would either collide at
import time or require awkward aliasing everywhere it's used, for no benefit
over picking a distinct name up front.
