# Quality Sweep — Iteration 9

**Date**: 2026-07-22 (loop runtime)
**Cadence**: 3rd-iteration (`runtime.review_interval`), oracle green (lint PASS, 621/621 tests DB-inclusive, L3 smoke 46/46, compose-log scan clean of unexpected errors)
**Previous sweep**: iteration 6 (2026-07-15), `docs/internal/reports/quality-sweep-iter-6.md`
**Branch**: kitchen/iter-9 (base `campaign/two-sided-surface`, HEAD `75dc2ff`)
**Tooling**: ran in-image (`tripforge-verify:iter9`) — host `pnpm`/`npx` denied this session (desk `ENV-PNPM-DENY`); completeness greps on the host (darwin grep supports `--include`).

## Backlog-lineage note (affects dedupe)

The active backlog on `campaign/two-sided-surface` is a **different lineage** from iteration 6's. All of iter-6's five duplication tickets (`17840622283032853687`, `…856099`, `…829563`, `…862499`, `…850078`) and its typecheck bug are **absent** here — lost to the known `REGRESS-ARTIFACT-LOSS` squash-merge divergence (iter-N loop-artifact commits don't reach the campaign base; only PR-merged product changes do). Meanwhile every iter-3-era quality-sweep ticket IS present and **`done`** (knip-baseline removal `17835183621278801481`, LLM offer-serialization `17835183631278810084`, shared auth-form primitives `17836062783099932400`, workspace-page scaffold `17836940014232506645`, marketplace-panel split `17836940014232506647`, schema split `…648`, consumer-surface sweep `consumer-surface-quality-sweep`, …). So the current findings are deduped against **12 open tickets** (3 in_review + 9 backlog), none of which is a dead-code/duplication ticket.

## Summary

| Category | Iter 6 | Iter 9 | Trend |
|---|---|---|---|
| Dead code (knip unused exported types) | 8 | 9 (+`MarketingNavPage`) | up 1 — accepted inference/API-surface residue (not ticketed, see Step 1) |
| Duplication (jscpd) | 17 clones | 22 clones, 1.13% (over 1% threshold) | **up** — campaign mirror-scaffolding of the 2nd surface (WATCH) |
| TODO/FIXME/HACK/stub debt | none | none | flat (clean) |
| Architecture boundary (depcruise) | clean (0) | clean (0 violations, 209 modules / 520 deps) | flat (clean) |
| Regression-oracle typecheck blind spot | `tsc` fails repo-wide (6 test-file errors) | **RESOLVED** — `pnpm run typecheck` exit 0, 9/9 pkgs | **fixed** |
| Spec↔code completeness | specs 015-027 clean | no new CODE-MISSING; the 1 incomplete-impl (BUG-1) already triaged; FEAT-1 tracked | flat (clean) |

**Header drift flag (WATCH, not a confirmed 2-sweep drift):** duplication rose 17→22 clones and knip 8→9 in the one sweep since iter-6. The driver is identified and structural: the `campaign/two-sided-surface` build-out grew the *second* surface (traveler/client + group-travel) by **mirroring the first** (agent/marketplace) near-verbatim — re-introducing clone shapes that earlier sweeps had drained. This is exactly the "quality debt must trend down, not up" signal; two tickets filed below. It is not yet a confirmed two-sweeps-in-a-row climb (iter-6 is the only prior comparable jscpd count), so it is flagged as a WATCH for iter-12 to confirm-or-clear rather than escalated to the operator.

## Step 1: Dead Code

`npx knip --reporter markdown`:

- **Unused exported types (9)**: the 8 from iter-6 (`CuratedActivityFixture`/`CuratedTransferFixture`/`CuratedOfferFixture`/`CuratedCityCatalog` in `packages/supply-adapter/src/sandbox/curated-catalog.ts`, `RecentActivityKind` in `dashboard-stats.ts:28`, `AnySupplyPort` in `booking/shared.ts:15`, `UploadMediaServiceInput` in `media.ts:24`, `ApplyItineraryEditArgs` in `domain/src/edit.ts:40`) plus **new** `MarketingNavPage` (`apps/web/app/components/marketing-nav.tsx:14`). Verified `MarketingNavPage` is the closed `"home"|"travelers"|"agents"` prop type of `MarketingNav`, consumed by the three marketing pages via string literals — an API-surface/documentation type export, not dead code (removing the `export` would only relocalise it). The whole class is inference-load-bearing or feature-API-surface; the removal tickets that could apply (`17835183621278801481`, `17837868188793101812`) already ran to `done` and left exactly this residue. **Not ticketed** (same accepted-noise call as iter-6); the +1 is a fresh feature type, not debt accretion. Re-check at iter-12: if it keeps climbing without draining, revisit.
- **Unused (dev)dependencies + unlisted binaries**: unchanged accepted-noise classes (Next's `react-dom` implicit peer; CLI tools invoked via scripts; pnpm hoisted-binary resolution). Not ticketed.

## Step 2: Duplication & Compactness

`npx jscpd --min-tokens 50 --reporters consoleFull apps packages`: **22 clone pairs, 1.13%** (over the configured 1% threshold in `.jscpd.json`). Clustered:

1. **group-travel ↔ marketplace mirror (medium)** — group-travel was scaffolded by copying marketplace near-verbatim across all four layers:
   - router guard `requireDb`/`actorOf` — `group-travel.ts:15-31` ↔ `marketplace.ts:15-31`
   - service scoped-ownership lookup — `group-departures.ts:49-56` ↔ `listings.ts:54-61`
   - panel loading/empty-state shell — `group-travel-panel.tsx:42-51,60-72` ↔ `marketplace-panel.tsx:57-66,75-87`
   - form field-read util + picker states — `group-departure-form.tsx:14-24,43-60` ↔ `listing-form.tsx:20-30,50-67`
   Filed: **`qs9-two-sided-mirror-duplication`** (improvement, medium). (Note: `goal-group-trips` is an open backlog feature — the fix may land naturally when group-trips is generalized; ticket exists so it's tracked, not lost.)
2. **Residual small clones (low)** — bundled into one ticket, none crosses the extraction threshold alone:
   - `packages/llm/src/anthropic.ts` draft-stream vs chat-edit-stream tool-loop (4 internal pairs, `169-204`↔`218-252`, etc.)
   - client↔workspace auth **handler** wiring (`client-sign-in-form.tsx`/`client-sign-up-form.tsx` ↔ `sign-in-form.tsx`/`sign-up-form.tsx`) — the presentational primitives are ALREADY shared via `lib/auth-form.js` (`CredentialsFields`/`SubmitButton`/`SubmitError`/`useSubmitState`, the drained `17836062783099932400`); only the `useState(email/password)` + `signInWithEmail` + error-string `handleSubmit` body is still duplicated, and the two legitimately differ in redirect (client → `returnTo`, workspace → `/dashboard`+refresh). A shared `useCredentialsSignIn(onSuccess)` hook would close it.
   - `sign-in/page.tsx` ↔ `sign-up/page.tsx` shell (`14-25`)
   - `client-view.ts:174-180` ↔ `itineraries.ts:573-578` item mapping; `workspace-media.ts` internal source-validation; `domain/edit.ts:127-136`↔`81-90` category-fit; `itinerary-days.tsx`↔`itinerary-list.tsx` media-thumbnail; `planner.tsx`/`chat-panel.tsx` SSE-subscription cleanup; `seed-demo.ts` per-itinerary demo-booking self-clone (dev script only).
   Filed: **`qs9-residual-duplication-clusters`** (improvement, low).

No file exceeded the 400-line threshold and no function exceeded 60 lines this pass (the iter-3 splits of `booking.ts`/`marketplace-panel.tsx`/`schema.ts` hold).

## Step 3: Completeness

- **TODO/FIXME/HACK/XXX**: zero hits across `apps`/`packages` (`--include=*.ts,*.tsx`).
- **Stub scan**: zero production `not implemented` throws / empty catches. The only hits are TEST scaffolding — `l3-planner-verification.test.ts` fake-port methods that throw `"not used by the planner draft path"` (deliberate test doubles), and `@ts-expect-error` sites in `media-store.test.ts`/`l3-media.test.ts`/`l3-trip-handoffs.test.ts`/`media-source-refusal.test.ts`, each carrying a justifying comment ("deliberately outside the closed MediaSource set" / "deliberately omitting the required field to prove server-side validation"). All justified.
- **Regression-oracle typecheck blind spot — RESOLVED.** `pnpm run typecheck` (`tsc --noEmit` via turbo, in-image) is now **clean** (exit 0, 9/9 packages) — the 6 test-file errors iter-6 found and iter-7/8 confirmed persisting (`l3-agency-admin.test.ts` 4× TS2345 + `l3-booking.test.ts` 2× TS18048) are fixed in the merged tree. The bug ticket `typecheck-break-agency-admin-booking-l3` (currently `in_review`) has no reproducing break → flag for the backlog phase to move to `done`. The separate sealed-gate question (should `tsc` JOIN `verification.oracle`?) is unchanged and remains an operator decision; the fix rode in on a merge, not on a gate, so the class can silently return.
- **Spec↔code completeness**: the one incomplete-implementation this iteration (BUG-1: keyless "adjust" drops a mid-conversation correction) is already a triage ticket (`chat-keyless-adjust-drops-correction`); the deferred FEAT-1 (consumer-surface chat-first builder, GOAL D3 second half) is tracked as open backlog feature `goal-consumer-planner`. No new CODE-MISSING or SPEC-SILENT finding.

## Step 4: Architecture Boundary Conformance

`npx depcruise --config .dependency-cruiser.cjs apps packages`: **clean — 0 violations** (209 modules, 520 dependencies cruised). Domain imports no adapters; itinerary types only from `packages/itinerary-schema`; supplier shapes only inside `packages/supply-adapter`; money math only in `packages/domain`. The campaign's two-sided-surface additions introduced no boundary DRIFT.

## Tickets Filed This Sweep

| Ticket | Type | Priority |
|---|---|---|
| `qs9-two-sided-mirror-duplication` | improvement | medium |
| `qs9-residual-duplication-clusters` | improvement | low |

Both deduped against the 12 open tickets (none was a dead-code/duplication ticket). Kebab-slug IDs used deliberately (avoids the `$RANDOM` collision class, `17836940774246715639`). The dead-code (9 unused types) and typecheck findings were **not** ticketed — the former is accepted inference/API-surface residue with drained removal tickets, the latter is now RESOLVED (flagged for grooming to close `typecheck-break-agency-admin-booking-l3`).
