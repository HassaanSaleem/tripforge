# Phase 0 Research: Demo Seed Data

## D1 — How to create real, sign-in-capable demo accounts

**Decision**: Import the existing `auth` singleton from `apps/web/lib/auth.ts`
inside the seed script and call `auth.api.signUpEmail({ body: { name, email,
password } })` (Better Auth's server API, invoked in-process — no HTTP round
trip needed since the script runs in the same Node process as the app's
dependency graph).

**Rationale**: Better Auth owns password hashing and the `account` credential
row; hand-rolling a compatible hash in a raw-SQL script (the `vet-agency.mjs`/
`apply-views.mjs` style) would be fragile and duplicate security-sensitive
logic outside its one owner. `apps/web` is the only package with a Better
Auth instance wired (organization plugin, Drizzle adapter) — reusing it is
also the smallest diff and guarantees the seeded accounts behave exactly like
a normal sign-up for every later code path (session creation, the
`session.create.before` hook that auto-activates the primary agency).

**Alternatives considered**: (a) Reimplement Better Auth's scrypt-based hash
manually in a plain `.mjs` script — rejected: fragile, version-coupled,
duplicates a security primitive. (b) Drive the real HTTP
`/api/auth/sign-up/email` endpoint from the seed script — rejected: the seed
step runs in the Docker `migrate` stage, BEFORE the `web` service boots
(`docker-compose.yml`'s `depends_on: migrate: condition:
service_completed_successfully`), so there is no HTTP server to call yet.

## D2 — How to create the agency/membership/vetting rows

**Decision**: Direct Drizzle inserts against `organization`, `member`, and
`agency_vetting` — the exact pattern already proven by
`packages/api/src/__tests__/l3-marketplace.test.ts`'s `makeAgency`/`vet`
helpers (insert `organization`, insert `user` — superseded here by
`signUpEmail`'s created user — insert `member` with `role: "owner"`, insert
`agency_vetting`).

**Rationale**: `agency_vetting` is deliberately written by ONLY the operator
action (`vet-agency.mjs`) today — no product code path infers vetting from
sign-up (Constitution VI, D-0006.a). The seed script is itself an
operator-class action (like `vet-agency.mjs`), so inserting directly here is
consistent with, not a violation of, that rule. Better Auth's organization
plugin HTTP flow (`authClient.organization.create` +
`authClient.organization.setActive`) is a browser-only client wrapper with no
documented in-process server equivalent for bulk/ops use, so a direct insert
is simpler and exactly matches the already-proven L3 test pattern.

**Alternatives considered**: Calling Better Auth's organization-plugin server
API directly (`auth.api.createOrganization`) — deferred: its exact
in-process (non-HTTP, non-session-derived) invocation shape is unverified
against this Better Auth version, and the direct-insert path is already
proven working in this exact codebase's own L3 tests, so it carries less risk
for a one-shot ops script that doesn't need any of the plugin's other
behavior (invitations, multi-org switching).

## D3 — How to drive itinerary drafting, listing, licensing, rating, and media

**Decision**: Build ONE `Container` via `buildContainer({ db })` (defaults
`llm` to `FakeLLM` — the deterministic keyless demo path, matching
`docker-compose.yml`'s `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}` default of
empty) and drive every mutation through `createAppCaller(createContext({
session, container }))` from `@tripforge/api` — one caller per acting demo
user's `SessionContext { userId, agencyId, agencyRole: "owner" }` — calling
`workspace.itinerary.draft`, `workspace.marketplace.createListing`,
`workspace.marketplace.licenseListing`, `workspace.marketplace.rateListing`,
`workspace.media.register`, and `workspace.itinerary.attachMedia`.

**Rationale**: This is the IDENTICAL in-process caller pattern
`packages/api/src/__tests__/l3-*.test.ts` already uses. It exercises the real
business logic (budget allocator, provenance stamping, revenue-share split via
`packages/domain`'s `splitTakeRate`, PMF event recording) with zero
duplication, guaranteeing seeded data is indistinguishable from data a real
user produced. `workspace.itinerary.draft` is now (spec 016) an
`agentProcedure.subscription()` returning an `AsyncGenerator<DraftEvent>` —
the seed script drains it with the same small loop the existing
`draft-helper.ts` test helper uses (`for await` until a `{type: "result"}`
event), reimplemented locally rather than imported (the helper lives under
`__tests__/`, which is test-only and not meant to be imported by production/
ops code).

**Alternatives considered**: Bypassing the router and inserting a
hand-built canonical `Itinerary` JSON document directly into the `itinerary`
table — rejected: there is no other write path for itineraries
(`workspace.itinerary.draft` is the ONLY mutation that persists one), and
hand-building a document would skip the real budget-allocator/assembly
pipeline, producing data that could drift from what the schema/domain logic
actually guarantees (defeats the point of "looks like a real trip").

## D4 — Curated hero-city catalog: where it lives and how it's served

**Decision**: A new module, `packages/supply-adapter/src/sandbox/curated-catalog.ts`,
exports a per-city lookup (keyed on a lower-cased, trimmed destination name)
of hotel/activity/transfer fixture content. `SandboxHotelAdapter.search()`,
`SandboxActivityAdapter.search()`, and `SandboxTransferAdapter.search()` each
check this lookup FIRST (by `criteria.destination` for hotel/activity, by
`criteria.to` — falling back to `criteria.from` — for transfer, since the
FakeLLM planner always searches transfers as `{from: "<destination>
Airport", to: "<destination>"}`) and return the curated offers (registered
into the same `SandboxSupplyEngine` via the existing `register()` method) when
a match exists; otherwise the existing procedural generation is unchanged.

