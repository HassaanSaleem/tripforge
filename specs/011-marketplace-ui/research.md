# Research — Marketplace UI (011)

No NEEDS CLARIFICATION markers existed in the Technical Context; the decisions
below pin the integration patterns against the codebase as it stands on
`origin/main` (post spec 006/008/009/010).

## D1 — Reuse the typed browser tRPC client + router type inference

**Decision**: The panel calls `trpc.workspace.marketplace.*` through
`apps/web/lib/trpc/client.ts` and derives all input/outcome types via
`inferRouterInputs/inferRouterOutputs` type aliases added to that module
(`BrowseListingsOutput`, `CreateListingInput/Output`, `LicenseListingInput/Output`,
`MyItinerariesOutput`), exactly as spec 008 (draft) and spec 009 (quote/book) did.

**Rationale**: Keeps the browser in lock-step with the deployed contract with
zero exported server types (QS3-1 premature-export rule); same-origin cookie
carries the Better Auth session.

**Alternatives considered**: Exporting outcome types from `@tripforge/api`
(rejected — violates the established premature-export rule); REST fetches
(rejected — INV-018 mandates the one mounted tRPC surface).

## D2 — Page composition: server-component gate + one client panel

**Decision**: `apps/web/app/(workspace)/marketplace/page.tsx` is a server
component that calls `getWorkspaceIdentity(await headers())`; a non-agent gets
the workspace membership prompt (INV-024 UX gate), a verified agent gets the
branded workspace header + `<MarketplacePanel />` (client component). The
workspace page gains a header nav link to `/marketplace`.

**Rationale**: Verbatim precedent from the workspace page (spec 007/008). The
page gate is UX only; authorization for data stays in `agentProcedure`
(INV-023) — the panel's queries fail typed if the session lapses.

