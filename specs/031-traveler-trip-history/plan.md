# Implementation Plan: Traveler Trip History — "My Trips"

**Branch**: `kitchen/fix-p2-consumer-trip-history-my-trips` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-traveler-trip-history/spec.md`

## Summary

Add a "My Trips" area to the `(client-view)` route group (`/view/my-trips`, a static segment that
resolves ahead of the existing `/view/[token]` dynamic route) listing every shared trip a signed-in
visitor has previously opened. A new bolt-on table, `client_trip_link`, records the association the
first time a signed-in visitor opens a trip's share link (idempotent, additive, backfill-free — the
same pattern as `itinerary_share_link`/`trip_handoff_request`/`group_departure`). The list reuses
the EXISTING `resolveShareLink` → `toClientItineraryView` client-facing projection per trip (INV-020:
never markup/net-rate), so selecting a trip opens the unmodified `/view/<token>` page. Anonymous
access and spec 030's identity/pre-fill behavior are structurally unaffected: the attach step is a
second, independently-caught async call that can never turn a successful `clientView.me` into a
failure.

## Technical Context

**Language/Version**: TypeScript (pnpm + turborepo monorepo, existing tsconfig)

**Primary Dependencies**: Drizzle ORM (Postgres), tRPC + zod, Next.js App Router, Better Auth
(session only, unchanged) — no new package dependencies

**Storage**: PostgreSQL — **one new table (`client_trip_link`), zero changes to any existing table
or column, zero canonical itinerary schema change**. Additive + backfill-free (`db:push`, no
backfill): every pre-existing itinerary/traveler simply has no rows in the new table until they
view a trip while signed in, which is the correct starting state (nobody has history yet). This is
the plan's HALT-required migration note; the specific shape (columns below) is operator-ratified
at PR merge, same discipline as SCHEMA-GATE-78 and spec 030's plan.

**Testing**: Vitest (L1/L2 service tests), Vitest L3 against real Postgres
(`packages/api/src/__tests__/l3-traveler-trip-history.test.ts`, env-gated on `DATABASE_URL`,
mirroring `l3-traveler-accounts.test.ts`), Playwright e2e for the attach→list→open journey,
Playwright MCP live journey (INV-027)

**Target Platform**: Existing web app (`apps/web`, Next.js App Router) + `packages/api` tRPC
surface; no mobile UI in this cycle

**Project Type**: Web application (monorepo: packages + apps/web)

**Performance Goals**: N/A beyond existing app conventions — `attachTrip` is a single indexed
upsert; `myTrips` re-runs the existing per-token `resolveShareLink` resolution once per linked
trip (bounded by one traveler's own visit count, expected small at v0 — no pagination needed yet)

**Constraints**: Anonymous access to `/view/<token>` and `requestHandoff` MUST regress zero
(INV-018) — attach-on-view only runs inside the already-authenticated branch of the page, so an
anonymous request never reaches it; `myTrips` MUST NOT ever return another visitor's trip
(identity scoping) or any agent-confidential value (INV-020, extends spec 010 FR-007/spec 030
SC-004); not a money path — no payment/markup/revenue-share touched, so no L3 concurrency/
conservation treatment is required (same class as spec 022/030); an attach-step failure MUST NOT
regress the pre-existing `clientView.me` pre-fill behavior (spec 030 US1 regression guard) — the
two calls are independently try/caught.

**Scale/Scope**: 1 new table, 1 new DB export (`clientTripLink`), 1 extended router
(`clientViewRouter`, +2 `protectedProcedure` members: `attachTrip` mutation, `myTrips` query), 1
extended service file (`client-view.ts`, +2 functions reusing the existing token→link lookup and
`resolveShareLink`), 1 new page route (`/view/my-trips`), 1 extended page
(`/view/[token]/page.tsx`, attach-on-view call), 1 extended component (`trip-fork.tsx`, "My Trips"
link in the account strip), 1 new L3 test file, 1 new e2e spec

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | Strengthens the request-an-agent funnel's surrounding experience (a traveler who can find their trips again is more likely to return and hand off) without adding new planning/booking surface — same funnel-support class as spec 030 | PASS |
| II. Agent Experience Is the Wedge | No workspace/agent-facing change; zero regression risk to the builder or time-to-client-ready-itinerary | PASS |
| III. Budget-Aware AI Priced Against Reality | N/A — no planner/pricing involvement | N/A |
| IV. Canonical Itinerary Schema | NO schema change. `client_trip_link` is bolt-on metadata ABOUT an itinerary (references `itinerary.id`), the identical pattern already used by `itinerary_share_link`/`trip_handoff_request`/`group_departure` — none of those are canonical-schema changes either. The `Itinerary` document/`SCHEMA_VERSION` are untouched | PASS |
| V. Integrate Supply, Don't Contract It | N/A — no supply-adapter involvement | N/A |
| VI. Trust, Provenance & Revenue-Share Integrity | Not a money path. Trust boundary is identity scoping: `myTrips` is keyed on `ctx.session.userId` (server-derived, never client input) and can only ever return rows where `client_trip_link.user_id = ctx.session.userId` — no cross-visitor read is expressible. Per-trip pricing is produced by the UNMODIFIED `resolveShareLink`/`toClientItineraryView` allowlist projection (INV-020), re-verified by a new L3 negative-check across visitor states, same as spec 030's regression gate | PASS |
| MVP Scope Discipline (P0 vs P1+/non-goals) | This ticket promotes the client-history slice of the P2 consumer-surface roadmap tier (constitution `## MVP Scope Discipline`, P2 line), explicitly bounded and operator-authorized 2026-07-15 via **P2-HISTORY-GATE** ("Build now, ratify at merge" — OPERATOR-DESK.md, resolved). Builds directly on the P2-IDENTITY-GATE slice (spec 030, merged #80). NOT the full self-serve consumer AI planner, NOT the PRD non-goal "generic consumer planner." Group-travel seat-join linking and a separate bookings sub-view are explicitly out of scope (spec.md Assumptions) | PASS (scoped, operator-authorized) |

