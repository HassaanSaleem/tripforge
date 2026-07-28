# Research: Traveler Self-Drive Booking

Design decisions resolving the spec's approach against the existing codebase.

## D1 — Authorization model: token + signed-in session, not a workspace procedure

**Decision**: Mount `clientView.selfBook` as a `protectedProcedure` (any
authenticated user) taking the share `token`. The procedure resolves the owning
agency from the share link; possession of the token + a signed-in session is the
grant.

**Rationale**: The money path (`workspace.booking.*`) is on `agentProcedure`,
which rejects any session without an `agencyId` (INV-024). A traveler has none, so
they can *never* call the workspace path — that separation must be preserved. The
client-view surface already authorizes writes by link-bearer (`requestHandoff`)
and by session (`attachTrip`). A money path needs an accountable actor and a real
`user` row for the PMF `booking_confirmed.actor_user_id` FK, so we require a
signed-in session (unlike the anonymous read/handoff). This matches "a signed-in
traveler completes a real self-drive booking."

**Alternatives considered**: (a) Anonymous self-book via public procedure —
rejected: no real `actor_user_id` for the FK (would need a synthetic user or a
null actor and loses accountability on a money path). (b) Escalate the traveler
into `agentProcedure` — rejected: violates INV-024 outright.

## D2 — Tenant scope: widen the service param to `BookingActor`, don't fake an agent session

**Decision**: Introduce `BookingActor = Pick<AgentSessionContext, "agencyId" |
"userId">` and change `loadItinerary`, `quoteItinerary`, `bookItinerary` to accept
`BookingActor`. The agent router keeps passing `ctx.session` (an
`AgentSessionContext`, structurally a `BookingActor`). The self-book orchestrator
builds `{ agencyId: link.agencyId, userId: session.userId }`.

**Rationale**: The three functions read only `session.agencyId` (tenant scope,
logging) and `session.userId` (PMF actor, book only). Widening the parameter to
exactly those fields is a pure, behavior-preserving refactor — the agent path is
unchanged (its full session still satisfies the narrower type). It avoids
synthesizing a fake `AgentSessionContext` with a fictional `agencyRole` the
traveler doesn't hold (a latent footgun if anyone later adds a role check inside
the booking services).

**Alternatives considered**: Synthesize `{ ...session, agencyId: link.agencyId,
agencyRole: "member" }` — rejected (fictional role, smell). A full booking-scope
object refactor with more fields — rejected (YAGNI; only two fields are used).

## D3 — Markup: derived server-side from the itinerary's established pricing

**Decision**: The self-book derives `markupBps` server-side:
`SELECT markup_bps FROM booking_quote WHERE itinerary_id = ? ORDER BY created_at
DESC LIMIT 1`, falling back to the platform default `1500` when the itinerary has
never been quoted. The traveler never supplies markup.

