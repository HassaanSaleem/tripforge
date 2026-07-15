# Research: Bring-Your-Own Itinerary (Manual Entry)

All open questions were resolved by reading the current codebase directly
(two Explore passes) rather than by external research — this is a pure
internal-architecture feature.

## D1: Can this ship without a canonical itinerary schema version bump?

**Decision**: Yes. No change to `packages/itinerary-schema` at all; `SCHEMA_VERSION`
stays `"0.1.0"`.

**Rationale**: `ItemSchema`'s three kinds (stay/activity/transfer) already make
`supplyRef` and `pricing` optional on every kind
(`packages/itinerary-schema/src/item.ts:22-34`), and this exact shape (a kind
with no `supplyRef`/`pricing`) is already asserted valid by the schema
package's own round-trip fixture
(`packages/itinerary-schema/src/__tests__/fixtures.ts:41-47`). A
manually-entered item is therefore just an `Item` populated by a human instead
of an LLM tool call — no new field, no new enum member.

**Alternatives considered**: A new item-level `origin`/`provenance` field
(rejected — `ItemSchema`/`ItinerarySchema` are `.strict()`, so any new field
is a real schema-version bump, which is DIRECTIVE ALWAYS-HALT and would make
this its own operator-gated cycle for no functional gain, per precedent D2).

## D2: Where does "manually-built vs AI-drafted" origin live?

**Decision**: A new `creation_source` column on the `itinerary` Postgres table
(`packages/db/src/schema-itinerary.ts`), `text NOT NULL DEFAULT 'ai_drafted'`,
values `'ai_drafted' | 'manual' | 'licensed_copy'`. Not a Postgres enum type —
matches the existing convention (`media_asset.source` is a plain `text`
column with Zod-level validation, not a DB enum).

**Rationale**: This is a Drizzle table concern, not the canonical itinerary
document — precedent (content-library's `media_asset` table, group-travel's
`group_departure` tables) shows new/extended Postgres tables are ordinary
loop work, never an ALWAYS-HALT, as long as the itinerary JSONB shape itself
is untouched. The `DEFAULT 'ai_drafted'` makes the migration purely additive:
every pre-existing row (all AI-drafted or licensed-copy today) needs no
backfill script, because the UI only ever *displays* `creation_source` when
`licensedCopy === null` (see D3) — pre-existing licensed-copy rows keep
rendering correctly through the existing `licensedCopy` badge regardless of
their (unused, defaulted) `creation_source` value.

**Explicitly rejected**: Overloading the PMF `trip_created` event's `source`
field (`packages/db/src/pmf-events.ts:12-14`,
`PMF_TRIP_SOURCES = ["self_built", "licensed"]`). That field is a **closed,
load-bearing** two-value enum that feeds the constitution-mandated
`pmf_resold_vs_self_built` SQL view (`packages/db/sql/pmf-views.sql:34-39`) —
its `"self_built"` value already means "not a licensed/resold copy" and
covers AI-drafted itineraries today. A manually-built itinerary is *also*
"not a licensed/resold copy," so it MUST keep recording `source: "self_built"`
on its `trip_created` PMF event, unchanged — introducing a third value here
would silently corrupt the resold-vs-self-built PMF ratio. AI-vs-manual is an
orthogonal signal and needs its own field, not a repurposed one (Constitution
VI / provenance-integrity: don't let two different real-world distinctions
collapse onto one enum).

**Explicitly rejected**: Adding the marker inside `ProvenanceSchema`
(`packages/itinerary-schema/src/provenance.ts`) — also `.strict()`, also a
schema-version bump (same reasoning as D1).

## D3: How is origin displayed in the UI?

