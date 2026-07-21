# Implementation Plan: Traveler Home — the post-auth landing at `/view`

**Branch**: `kitchen/fix-goal-traveler-account-home` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-traveler-home/spec.md`

## Summary

Turn `/view` — today a static placeholder and the default post-auth landing when a traveler signs
up/in without a share token — into a real traveler **home**. A signed-in traveler sees a
brand-neutral, premium home that greets them by name, links to "My Trips" (spec 031), signposts the
not-yet-built "Plan a trip" and "Discover" surfaces as *coming soon*, and offers sign-out. An
anonymous visitor to `/view` sees a brand-neutral welcome (sign-in / create-account) instead of
today's dead placeholder. No new server procedure, no schema change, no money path: the page reads
the existing `clientView.me` and `clientView.myTrips` procedures and reuses the `.tf-client-*`
theme kit.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router, React server components), Node 20
**Primary Dependencies**: Next.js, Better Auth (reused), tRPC in-process caller, existing `.tf-*`
theme kit in `apps/web/app/globals.css`
**Storage**: N/A for this feature (read-only reuse of existing procedures; no new table/migration)
**Testing**: Playwright e2e (`tests/e2e`), Vitest L1/L2/L3 (`packages/api`), in-image `pnpm test`
**Target Platform**: Web (apps/web)
**Project Type**: web (turborepo)
**Performance Goals**: home render is a single session read + two existing batched queries
(`me`, `myTrips`) already O(1) per lookup kind (perf-031); no new N+1
**Constraints**: brand-neutral (INV-020), no workspace affordance (INV-024), traveler cannot reach
workspace procedures (INV-023), anonymous `/view` never computes trip data; preserve the existing
anonymous-`/view` INV-020/INV-024 e2e negatives (smoke.spec.ts, trust-boundary.spec.ts)
**Scale/Scope**: one route page rewrite (`view/page.tsx`) + one small client sign-out button +
e2e/L-level test additions; no server/schema change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | The home's only real destination is "My Trips" — the agent-shared trips whose request-an-agent fork funnels demand into the marketplace. "Plan a trip"/"Discover" are signposted **coming soon**, not built here, so this adds NO standalone consumer planner. Strengthens the consumer→agent funnel's landing experience (same funnel-support class as spec 030/031) | PASS |
| II. Agent Experience Is the Wedge | No workspace/agent-facing change; the agent surface (`(workspace)`) is untouched, zero regression risk to the builder | PASS |
| III. Budget-Aware AI, Priced Against Reality | N/A — no planner/pricing/LLM involvement | N/A |
| IV. Canonical Itinerary Schema | NO schema change, NO migration. The home renders the existing `TravelerIdentity` (name/email) and `TravelerTripSummary[]` projections; `Itinerary` document/`SCHEMA_VERSION` untouched | PASS |
| V. Integrate Supply, Don't Contract It | N/A — no supply-adapter involvement | N/A |
| VI. Trust, Provenance & Revenue-Share Integrity | Not a money path (no booking/markup/take-rate/revenue-share touched). Trust boundary held mechanically: (a) brand-neutral `data-plain` home, no platform naming (INV-020); (b) no workspace affordance (INV-024); (c) identity scoping unchanged — `myTrips`/`me` are keyed on `ctx.session.userId` (server-derived), no cross-visitor read expressible; (d) INV-023 unchanged — **no new server procedure is added**, so a traveler session's FORBIDDEN-from-`workspace.*` guarantee is exactly as before and re-asserted by the existing L3 | PASS |
| MVP Scope Discipline (P0 vs P1+/non-goals) | Promotes the traveler-home slice of the **P2** consumer-surface roadmap tier, operator-authorized in **GOAL.md** (2026-07-21 campaign: "the consumer/client surface (PRD roadmap P2) is pulled forward now"). Builds on the P2-IDENTITY-GATE (spec 030, #80) and P2-HISTORY-GATE (spec 031, #82) slices, both merged. Explicitly NOT the self-serve consumer AI planner (that is goal-consumer-planner, still backlog) and NOT the PRD non-goal "generic consumer planner" — the home only signposts those as coming soon | PASS (scoped, operator-authorized) |

**Result**: No unjustified violations. The one roadmap-phase flag (MVP Scope Discipline) is
resolved by the standing, dated operator authorization in GOAL.md (the two-sided-surface campaign
pull-forward of the P2 consumer surface), not waived silently. This feature makes **no**
ALWAYS-HALT change (no constitution amendment, no canonical-schema version bump/migration, no
revenue-share/client-ownership-semantics change) — it adds no server capability at all — so it does
not require an OPERATOR-DESK row and lands via the normal loop merge pipeline. No Complexity
Tracking entries required.

*Re-checked after Phase 1 design (research.md/contracts): unchanged — the design introduces no new
table, no new procedure, no canonical-schema touch, and no new trust surface beyond the
already-shipped userId-keyed `me`/`myTrips` reads.*

## Project Structure

*No Constitution Check violations — Complexity Tracking table intentionally empty.*

### Documentation (this feature)

```
specs/033-traveler-home/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 — no schema change (documents "none")
├── contracts/
│   └── traveler-home.md # Phase 1 — the /view route contract (no tRPC contract change)
├── quickstart.md        # Phase 1 — manual verification recipe
└── tasks.md             # Phase 2 (/speckit-tasks output)
```

### Source Code (repository root)

```
apps/web/app/(client-view)/view/
├── page.tsx                 # REWRITE: static placeholder -> anonymous welcome + signed-in home
├── traveler-home.tsx        # NEW (client): sign-out button (+ any client bits the home needs)
├── my-trips/page.tsx        # UNCHANGED (home links to it)
├── sign-in/ , sign-up/      # UNCHANGED (already token-less; land on /view)
└── [token]/                 # UNCHANGED

tests/e2e/
├── traveler-account-journey.spec.ts   # EXTEND: token-less sign-up -> home -> My Trips
├── smoke.spec.ts                      # UNCHANGED (anonymous /view still shows "Your trip", no leak)
└── trust-boundary.spec.ts             # UNCHANGED (anonymous /view INV-020/024 negatives preserved)

packages/api/src/__tests__/
└── l3-traveler-accounts.test.ts       # UNCHANGED (INV-023 FORBIDDEN-from-workspace.* already covered)
```

**Structure Decision**: Single route-page rewrite plus a tiny client component for sign-out, all
inside the existing `(client-view)` route group. No package/boundary changes; nothing crosses into
`packages/*` (no server capability added).

## Complexity Tracking

*No entries — the design adds no server procedure, no table, no schema/money touch.*