**Rationale**: There is no per-agency stored markup policy (confirmed:
`agencyAdminProcedure` manages roster only; the only markup storage is
`booking_quote.markup_bps` written per quote). Honoring the agent's most-recent
chosen markup (when they've quoted) respects their pricing; the `1500` default is
the *same* default `quoteInputSchema` applies for the agent path, so an
un-quoted itinerary self-books at the identical markup the agent would get by
default. This **preserves** existing revenue semantics — it introduces no new
revenue rule, so it is not a revenue-share semantics change (not ALWAYS-HALT).
Letting the traveler pick markup would let them set it to 0 (pay net,
disintermediate the agent) — forbidden.

**Alternatives considered**: A fixed `1500` regardless of prior quotes — rejected
(ignores an agent who deliberately set a different markup). A new per-agency
markup column — rejected (schema change, out of scope, and a policy the operator
hasn't asked for).

**Note**: `booking_quote` has a `created_at` column (Drizzle default timestamp);
if not, order by `expires_at DESC` or `id DESC` as a stable proxy — verified at
implementation time.

## D4 — Flow: quote-then-book in one server call, partial-failure semantics preserved

**Decision**: `selfBookItinerary` runs `quoteItinerary(actor, { itineraryId,
markupBps })` to create holds for all bookable un-booked items, collects the
`held` quote-row ids, then `bookItinerary(actor, { itineraryId, quoteRowIds })`.
The traveler does not manage holds/expiry manually. Outcome maps the existing
`BookOutcome` (`confirmed | partially_confirmed | failed`) plus a
`nothing_to_book` case when there are no bookable un-booked items.

**Rationale**: Reuses the fully-tested money path verbatim, including
RESERVE-then-book, item-level exclusivity (FR-007 double-book protection), and
the all-fail/partial-fail conservation (FR-006, INV-011). "Nothing charged"
holds per leg (a failed leg is never charged) and for the whole (all-fail writes
nothing). We deliberately do **not** add cross-leg all-or-nothing atomicity —
that would be a different money semantics than the constitution's multi-supplier
partial-failure design (Principle V) and would require compensating already-booked
legs.

**Alternatives considered**: Persisting a hold and letting the traveler confirm
later (two round trips) — rejected for v0 (adds an expiry-management UX with no
clear benefit; a single "book my trip" call is simpler and the holds are
short-lived). All-or-nothing atomic self-book — rejected (semantics divergence).

## D5 — Redaction: a client-safe outcome shape

**Decision**: The procedure returns per-leg `{ itemId, title, kind,
outcome: "confirmed" | "failed", sellMinor?, currency?, reason? }` and a
`totalChargedMinor`. It never returns `netMinor`, `markupBps`, `merchantOfRecord`,
`supplierBookingId`, `offerId`, or `supplyRef`.

**Rationale**: Same trust boundary as `ClientItineraryView` (INV-020, spec 010) —
agent-confidential values must be structurally absent from a traveler payload.
The `title`/`kind` come from the itinerary document (already client-safe), the
`sellMinor` is the price the traveler pays (already shown in the client view), and
`reason` is mapped to a small client-safe enum (`price_changed`,
`supplier_unavailable`, `already_booked`) — never a raw internal reason.

**Alternatives considered**: Returning the raw `BookOutcome` — rejected (leaks
net rate, merchant-of-record, supplier booking id).

## D6 — Recommendations & advisories: sourced-only, no fabrication

**Decision**: The review screen's "what you'll book" list is built from the
itinerary's real `ClientViewItem`s (title/kind/price) — already sourced from
supplier offers via the client view. Flights: reuse the existing honestly-labeled
`apps/web/lib/flights.ts` deep-link surface only if shown, clearly marked
indicative — no named real carrier/fare (INV-008, and `flights.ts`'s own
"never a real carrier's trademark" contract). Advisories: a clearly-labeled
"Before you book" panel with (a) operator-confirmation notes derived from the
traveler's own real components (e.g., "Confirm pickup time for your private
transfer") and (b) an outbound link to authoritative official travel-advisory
sources — **no fabricated destination facts**.

**Rationale**: The ticket's own constraint is "clearly-sourced guidance, not
fabricated facts," and the constitution forbids fabricated content (III,
Compliance & Content Sourcing). No terrain/altitude/security data exists in the
system; inventing it would violate both. Pointing to the real source is honest
and satisfies the spirit of "contextual advisories."

**Deferred (documented, not faked)**: Rich destination-specific advisory content
(terrain, altitude, security ratings) requires an integrated sourced feed (e.g.,
a government travel-advisory API). Deferred to a follow-up ticket; surfaced as a
labeled external-source pointer in the meantime.

## D7 — Regression witness: flip the standing scenario from "gap" to "works"

**Decision**: Update `scenarios/incubating/traveler-self-book-attempt/
scenario.mjs` so its arrange shares an **un-booked** proposal, then asserts the
traveler's `clientView.selfBook` **succeeds** (creates `booking_component` rows
attributed to the owning agency, conserves state, and the handoff still works).
Update its `KITCHENLOOP-COVERAGE` annotation `booking × web × client`: `fail` →
`pass`.

**Rationale**: The scenario is the durable witness of exactly this gap. Once the
gap closes, honesty requires the witness assert the seam now works (not that we
weaken an assertion — we invert a proven-gap into a proven-capability, which is
the correct evolution of a regression witness). The coverage matrix cell must
follow the real state.

**Note**: This is separate from the new `l3-traveler-self-book.test.ts` (which
adds the failure-branch conservation assertions in the fast L3 harness). The
`.mjs` scenario is the live-stack witness; the `.test.ts` is the Postgres-delta
gate.