**Decision**: Mirror the existing licensed-copy badge pattern exactly
(spec 024). `listItineraries` (`packages/api/src/services/itineraries.ts`)
gains one more derived field (`origin: "manual" | "ai_drafted"`, read off the
new `creation_source` column, tenant-scoped query — no new join needed since
it's a column on the same row already being read). `itinerary-list.tsx`
renders it as a `tf-badge` next to the existing `licensedCopy`/`listing`
badges, **only when `licensedCopy === null`** — a licensed copy already shows
"Licensed copy · original by X" and does not also need an "AI-drafted"/
"Self-built" badge (spec Edge Cases: a copy's displayed origin is its
licensing provenance, not a re-classification of who clicked "create").
Formatter lives in `apps/web/lib/itinerary-list.ts` alongside
`formatLicensedCopyBadge`, following the same pure-function pattern.

**Rationale**: Reuse, not reinvention — same query shape, same component,
same CSS class vocabulary (`tf-badge`), same file locations as the feature
this most closely resembles.

## D4: How does "attach a supplier rate to a manual item" actually work?

**Decision**: Reuse `applyChatEdit`/`chatEdit` (`packages/api/src/routers/itinerary.ts:107-117`)
unchanged — no new edit-proposal type. Document the real semantics rather
than an idealized "in-place attach": `ChatEditProposalSchema`
(`packages/llm/src/chat-edit.ts:10-22`) only has `removeItem` and `addItem`;
`addItem` always builds a brand-new `Item` from a **live-verified** offer
(`packages/domain/src/edit.ts` `buildItem`) — there is no path to hand-enter
an arbitrary net rate, by design (INV-006 quote freshness: every price must
trace to a live/re-verifiable supply-port offer, never a typed-in number).

For a manually-entered **stay** item, `applyAdd` already auto-replaces the
existing stay (`edit.ts:249-255`, "v0 trips are single-hotel") — attaching a
rate is transparent: add the matching offer, the manual placeholder is
replaced automatically. For **activity/transfer**, there is no auto-replace:
the agent (or the chat-edit LLM interpreting a message like "book the museum
tour I added") issues `removeItem` on the manual placeholder and `addItem`
for the matching live offer in the same edit turn — the item's title then
comes from the offer, not the original manual entry. This is the existing,
already-shipped editing behavior for AI-drafted itineraries too (an AI-drafted
placeholder gets the same remove+add treatment when re-priced) — nothing new
is built here; FR-006 is satisfied by *not* special-casing manual items at
all in the edit path.

**Alternatives considered**: A new `updateItem` proposal type that attaches
`supplyRef`/`pricing` to an existing item id in place, preserving the manual
title. Rejected for this cycle — it's a real feature (in-place item update)
that AI-drafted itineraries don't have either today, so building it only for
manual items would be new, untested surface beyond this ticket's scope. If
preserving the manually-typed title through re-pricing turns out to matter to
users, that's a follow-up ticket against `applyItineraryEdit` generally, not
specific to bring-your-own.

## D5: How is the manual-create mutation structured?

**Decision**: New `workspace.itinerary.createManual` mutation, same file/
router as every other itinerary procedure (`packages/api/src/routers/itinerary.ts`),
same `agentProcedure` + zod-parse-function input convention as its ten
siblings. Service function lives in `packages/api/src/services/itineraries.ts`
(the file that already owns `listItineraries`/`attachMedia`/the
`ItinerarySchema.parse`-before-write `persistDocument` helper at
`itineraries.ts:191-197`). `persistDocument` is an UPDATE-by-id for an
already-existing row and does not fit the CREATE path structurally, so
`createManualItinerary` inlines `ItinerarySchema.parse` directly ahead of the
insert instead, mirroring `selectDraftOption`'s own insert-transaction shape
(same INV-001 boundary re-validation, no forced insert/update merge —
recorded in tasks.md T005).

**Input shape**: title, currency, destination, checkIn, checkOut, party — the
same four fields `tripRequestSchema` already requires
(`packages/api/src/services/planner.ts:32-49`) — plus `days: []` (agent-
entered days/items). Reusing these exact field names/types means the
synthesized `tripRequest` (see D6) is built directly from real, agent-
supplied values, not guessed — the same fields the existing AI-planner form
already collects (`apps/web/lib/planner-form.ts`), so the manual-entry form
can reuse that form's field components for the trip-context portion and only
adds new day/item-builder UI on top.

## D6: Synthesizing `tripRequest` for a manually-created itinerary

**Decision**: Build a real `TripRequest` object (not a placeholder) from the
create-form's own destination/checkIn/checkOut/party fields (D5), with
`budget` synthesized as `{ mode: "target", amountMinor: 1, currency }` —
`budget` is required by `tripRequestSchema` (whose `amountMinor` is
`positive()`, so `1` is the smallest valid placeholder) but is only ever read
by the budget *allocator* (not invoked here) and by nothing in the
quote-then-book path, so an inert near-zero target is harmless.
`tripStyle`/`flightsReserveMinor` are omitted (both optional).

**Rationale**: `tripRequest` is read downstream by `verifiedSupplyCatalog`
(quote flow), chat-edit's own `verifiedSupplyCatalog` call, and the flights-
deeplink feature (reads `destination`/`checkIn`/`checkOut`) — all three only
need destination/dates/party to function, which are real values here, not
synthesized ones. This keeps every downstream consumer working unchanged with
zero special-casing for manually-created itineraries (spec SC-002).

**Alternatives considered**: Deriving `checkIn`/`checkOut` from the entered
days' own optional `date` fields instead of asking the agent directly.
Rejected — `Day.date` is optional and days can be entered with no dates at
all (spec Edge Cases allows a sparse draft), so derivation could fail or
produce misleading dates; asking directly (mirroring the planner form) is
simpler and always correct.

## D7: Money and pricing on manual items

**Decision**: No new money math. An item saved with no `pricing` is excluded
from `quote.ts`'s `bookable` set exactly like an unpriced AI-drafted item
(`packages/api/src/services/booking/quote.ts:63-65`, already filters on
`item.supplyRef` presence) — confirmed by the schema package's own fixture
that this shape is valid today. `PricingBlockSchema.total` (itinerary-level,
required) is synthesized the same way as `budget` in D6:
`{ amountMinor: 0, currency }`, `categories: []` — no allocator run, no
markup math, matching the "not yet priced" itinerary-level total that
`client-view.ts` already renders as `null`/zero gracefully.

**Rationale**: Constitution VI (Money-Safe) is satisfied by *not* introducing
any new money computation — every money value that ends up on a manually-
created itinerary either comes from the existing offer-verification path
(D4, when a rate is later attached) or is an inert zero placeholder that no
code path trusts as a real total until real items are priced.