**Result**: No unjustified violations. The one roadmap-phase flag (MVP Scope Discipline) is
resolved by a named, dated operator authorization (P2-HISTORY-GATE), not waived silently. No
Complexity Tracking entries required. Per the ticket's own HALT clause, this PR stays
operator-gated at merge (no auto-merge) even though the Constitution Check passes — the operator
ratifies the `client_trip_link` schema at merge time, same discipline as SCHEMA-GATE-78 and spec
030.

*Re-checked after Phase 1 design (data-model.md/contracts/): unchanged — the design introduces no
additional table, no canonical-schema touch, and no new trust surface beyond the userId-keyed scan
described above.*

## Project Structure

### Documentation (this feature)

```text
specs/031-traveler-trip-history/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/db/src/
├── schema-itinerary.ts               # EDIT — add clientTripLink table (sibling to itineraryShareLink/mediaAsset in this file, since it is itinerary-adjacent bolt-on metadata like those two, not auth-domain like membership.ts)
├── schema.ts                          # EDIT — export clientTripLink, add to schema object
└── index.ts                           # EDIT — export clientTripLink

packages/api/src/services/
└── client-view.ts                    # EDIT — factor the existing inline itinerary_share_link token lookup out of resolveShareLink into a small shared helper, findShareLinkByToken(db, token); add attachTraveler(container, session, token) and listTravelerTrips(container, userId), both reusing findShareLinkByToken/resolveShareLink

packages/api/src/routers/
└── client-view.ts                    # EDIT — add `attachTrip: protectedProcedure.mutation(...)` and `myTrips: protectedProcedure.query(...)`, reusing the existing getInputSchema for attachTrip's {token} input

packages/api/src/index.ts             # EDIT — export TravelerTripSummary (TS4023 convention, mirrors TravelerIdentity/ClientItineraryView)

apps/web/app/(client-view)/view/[token]/page.tsx    # EDIT — after resolveIdentity() succeeds, best-effort call clientView.attachTrip({token}) in its own try/catch (never affects the returned identity)

apps/web/app/(client-view)/view/[token]/trip-fork.tsx   # EDIT — when `identity` is present, the existing account strip gains a "My Trips" link (`/view/my-trips`) next to the sign-out control

apps/web/app/(client-view)/view/my-trips/
└── page.tsx                          # NEW — server component: redirect to /view/sign-in if no session; else render the "My Trips" list via the authenticated caller's clientView.myTrips()

apps/web/lib/trpc/client.ts           # EDIT — export ClientViewMyTripsOutput via inference (existing convention, mirrors ClientViewMeOutput)

packages/api/src/__tests__/
└── l3-traveler-trip-history.test.ts  # NEW — real-Postgres: attach-on-view creates exactly one row per (user, itinerary) pair even across repeat visits; myTrips returns only the caller's own linked trips; cross-traveler isolation; anonymous view/requestHandoff unaffected (INV-018 regression); myTrips payload negative-checks for markup/net-rate/agency-internal ids (INV-020)

tests/e2e/
└── traveler-trip-history-journey.spec.ts  # NEW — Playwright: sign in as traveler → open a shared trip → open "My Trips" → trip is listed → select it → lands on the same trip page; a trip never opened does not appear
```

