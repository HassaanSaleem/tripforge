# Phase 0 Research: Group travel

No `NEEDS CLARIFICATION` markers remained in the Technical Context — this feature reuses the
repo's established stack end-to-end. Findings below consolidate the codebase investigation
that grounds the plan's decisions.

## D1 — Capacity conservation mechanism

**Decision**: A single atomic conditional `UPDATE group_departure SET seats_remaining =
seats_remaining - 1 WHERE id = $1 AND status = 'active' AND seats_remaining > 0 RETURNING
seats_remaining, price_per_seat_minor, currency`, run at the start of the join transaction,
followed by the `group_departure_seat` insert in the SAME transaction.

**Rationale**: The existing booking claim gate (`packages/api/src/services/booking/book.ts`
Phase 2, `packages/api/src/services/booking/claims.ts`) uses id-ordered `SELECT ... FOR
UPDATE` locking because it claims MANY `booking_quote` rows in one request and must avoid
lock-order deadlocks across concurrent multi-row claims. A group-trip join only ever touches
ONE `group_departure` row per call — there is no multi-row lock-order hazard, so the simpler
single-row conditional `UPDATE ... WHERE ... RETURNING` is suffient and is the same "belt-
and-braces" idiom already used inside the booking flow's own claim UPDATE (`book.ts`,
`.where(and(inArray(...), isNull(consumedAt), gt(expiresAt, claimNow)))`, i.e. the update's
WHERE clause re-asserts the invariant instead of trusting an earlier in-memory check). A row
returned = won the seat; zero rows returned = sold out (or inactive/not-found, disambiguated
by a follow-up existence check outside the transaction only for error-message purposes — the
capacity decision itself never depends on that follow-up read).

**Alternatives considered**:
- `SELECT ... FOR UPDATE` then application-side count-and-compare then `INSERT` — rejected:
  more code, an extra round trip, and no safety advantage over the conditional UPDATE (which
  is itself atomic and race-free under Postgres MVCC + row locking).
- Reusing `lockQuoteRowsInClaimOrder` verbatim — rejected: that helper's contract is
  multi-row id-ordered locking; forcing a single-row call through it adds an unnecessary
  `ORDER BY ... FOR UPDATE` indirection for no benefit and couples group-travel to a booking-
  specific helper whose docstring is about a different invariant (Pre-Write Discipline: don't
  reuse a near-fit when a smaller, correct primitive already exists in the same file's
  neighboring pattern).
- Postgres advisory locks — rejected: no existing precedent in the codebase, and the
  conditional-UPDATE approach is already proven (booking flow, marketplace listing's partial
  unique index) — introducing a new locking primitive class would be complexity without
  justification (constitution simplicity default).

## D2 — Where group-travel logic lives (package placement)

**Decision**: New module inside the EXISTING `@tripforge/marketplace` package
(`group-departures.ts`), not a new package.

**Rationale**: A group departure is listable and licensable through the unchanged
`marketplace_listing`/`marketplace_license`/`revenue_share_ledger` mechanism (spec FR-009) —
it is a marketplace sub-concern, not an independent domain. `packages/marketplace/src/
licensing.ts` already needs one additive extension point (seed the reseller's seat pool
inside the existing transaction), which is far more natural as a same-package import than a
cross-package call. This mirrors how `earnings.ts`, `vetting.ts`, and `white-label.ts` all
live together in one package because they cooperate inside the same transactions.

