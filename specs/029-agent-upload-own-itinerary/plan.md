# Implementation Plan: Bring-Your-Own Itinerary (Manual Entry)

**Branch**: `029-agent-upload-own-itinerary` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-agent-upload-own-itinerary/spec.md`

## Summary

Let an agent build an itinerary by hand — day by day, item by item — instead
of only through the AI planner, then let it flow through quote-then-book,
markup, marketplace, and client-view with zero special-casing. Achieved with
**no canonical itinerary schema change**: manually-entered items reuse the
existing stay/activity/transfer kinds with `supplyRef`/`pricing` omitted (a
shape already valid and tested in the schema package's own fixtures), a new
`createManual` tRPC mutation persists the document through the existing
`ItinerarySchema.parse` boundary (same pattern as the AI-draft and
white-label-copy insert sites), and a new additive `creation_source` column
on the `itinerary` Postgres table (not the JSONB document) records origin for
display, mirroring the existing licensed-copy-badge pattern. Attaching a real
supplier rate to a manual item reuses the existing `applyChatEdit` edit path
unchanged.

## Technical Context

**Language/Version**: TypeScript (pnpm + turborepo monorepo, existing tsconfig)

**Primary Dependencies**: Drizzle ORM (Postgres), tRPC + zod,
`@tripforge/itinerary-schema` (unchanged), `@tripforge/domain` (unchanged —
no new money math), `@tripforge/db` (extended: new column), Next.js App
Router (new manual-entry form UI)

**Storage**: PostgreSQL — 1 new additive column (`itinerary.creation_source`,
`text NOT NULL DEFAULT 'ai_drafted'`); canonical itinerary schema
(SCHEMA_VERSION 0.1.0) UNCHANGED (no migration note required per Constitution
IV — origin lives in its own column, exactly like `tripRequest`)

**Testing**: Vitest (L1/L2 unit + service tests: `createManual` validation/
persist, `listItineraries` origin-derivation, unchanged-insert-site
regression for `planner.ts`/`licensing.ts`), Vitest L3 against real Postgres
(new or extended itinerary L3 file: create → attach-rate → quote → book
conservation, list → license → copy gets `licensed_copy` independent of
original), Playwright e2e for the manual-builder form + origin badge,
Playwright MCP live journey (INV-027)

**Target Platform**: Existing web app (`apps/web`, Next.js App Router) +
`packages/api` tRPC surface; no mobile UI this cycle (mobile consumes the
same tRPC router later if needed — out of scope, matches spec 021 precedent)

**Project Type**: Web application (monorepo: packages + apps/web)

**Performance Goals**: N/A beyond existing app conventions — `createManual` is
a single short transaction, same class as `selectDraftOption`'s persist step

**Constraints**: No canonical schema version bump (Constitution IV); no new
money math (Constitution VI — every price on a manual item still traces to a
live-verified supply-port offer via the unchanged edit path); tenant scoping
(INV-004); zero special-casing of manual itineraries in quote/book/marketplace/
client-view code paths (spec SC-002)

**Scale/Scope**: 1 new DB column (additive), 2 existing insert sites gain one
field each (`planner.ts`, `licensing.ts` — no behavior change), 1 new tRPC
mutation + service function, 1 extended read-model field (`MyItinerary.origin`),
1 new UI form (day/item builder — the only genuinely new UI; the day/item
*display* component is a straight reuse), 1 new badge (mirrors the existing
licensed-copy badge), 1 new/extended L3 test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | A manually-built itinerary is fully sellable (listable/licensable/shareable) the moment it's priced — grows the supply side of the marketplace beyond what the AI planner alone can produce (agents with existing client relationships/paper itineraries can now bring that inventory in) | PASS |
| II. Agent Experience Is the Wedge | Additive entry point alongside the AI planner, not a replacement; doesn't touch or regress the AI-drafting flow's time-to-client-ready-itinerary | PASS |
| III. Budget-Aware AI, Priced Against Reality | N/A — manual entry deliberately bypasses the budget allocator (spec Assumptions); no planner/allocator code changes | N/A |
| IV. Canonical Itinerary Schema | NO schema change. `SCHEMA_VERSION` stays `"0.1.0"`. Manual items reuse existing optional `supplyRef`/`pricing` (research D1); origin lives in a new Postgres column, not the JSONB document (research D2) — exactly the group-travel/content-library precedent of bolting new signals onto separate storage rather than forking the document shape. No version bump, no migration note needed | PASS |
| V. Integrate Supply, Don't Contract It | No new supply-port code. Attaching a rate to a manual item reuses the EXISTING `applyChatEdit`/`buildItem` path unchanged (research D4) — every price still traces to a live-verified offer through the supply adapter boundary; no manual net-rate entry is ever accepted from the client | PASS |
| VI. Trust, Provenance & Revenue-Share Integrity | No new revenue-share semantics — a manually-built itinerary lists/licenses through the unchanged `licenseListing`/`splitTakeRate` mechanism. Provenance is strengthened, not weakened: origin is now explicit (`creation_source`) and the existing `trip_created` PMF `source` field is deliberately left untouched (research D2) so the constitution-mandated resold-vs-self-built PMF ratio stays correct rather than being silently corrupted by a third, uncounted value | PASS |
| MVP Scope Discipline (P0 vs P1+/non-goals) | Agent-side workspace feature only — no consumer-surface/traveler-facing entry point, no file-upload/OCR pipeline (spec Assumptions scopes "upload" to structured manual entry). Stays inside P0 | PASS (scoped) |

**Result**: No violations. No Complexity Tracking entries required.

**Post-Phase-1 re-check**: Design artifacts (data-model.md,
contracts/manual-itinerary.md, quickstart.md) confirm the pre-Phase-0
analysis holds — the `creation_source` column is additive-only with a
default that makes the migration a no-op for existing rows' *observed*
behavior (licensed-copy rows keep rendering via the untouched
`licensedCopy`/`provenance.rebrandLineage` path regardless of their defaulted
`creation_source`); the `trip_created` PMF event keeps recording
`source: "self_built"` unchanged for both AI-drafted and manual itineraries
(no new value added to that closed enum); `createManual` never accepts
`supplyRef`/`pricing` from the client, so no new money-trust surface is
introduced. Constitution Check result unchanged: PASS, no new Complexity
Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/029-agent-upload-own-itinerary/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── manual-itinerary.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/db/src/
├── schema-itinerary.ts          # EDIT — add creationSource column to itinerary table
└── index.ts                     # (no export change — column reached via existing itinerary table export)

packages/api/src/services/
├── itineraries.ts                # EDIT — new createManualItinerary() service function
│                                  #       (reuses persistDocument), extend MyItinerary +
│                                  #       listItineraries with `origin`, new
│                                  #       createManualItineraryInputSchema + manual item/day
│                                  #       input schemas
└── planner.ts                    # EDIT — one field added to the existing insert
                                   #       (creationSource: "ai_drafted"); no logic change

packages/api/src/routers/
└── itinerary.ts                  # EDIT — new createManual mutation, same file/pattern as
                                   #       list/get/share/chatEdit/applyChatEdit/attachMedia

packages/marketplace/src/
└── licensing.ts                  # EDIT — one field added to the existing copy insert
                                   #       (creationSource: "licensed_copy"); no logic change

apps/web/app/(workspace)/workspace/
├── manual-itinerary-form.tsx     # NEW — day/item builder form (the only genuinely new UI)
├── itinerary-days.tsx            # REUSE, unchanged — already renders unpriced items correctly
├── itinerary-list.tsx            # EDIT — render the new origin badge next to licensedCopy/listing
└── page.tsx (or nearest route)   # EDIT — entry point/button to start a manual itinerary

apps/web/lib/
├── itinerary-list.ts             # EDIT — new formatOriginBadge() alongside formatLicensedCopyBadge()
└── planner-form.ts               # REUSE — the destination/dates/party field components the
                                   #       manual-create form shares with the AI-planner form

packages/api/src/__tests__/
└── l3-manual-itinerary.test.ts   # NEW — real-Postgres: create → attach-rate → quote → book
                                   #       conservation; list → license → creation_source
                                   #       independence; client-view no-leak on unpriced item

apps/web/tests/e2e/ (or wherever existing e2e specs live)
└── manual-itinerary.spec.ts      # NEW — Playwright: build a manual itinerary, see it in the
                                   #       list with the correct origin badge
```

