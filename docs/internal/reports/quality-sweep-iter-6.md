# Quality Sweep — Iteration 6

**Date**: 2026-07-15 03:26 PKT
**Cadence**: 3rd iteration (`runtime.review_interval`), oracle green (lint PASS, 573/573 tests DB-inclusive, L3 smoke 46/46, compose-log scan clean of unexpected errors)
**Previous sweep**: iteration 3 (2026-07-11) — that report itself was lost to a squash-merge (`REGRESS-ARTIFACT-LOSS`, `docs/internal/reports/quality-sweep-iter-3.md` never survived on disk); this sweep compares against iteration 3's `loop-state.md` summary as the only surviving baseline.

## Provenance note

This regress run found **six orphaned `rescue/iter-6-*` branches** (`89115fa`, `76a15ab`, `cfa605a`, `b530a0d`, `ac88496`, `56d1b41`) — prior iteration-6 regress attempts that auto-committed but never reached the branch this session ended up finishing on (`kitchen/iter-6`), the same artifact-loss class already open on `OPERATOR-DESK.md` as `REGRESS-ARTIFACT-LOSS`, recurring six times in one iteration rather than one. The most recent (`56d1b41`) had already run a full sweep and drafted `docs/internal/reports/quality-sweep-iter-6.md` plus two tickets that never reached the live backlog: five `quality-sweep:` cleanup tickets, and one real bug (`typecheck-break-agency-admin-booking-l3`, see below).

Rather than either blindly trust or blindly discard that orphaned work, every one of its findings was **independently re-run against current HEAD** before being accepted:
- `apps`, `packages`, `scripts` are byte-identical between this branch and `56d1b41` (`git diff --stat HEAD 56d1b41 -- apps packages scripts` is empty) — only loop-artifact files (backlog, loop-state, reports) differ, so a fresh scan was guaranteed to reproduce the same product-code findings.
- `npx knip --reporter markdown`: **identical** 8 unused-exported-types list (same files, same line:col).
- `npx depcruise --config .dependency-cruiser.cjs apps packages`: **clean**, 0 violations (210 modules, 589 dependencies).
- `grep -rn "TODO\|FIXME\|HACK\|XXX" apps packages`: **zero hits**, matches.
- `npx jscpd --min-tokens 50 --reporters consoleFull apps packages`: **17 clones** grouped into the same 5 concept clusters, same files/line ranges.
- `docker run --rm tripforge-verify pnpm run typecheck`: **reproduced** the exact 6 `tsc` errors the orphaned ticket described (see Step 3).

Every finding below is therefore first-hand-verified against this session's own HEAD, not merely copied. The 6 tickets the orphaned run drafted (5 cleanup + 1 bug) are filed into `.kitchenloop/backlog.json` under their original IDs (no duplicate-detection ambiguity if `56d1b41` is ever independently recovered); a 7th orphaned ticket (`coverage-matrix-group-travel-dimension`) was **not** ported — it duplicates the already-tracked `17840666553970558336` + `OPERATOR-DESK` row `GROUP-TRAVEL-DIMENSION`.

## Summary

| Category | Iter 3 (baseline, from loop-state.md) | Iter 6 | Trend |
|---|---|---|---|
| Dead code (knip unused exported types) | 2 unexported types (delta) | 8 unused exported types | up (see note) |
| Duplication (jscpd clusters) | not recorded | 17 raw clone pairs → 5 concept-level clusters | new baseline |
| TODO/FIXME/HACK/stub debt | none | none | flat (clean) |
| Architecture boundary (depcruise) | clean | clean (0 violations) | flat (clean) |
| Regression-oracle blind spot | n/a | `pnpm run typecheck` fails repo-wide, invisible to lint+test | **new finding** |
| Spec↔code completeness | specs 012-014 fully implemented+tested | specs 015-027 fully implemented+tested, zero CODE-MISSING/SPEC-SILENT gaps | flat (clean) |

Dead-code/duplication counts aren't a strict apples-to-apples trend against iteration 3 (iterations 4/5 ran no sweep, and the iter-3 report itself is gone) — reported as a fresh count, not claimed as "grew 2 sweeps in a row."

## Step 1: Dead Code

`npx knip --reporter markdown`:

- **Unused dependency (1)**: `react-dom` (`apps/web/package.json:24`) — Next.js's implicit-peer wiring for hydration, no direct import anywhere. Not ticketed (established false-positive class from prior sweeps).
- **Unused devDependencies (5)**: `@types/react-dom`, `tsx`, `eslint`, `jscpd`, `turbo` — all CLI tools invoked via `package.json` scripts, never imported in source. Not ticketed (same accepted-noise class the iteration-3 sweep already tuned for).
- **Unlisted binaries (34)**: every per-package `eslint`/`tsc`/`vitest`/`next`/etc. script binary across the pnpm workspace — knip's known limitation with pnpm's hoisted binary resolution. Not ticketed.
- **Unused exported types (8)**: `CuratedActivityFixture`, `CuratedTransferFixture`, `CuratedOfferFixture`, `CuratedCityCatalog` (`packages/supply-adapter/src/sandbox/curated-catalog.ts:11,20,25,32`), `RecentActivityKind` (`packages/api/src/services/dashboard-stats.ts:28`), `AnySupplyPort` (`packages/api/src/services/booking/shared.ts:15`), `UploadMediaServiceInput` (`packages/api/src/services/media.ts:24`), `ApplyItineraryEditArgs` (`packages/domain/src/edit.ts:40`). Recurring, real, actionable class — but each is inference-load-bearing or newly landed with its own feature (media upload, dashboard stats, booking, edit) and none individually crosses the extraction threshold. **Not ticketed this pass** — flagged for the next sweep to re-check if the count keeps climbing rather than draining.