**Structure Decision**: No new package. `client_trip_link` lives in `packages/db/src/schema-itinerary.ts`
alongside `itineraryShareLink`/`mediaAsset` — it is itinerary-adjacent bolt-on metadata (references
`itinerary.id`), matching that file's existing scope, not `schema-auth.ts` (which owns `user`/
`session`/`member` themselves, not records ABOUT a user). `attachTraveler`/`listTravelerTrips` live
in `packages/api/src/services/client-view.ts` alongside `resolveShareLink`/`getSignedInIdentity` —
same client-view-surface concern (what a visitor to `/view/*` may read/write about their own
relationship to a trip), matching the file's documented scope from spec 030's plan.

## Pre-Write Discipline (recorded per `.claude/skills/typescript-clean-architecture/SKILL.md`)

- **`clientTripLink` table (packages/db/src/schema-itinerary.ts)**: **new** — no existing table
  represents a visitor-to-itinerary association; `itineraryShareLink` is agency-owned
  (one-per-itinerary), `groupDepartureSeat`/`tripHandoffRequest` are unrelated bolt-on shapes with
  different keys. Follows the exact same bolt-on-table convention as those three (references
  `itinerary.id`, no canonical-schema touch).
- **`findShareLinkByToken` (packages/api/src/services/client-view.ts)**: **extend (refactor)** —
  `resolveShareLink` already does this exact `db.select().from(itineraryShareLinkTable).where(eq(...token))` lookup inline; factoring it into a named helper lets `attachTraveler` reuse it instead
  of duplicating the query, with zero behavior change to `resolveShareLink` itself.
- **`attachTraveler` (packages/api/src/services/client-view.ts)**: **extend** — same file as
  `resolveShareLink`/`getSignedInIdentity`, same inline `db`-guard style, reuses
  `findShareLinkByToken`.
- **`listTravelerTrips` (packages/api/src/services/client-view.ts)**: **extend** — reuses the
  EXISTING `resolveShareLink` function unmodified (one call per linked token) rather than writing a
  second, parallel projection function — the single source of truth for "what a visitor may see
  about a trip" stays `resolveShareLink`/`toClientItineraryView`.
- **`clientView.attachTrip`/`clientView.myTrips` (packages/api/src/routers/client-view.ts)**:
  **extend** — two more procedures on the existing router, reusing the file's existing
  `getInputSchema` for `attachTrip`'s `{token}` input (identical shape to `itinerary`'s input).
- **`/view/my-trips/page.tsx`**: **new, but reuses the redirect-if-signed-out shape** already
  established by `/view/sign-in`/`/view/sign-up` (inverted: redirect if NOT signed in) — no new
  pattern invented.
- **`trip-fork.tsx` account strip**: **extend** — one more link inside the existing
  `identity ? (...) : (...)` branch already rendering "Signed in as {name} · Sign out"; no new
  component.
- **New package**: **none** — no capability here is orthogonal enough to justify one.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty. The one roadmap-phase flag (MVP
Scope Discipline) is resolved by a cited, dated operator authorization (P2-HISTORY-GATE), not a
violation requiring justification.*