**Structure Decision**: Extends the existing itinerary read/edit service
(`itineraries.ts`) and its sibling router (`itinerary.ts`) — matches the
established pattern (every itinerary procedure, AI-drafted or not, lives in
this one file/router). No new top-level package: manual entry is an itinerary
*creation* concern, not a new domain (Pre-Write Discipline "extend", not
"new" — mirrors spec 021's reasoning for keeping group-travel inside
`@tripforge/marketplace` rather than forking a package).

## Pre-Write Discipline (recorded per `.claude/skills/typescript-clean-architecture/SKILL.md`)

- **`packages/api/src/services/itineraries.ts`**: **extend** — new
  `createManualItinerary()` sits alongside `listItineraries`/`attachMedia`/
  `persistDocument` in the same service file rather than a new file; reuses
  `persistDocument` for the `ItinerarySchema.parse`-before-write boundary
  check instead of duplicating it a third time (the AI-draft and
  licensed-copy paths each currently inline their own validate+insert; this
  is the first consumer of a shared helper across all three, generalizing an
  already-duplicated 2-instance pattern into a named one, per the
  Refactoring & Generalization "generalize" threshold — 2+ callsites now
  share a shape).
- **`packages/api/src/routers/itinerary.ts`**: **extend** — new
  `createManual` procedure in the existing `itineraryRouter`, same
  `agentProcedure` + zod-parse-function convention as its ten siblings; no
  new router file.