**Rationale**: Per the ticket's Part A intent, this must be product-facing —
ANY planner request for a hero city (seed script or a real future agent
typing "Lisbon" into the live planner) should see curated content, not a
seed-only side channel. Keeping it inside `packages/supply-adapter/src/sandbox/`
respects Constitution V (no supplier-shape leakage outside the adapter
boundary) and INV-017 (dependency-cruiser's `packages-never-import-apps` and
adapter-isolation rules are untouched — this is an internal adapter change).

**Alternatives considered**: Injecting curated offers only from the seed
script via `engine.register()` calls reaching into the container's adapters
— rejected: this would NOT benefit a live user typing the same destination
through the real UI later (contradicts the sibling demo tickets' framing of
"the demo-01 catalog imagery" as available product content, not a
seed-script-only fixture), and would require exposing the adapters'
internal engines through the container's public surface, widening that
surface for a one-shot script's benefit.

## D5 — `SupplyContent` extension (image + attribution)

**Decision**: Add two OPTIONAL fields to `SupplyContent` in
`packages/supply-adapter/src/ports/common.ts`: `imageUrl?: string` and
`attribution?: string`.

**Rationale**: `SupplyContent` is already a plain, non-Zod-validated
TypeScript interface (`{title, description?, features?}`) with no downstream
strict-object parsing — confirmed by reading every sandbox adapter and the
assembly code. Adding two optional fields is purely additive: existing
callers/fixtures that don't set them are unaffected, and no schema migration
or Zod-boundary change is needed anywhere.

**Note for scope discipline**: today's assembly code
(`packages/domain/src/assemble.ts`) copies ONLY `offer.title` into the
canonical item and always initializes `item.media: []`. These new
`imageUrl`/`attribution` fields on the offer are therefore NOT automatically
threaded into an itinerary item's own `media` array by this feature — that
remains a documented follow-up. This feature satisfies "a trip has media"
(FR-004) via the existing, already-shipped `workspace.media.register` +
`workspace.itinerary.attachMedia` path instead, which is unaffected by (and
does not need) this note.

**Alternatives considered**: Extending `assembleItinerary` to copy
`offer.content.imageUrl`/`attribution` into `item.media` automatically —
deferred out of this feature's scope (the spec's Assumptions section already
calls this out); it touches `packages/domain` assembly logic used by every
draft, which is a larger, separately-reviewable change better done as its
own follow-up once the curated catalog itself is proven.

## D6 — Seed script location, runtime, and Docker wiring

**Decision**: `apps/web/scripts/seed-demo.ts`, executed via `tsx` (new
`apps/web` devDependency + a `"db:seed": "tsx scripts/seed-demo.ts"` package
script), invoked as a THIRD step appended to the existing migrate-stage
command in both `apps/web/Dockerfile` (the `migrate` build stage's `CMD`) and
`docker-compose.yml` (the `migrate` service, which builds from that same
Dockerfile target) — after `db:push && db:views`, so it runs against a
schema-complete, view-applied database and before the `web` service is
allowed to start (`depends_on: migrate: condition:
service_completed_successfully`).

**Rationale**: The Docker `migrate` stage already does `COPY --from=deps
/app ./` (the FULLY installed workspace, including `apps/web`'s
`node_modules`) followed by `COPY . .` (full repo source) — so `apps/web`'s
source and its installed dependencies (including `better-auth`, once `tsx` is
added) are already present at that stage with zero new COPY lines needed.
`packages/db` cannot host this script instead: it would need `better-auth`,
`@tripforge/api`, and every package `@tripforge/api` composes as new
dependencies, which is architecturally backwards (`packages/db` is a leaf-ish
persistence package; `packages/api`/marketplace/domain depend on it, not the
reverse).

**Alternatives considered**: `node --experimental-strip-types` (no `tsx`
dependency) — rejected: not available/stable on `node:20-alpine` (the
Dockerfile's base image); requires a newer Node major than the repo targets.
Precompiling the seed script to `.mjs` by hand — rejected: duplicates
TypeScript source, drifts silently from the `.ts` original, and the repo has
zero precedent for hand-maintained compiled duplicates.

## D7 — Budget sizing for seeded drafts

**Decision**: Use a `hardCap` budget of $3,500-$4,500 (in the relevant
per-trip currency) for 4-6 night hero-city trips, `tripStyle: "balanced"`,
sized comfortably above the curated catalog's total realistic cost
(hotel + 4-6 activities cycling + round-trip transfer) so the demo shows a
clean, comfortably-within-budget breakdown rather than a rebalanced/overrun
one.

**Rationale**: The existing proven L3 fixture (`DRAFT_INPUT` in
`l3-booking.test.ts`) uses a $1,000 hard cap for a 2-night trip with the
CURRENT $125-180 procedural hotel / $45-70 EUR procedural activity fixtures
and comfortably fits; the curated catalog's realistic pricing (real-sounding
hotels/activities generally priced somewhat higher than the placeholder
fixtures) over 4-6 nights needs a proportionally larger total. Exact per-city
totals are tuned during implementation/live-verification against the actual
curated prices chosen, not hard-derived here.

**Alternatives considered**: A `target` budget mode — rejected: `hardCap`
better demonstrates the allocator "fits within budget" story for a clean demo
screenshot; `target` mode's softer semantics are not this ticket's focus.

## D8 — Currency convention for curated offers

**Decision**: Keep the existing per-component currency convention: hotel and
transfer offers in USD, activity offers in EUR — matching today's procedural
fixtures exactly.

**Rationale**: This is not a new decision, it is preserving what's already
there; changing it would be an unrelated, unrequested behavior change and
would needlessly touch the existing multi-currency conversion path's test
coverage.