## Step 2: Duplication & Compactness

`npx jscpd --min-tokens 50 --reporters consoleFull apps packages`: **17 clone pairs**, grouped into 5 concept clusters, each filed as an `improvement` ticket per the "Shared helper" extraction threshold (`.claude/skills/typescript-clean-architecture/SKILL.md` — hoist when the shape encodes a domain rule and 2+ modules could reasonably want it):

1. **`group-travel`/`marketplace` 4-layer clone** (6 pairs) — PR #61 scaffolded group-travel by mirroring marketplace's router (`requireDb`/`actorOf`), service (scoped-ownership lookup), panel (`loadItineraries`/`currencyOf`), and form (field-read util + picker states) near-verbatim. Ticket (medium): `17840622283032853687`.
2. **`packages/llm/src/anthropic.ts` internal streaming-loop clone** (3 pairs, same file) — the tool-list + for-await progress/result loop is duplicated between draft-stream and chat-edit-stream. Ticket (medium): `17840622283032856099`.
3. **SSE-subscription-cleanup idiom** (3 pairs: 2 within `planner.tsx`, 1 shared with `chat-panel.tsx`) — the `activeSubscription` ref + unmount-unsubscribe effect hand-rolled 3 times. Ticket (low): `17840622283032829563`.
4. **4 small single-cluster clones** — `itineraries.ts` item-in-place update, `workspace-media.ts` source validation, `domain/edit.ts` category-fit mapping, `itinerary-days.tsx`/`itinerary-list.tsx` media-thumbnail rendering. Bundled into one low-priority ticket (none individually crosses the extraction threshold): `17840622283032862499`.
5. **`seed-demo.ts` self-clone** in the per-itinerary demo-booking loop — dev/demo script only, no production path. Ticket (low): `17840622283032850078`.

No file exceeded the 400-line threshold and no function exceeded 60 lines in this pass.

## Step 3: Completeness

- **TODO/FIXME/HACK/XXX**: zero hits across `apps`/`packages`.
- **Stub scan**: zero `not implemented` throws, zero empty catch blocks, zero unjustified `@ts-expect-error`/`eslint-disable`.
- **Spec↔code completeness**: every spec merged since iteration 3 (015 content-library-v0 through 027 media-file-upload) has code + tests for its functional requirements. No CODE-MISSING or SPEC-SILENT findings this pass.
- **Regression-oracle blind spot (new finding, filed as a bug, not a cleanup ticket)**: `docker run --rm tripforge-verify pnpm run typecheck` (`tsc --noEmit` via turbo, in-image) currently fails:
  - `packages/api/src/__tests__/l3-agency-admin.test.ts:83,101,114,115` (TS2345) — `sessions[name]` on `Record<string, SessionContext>` returns `SessionContext | undefined` under `noUncheckedIndexedAccess`, but `callerFor(session: SessionContext | null)` doesn't accept `undefined`.
  - `packages/api/src/__tests__/l3-booking.test.ts:396,405` (TS18048) — `const [toBook, ...rest] = heldItems` destructures a possibly-empty array; `toBook` is `HeldItem | undefined` under strict TS even though the preceding `expect(heldItems.length).toBeGreaterThan(1)` proves it defined at runtime.
  - Both are the same bug class PR #63 fixed elsewhere in the repo hours earlier (repo-wide typecheck break, chat-edit import + latent cascade). `pnpm test` (vitest) and `pnpm run lint` (eslint) both stay green through this because neither enforces the full strict tsconfig (`noUncheckedIndexedAccess`) the way `tsc --noEmit` does — invisible to every gate the loop currently runs. Filed as bug ticket `typecheck-break-agency-admin-booking-l3` (medium) and desk row `TYPECHECK-GATE-GAP` (should `pnpm run typecheck` join the regression oracle — a sealed-gate change, operator decision per DIRECTIVE #2).

## Step 4: Architecture Boundary Conformance

`npx depcruise --config .dependency-cruiser.cjs apps packages`: **clean** — 0 violations (210 modules, 589 dependencies cruised).

## Tickets Filed This Sweep

| Ticket | Type | Priority |
|---|---|---|
| `17840622283032853687` | improvement | medium |
| `17840622283032856099` | improvement | medium |
| `17840622283032829563` | improvement | low |
| `17840622283032862499` | improvement | low |
| `17840622283032850078` | improvement | low |
| `typecheck-break-agency-admin-booking-l3` | bug | medium |

All deduped against the 91 pre-existing tickets in `.kitchenloop/backlog.json` (89 done, 2 open) — no collisions. Backlog now sits at 89/98 done (90.8%).