**Alternatives considered**: a new `packages/group-travel` package — rejected: no boundary
in the codebase separates "marketplace" from "group departures" (the ticket itself describes
group travel as "a distinct marketplace/trade product on TOP OF the existing single-itinerary
marketplace", i.e. an extension, not a sibling domain); a new package would duplicate the
vetting/split/white-label imports for no isolation benefit (extraction threshold in
`.claude/skills/typescript-clean-architecture/SKILL.md` not met).

## D3 — Revenue-share scope on white-label

**Decision**: Reuse the EXISTING two-way `splitTakeRate` split (platform take + seller
credit) computed on the LICENSE transaction exactly as spec 006 already ships. No new
per-seat-sale split back to the original poster.

**Rationale**: `OPERATOR-DESK.md`'s open `RESALE-SHARE-SEMANTICS` row is UNRESOLVED and asks
this exact question ("must the resale split pay the original seller's declared revenue share
in money") for the general marketplace resale case. Inventing a NEW three-way split
specifically for group-travel seat sales would silently answer that question in a new code
path without operator ratification — DIRECTIVE's ALWAYS-HALT list includes "changes to
revenue-share ... semantics." Reusing the existing, already-ratified two-way split for the
LICENSE transaction (which is unchanged marketplace behavior, already shipped and covered by
`l3-marketplace.test.ts`) stays inside ratified semantics.

**Alternatives considered**: three-way split (platform + original poster + reseller) on every
seat the reseller sells — rejected per DIRECTIVE ALWAYS-HALT (see above); documented instead
as `D-0021.b` in spec.md's "Decisions surfaced for operator review", coupled to the existing
open desk row.

## D4 — Capacity pool model on white-label (shared vs. scoped-per-offer)

**Decision**: Scoped per-offer — the reseller's white-labeled group departure gets its OWN
independent `seatsRemaining`, seeded at the ORIGINAL's `capacity` (not its current
`seatsRemaining`) at license time.

**Rationale**: Ticket explicitly offers this as a choice ("pick the simpler correct model").
A shared pool would require the license transaction to decide how to SPLIT capacity between
seller and reseller (an unstated business rule) and would need cross-tenant contention on the
SAME `group_departure` row from two different tenants' join transactions — a new invariant
class not implied by anything else in the codebase (every other tenant-scoped write path
touches only its own tenant's rows). Scoped-per-offer requires zero new invariant: the
license transaction does exactly what it already does for the itinerary copy (produce an
independent row the reseller now owns and can evolve independently), applied one level deeper
to the group-departure metadata.

**Alternatives considered**: shared pool (one capacity counter across original + all
white-label copies) — rejected: requires an unstated capacity-split business rule and a new
cross-tenant row-contention pattern; not the simpler design the ticket asks to prefer.

## D5 — Join initiator scope (agent-only vs. public self-serve)

**Decision**: v0 ships agent-initiated joins only (an agent joins a seat on behalf of a named
client), reusing the existing `agentProcedure` tenant-scoped surface. No new public/anonymous
route.

**Rationale**: The constitution's Non-Goals section explicitly excludes "a generic consumer
trip-planning play" and scopes the self-serve consumer surface to P2 (`MVP Scope Discipline`).
A public, anonymous "browse group trips and join without an agent" page is a materially
different surface — real discovery/purchase without an agent intermediary — from the
already-shipped client-view mechanism (spec 010/009b), which is always agent-initiated
(the agent shares a link; the traveler views/approves/pays a SPECIFIC trip the agent already
built for them). Keeping joins agent-initiated stays inside that same, already-ratified
P0 pattern.

**Alternatives considered**: public self-serve join — rejected at v0, documented as
`D-0021.a` in spec.md for explicit operator ratification per DIRECTIVE #3 (non-blocking —
proceeds with the conservative default, exactly like spec 006's D-0006 pattern).

## D6 — Existing patterns confirmed for reuse (no further research needed)

- Tenant scoping: `agentProcedure` (session-derived `agencyId`, INV-004) —
  `packages/api/src/trpc.ts:33-50`.
- Money shape: `moneyMinor()`/`agencyFk()`/`agencyRef()` column helpers —
  `packages/db/src/schema-columns.ts`.
- Vetting/verified-seller badge: `isVetted`, `vettedAgencyIds` — `packages/marketplace/src/vetting.ts`
  (read-only reuse, no changes needed).
- White-label transform: `whiteLabelCopy` — `packages/marketplace/src/white-label.ts` (called
  unchanged from `licensing.ts`; group-departure copying is a NEW, separate step alongside it,
  not a modification to it).
- Split math: `splitTakeRate` — `packages/domain/src/money.ts:183` (called unchanged).
- Typed-outcome-as-value convention (never throw for business refusals) —
  `packages/marketplace/src/licensing.ts` (`LicenseListingOutcome` union).
- PMF event recording inside the caller's transaction — `packages/db/src/pmf-events.ts`
  (`recordPmfEvent`), additive vocabulary extension.