- **`packages/db/src/schema-itinerary.ts`**: **extend** — one new column on
  the existing `itinerary` table (additive, defaulted); not a new table,
  since origin is a property of the SAME row, not a separate entity with its
  own lifecycle (unlike `group_departure`, which has its own capacity/seats
  state — `creation_source` is a single immutable-at-write field, closer to
  `media_asset.source`'s shape than to a bolt-on table).
- **`packages/marketplace/src/licensing.ts`** / **`packages/api/src/services/planner.ts`**:
  **extend** — each existing insert gains exactly one field
  (`creationSource`); zero behavior change, zero new tests needed for their
  existing logic (only a new assertion that the field is set correctly).
- **`apps/web/app/(workspace)/workspace/itinerary-days.tsx`**: **reuse,
  unmodified** — already renders `Item[]` with optional `pricing` correctly;
  a manually-created item needs no new rendering code.
- **`apps/web/lib/planner-form.ts`**: **reuse** — the destination/dates/party
  field components the AI-planner's trip-request form already has are the
  same fields `createManual`'s input needs (research D5); the manual-entry
  form composes them with new day/item-builder fields rather than
  reimplementing destination/date/party inputs.
- **`apps/web/lib/itinerary-list.ts`**: **extend** — new
  `formatOriginBadge()` pure function alongside the existing
  `formatLicensedCopyBadge()`/`formatListedBadge()`, same file, same pattern.
- **New package**: **none** — no capability here is orthogonal enough to the
  existing itinerary service to justify a new package (extraction threshold
  not met, same reasoning as spec 021).
- **New UI form component** (`manual-itinerary-form.tsx`): **new** —
  genuinely novel surface (no existing repeatable day/item-builder form
  exists anywhere in `apps/web`, confirmed by search); justified because the
  AI-planner's form is a single-shot field set (destination/dates/budget),
  not a repeatable multi-day/multi-item builder.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