**Alternatives considered**: Embedding the marketplace inside the existing
workspace page (rejected — the workspace page is the planner's home; a
marketplace is a distinct destination and the ticket asks for "a marketplace
page"); client-side-only gating (rejected — INV-024 precedent is server gate).

## D3 — New read procedure: `workspace.itinerary.list`

**Decision**: Add a `list` query to `packages/api/src/routers/itinerary.ts`
backed by a new small service `packages/api/src/services/itineraries.ts`
exporting `listItineraries(container, session)` → `{ itineraries: [{ id,
title, currency, createdAt }] }`, tenant-scoped with the same `scopedWhere`
helper the rest of the API uses (INV-004), newest first. Covered by a new L3
test (`packages/api/src/__tests__/l3-itinerary-list.test.ts`, harness precedent
`l3-marketplace.test.ts`) proving agency A never sees agency B's itineraries.

**Rationale**: The listing form needs a real picker; no such read exists.
A NEW service file rather than `services/booking.ts` because booking.ts is
already over the 400-line extraction threshold with an open quality-sweep
ticket (17835183631278801849) to split it — growing it further works against
a filed ticket.

**Alternatives considered**: Putting the select inline in the router (rejected
— routers are thin adapters by house convention); adding to services/booking.ts
(rejected — see above); reusing `itineraryOverview` per itinerary (rejected —
N+1 round trips and it returns whole documents; the picker needs 3 fields).

## D4 — License-fee input: major units → integer minor units

**Decision**: The listing form takes the fee in major units of the picked
itinerary's own currency; `marketplace-flow.ts` maps it with
`Math.round(major * 10 ** currencyFractionDigits(currency))` REUSING
`currencyFractionDigits` from `lib/planner-form.ts`, with refusal messages for
non-numeric, negative, and excess-precision input. Display of any
server-returned amount reuses `formatMinorAmount` (same module).

**Rationale**: Exactly the planner budget-input precedent (spec 008); the
itinerary's currency is fixed server-side (listing inherits it), so the form
shows the currency as a read-only fact of the picked itinerary rather than an
input.

**Alternatives considered**: Asking for minor units directly (rejected —
hostile UX); letting the user pick a currency (rejected — the server stamps the
itinerary's own currency; an input would just create a refusal path).

## D5 — Percent → basis points: generalize the spec-009 mapper

**Decision**: Extract the digit-exact percent→bps mapping out of
`booking-flow.ts`'s `toMarkupBps` into a NEW shared pure module
`apps/web/lib/basis-points.ts` (`percentToBps(raw: string, subject: string)`
returning `{ bps } | { error }` with the subject word interpolated into the
three refusal messages). `toMarkupBps` delegates to it with subject "Markup"
(its exported signature and messages stay byte-identical — existing L1 tests
must pass unchanged); `marketplace-flow.ts` calls it with subject
"Revenue share".

**Rationale**: Pre-Write Discipline — a second literal percent→bps
implementation would be a near-duplicate of an existing export
(review-blocking). Two real call sites justify the generalize decision per the
clean-architecture extraction rules.

**Alternatives considered**: Duplicating the logic in marketplace-flow.ts
(rejected — near-duplicate rule); importing `toMarkupBps` and rewording its
errors in the caller (rejected — error strings would no longer come from one
pure tested mapping, breaking the FR-009 pattern).

## D6 — Browse refresh after actions (FR-011)

**Decision**: The panel owns `listings` state with one `loadListings()`
function (initial `useEffect` + re-invoked after a successful create or
license). No cache layer, no optimistic updates — the server's post-action
browse is the truth on screen.

**Rationale**: Matches the feature's "booking truth always comes from the
platform's own responses" doctrine (spec 009 research D10); a manual reload
requirement would fail FR-011.

**Alternatives considered**: TanStack Query / tRPC React hooks (rejected — the
repo deliberately uses the plain typed client; introducing a query cache is a
new dependency and pattern outside this ticket's scope); optimistic insertion
(rejected — invents client-side marketplace state).

## D7 — Typed refusal → message mapping, exhaustive over the server unions

**Decision**: `marketplace-flow.ts` exports `createListingFailureMessage` and
`licenseFailureMessage` switching EXHAUSTIVELY (no default) on the non-success
statuses inferred from the router output types, so a new server refusal breaks
compilation here; `provenance_incomplete` renders its `issues` list;
`already_listed`/`already_licensed` render as benign already-done notices.
Transport failures map via the shared `transportErrorMessage` with
marketplace-appropriate wording (spec 009 research D6 precedent).

**Rationale**: FR-005/FR-007/FR-009 verbatim; the compile-time exhaustiveness
is what "MUST be exhaustive" means mechanically in this codebase
(booking-flow.ts precedent).

**Alternatives considered**: default-case catch-all messages (rejected — lets
new server reasons silently reach users with generic wording).

## D8 — Rating display

**Decision**: `formatRating(average: number | null, count: number)` in
`marketplace-flow.ts`: `null`/0-count → "Not yet rated"; otherwise
`"★ {average one-decimal} ({count})"`. Display-only; no submission UI
(deferred ticket).

**Rationale**: The browse projection already carries `ratingAverage`/
`ratingCount`; an explicit unrated state is spec US1 scenario 5.

**Alternatives considered**: Hiding the rating row when unrated (rejected —
an explicit state is required by the spec and reads better on a demo surface).

## D9 — Theme-kit additions, presentation only

**Decision**: Add `.tf-market*` classes (grid of listing cards, terms rows,
split-receipt panel, form column) to `apps/web/app/globals.css` next to the
existing spec-009/010 sections, composing existing primitives (`.tf-card`,
`.tf-eyebrow`, `.tf-badge`, `.tf-price`, `.tf-btn--cta`, `tf-rise` animation).
No behavior in CSS; client-view (`[data-plain]`) untouched.

**Rationale**: seed-0009s established globals.css as the single theme file and
the operator's premium-UI directive makes sell-grade presentation part of the
bar; blocked-combo/INV-020 surfaces are unaffected (workspace group only).

**Alternatives considered**: CSS modules per component (rejected — repo
convention is the one theme file with `.tf-*` kit); inline styles (rejected —
below the premium bar, unreviewable).

## D10 — Live verification journey (INV-027) and e2e shape

**Decision**: `tests/e2e/marketplace-journey.spec.ts` drives the FULL trade
loop against the built compose image using the existing `signUpAgency` helper:
agency A signs up → drafts via the planner (FakeLLM/sandbox determinism) →
lists it on /marketplace; agency B signs up → browses (sees A's listing, no
"your listing" marker) → licenses it → asserts the split receipt renders
platform-recorded integers and A's own view marks the listing as theirs +
refuses self-license. The MCP QA journey mirrors the same steps with per-step
screenshots into `.kitchenloop/evidence/3/seed-0009d/`.

**Rationale**: The e2e IS the SC-001/SC-002 witness; two real agencies are the
only honest way to exercise the cross-tenant browse and the own-listing
refusal. Sandbox supply + FakeLLM keep it deterministic and key-free.

**Alternatives considered**: Seeding listings via direct DB writes (rejected —
bypasses the product; the journey must witness the UI path end-to-end);
single-agency test with a mocked second tenant (rejected — fakes the exact
cross-tenant property under test).
