# Loop Review: Iterations 6 – 8

**Date**: 2026-07-22 (loop runtime)
**Reviewer**: KitchenLoop automated loop-review (autonomous run)
**Range**: iterations 6, 7, 8 (explicit)
**Report path**: `docs/internal/reports/loop-review-iter-6-8.md`
**Ticketing provider**: `none` (local `.kitchenloop/backlog.json`)
**Blocker count**: 1 (operator-gated — existing desk row, escalated; no new loop ticket)
**Health assessment**: **WARNING** — product output is healthy (all oracle gates green, coverage climbing, external audit clean, zero product regressions), but a chronic loop-**governance** defect (REGRESS-ARTIFACT-LOSS) is now demonstrably dropping operator gates, and a real typecheck blind spot has gone unfixed for three consecutive iterations.

---

## Executive Summary

Across iterations 6–8 the loop shipped a large body of green, gated work — a 14-PR
execute burst (iter 6), the bootstrap of the operator-authorized `campaign/two-sided-surface`
(two-sided landing pages, traveler home, premium UX restyle, chat-first build-to-book), and
two rigorous consumer-surface gap-analysis scenarios that mapped and mechanically witnessed
the campaign's own execute queue. Every regress checkpoint was 100% green (lint + vitest +
L3 smoke against the live compose stack); coverage rose 30/36 → 33/36 (83.3% → 91.7%); the
external auditor (Codex) inspected the money-adjacent merged product PRs and found no issues.

The concerns are **not in the product** — they are in the loop's own machinery. The
long-standing **REGRESS-ARTIFACT-LOSS** defect recurred materially in all three iterations
(six orphaned rescue branches in iter 6; the same operator ask re-filed three times because
iteration-worktree edits never reach the campaign base branch; a money-adjacent PR's seal-merge
gate surviving only as an uncommitted working-tree edit). That directly violates the loop's own
"a gate not on the desk was not asked" contract. Separately, a verified 6-error typecheck break
in test files has been invisible to every merge gate since iteration 6 and its fix ticket had
stalled unpromoted in `backlog`.

---

## Quality Work Performed

**The loop's product output over this window was strong and honest.** It led with real coverage
gains, a clean external audit, and disciplined trust-boundary verification.

### Work Ledger

| Iter | Date | Tier / Scenario | PRs merged | Tests | Coverage | Notable |
|------|------|-----------------|-----------|-------|----------|---------|
| 6 | 2026-07-15 | T1 · `fresh-draft-client-view` | #60–#73 (14, prior remote) | 483 → **573** | 28 → **30/36** | Found + fixed the `derive-coverage.mjs` hard-crash (BUG-1); 3rd-iter quality sweep filed 6 tickets; media-upload security hardening |
| 7 | 2026-07-21 | T2 · `traveler-self-book-attempt` | #74–#85 span (prior remote) + campaign **#2** (landing), **#3** (traveler home), **#5** (premium UX), #4 (iter chore) | 573 → **619** | 30 → **31/36** | Campaign bootstrap; mapped the marquee money-path gap (`Book it myself` is a stub, `booking×web×client=fail`) with a 29-check L3 witness |
| 8 | 2026-07-22 | T3 · `traveler-marketplace-attempt` | **#7** chat-first build-to-book (operator-sealed, merged 21:57) | 619 (iter tree) / 621 (on #7 branch) | 31 → **33/36** | Mapped the last consumer-marketplace cells (`marketplace×{web,api}×client=fail`); trust boundary proven airtight; 22-check L3 all-pass; **zero product bugs** |

> Timeline note: the prior GitHub remote's PR numbers (#54–#85) were reset when the repo moved to
> a new remote (`hassaansaleem-bit`, PR numbering restarted at #1). Iteration 6 is the last
> pre-campaign iteration (2026-07-15); iterations 7–8 run on `campaign/two-sided-surface`
> (2026-07-21+). The campaign PRs #2/#3/#5/#7 all merged on 2026-07-21, so the iter-7/iter-8
> attribution above follows the loop-state's own span accounting, not distinct calendar days.

### Aggregate Value Summary

In three iterations the loop validated **3 realistic scenarios** (one per tier: T1 coverage
cross-check, T2 traveler self-book composition, T3 traveler-marketplace frontier), grew the test
suite from **483 → 619** (DB-inclusive, 100% pass throughout), lifted spec-surface coverage from
**83.3% → 91.7%** (all six `marketplace × {web,api} × user_type` cells now exercised), bootstrapped
the two-sided-surface campaign, and shipped premium UI plus a chat-first build-to-book planner.
It found and fixed one real tooling bug (the coverage-derivation crash), hardened the media-upload
path (magic-byte validation), and produced two durable L3 regression witnesses that pin the
consumer surface's trust boundary as structurally closed to travelers.

### Highest-Impact Finds

1. **`derive-coverage.mjs` hard-crash on an out-of-vocabulary coverage block (iter 6, BUG-1).**
   PR #61 (group-travel) shipped a `KITCHENLOOP-COVERAGE` block naming a `group-travel` feature
   and `agent` user_type that don't exist in `kitchenloop.yaml`'s dimension vocabulary; the
   validator threw on first mismatch, blocking *all* coverage regeneration. Caught the moment
   anyone re-ran the tool; would otherwise have blinded the next regress checkpoint. Fixed
   in-iteration; the underlying "should group-travel become a 7th dimension" question was correctly
   escalated to desk row `GROUP-TRAVEL-DIMENSION` rather than decided unilaterally.

2. **The campaign's marquee money-path gap, witnessed not asserted (iter 7, BUG-1/FEAT-1).**
   `Book it myself` is a confirmation-only stub: a live browser trace showed **zero** server calls
   and the DB `booking_component` count was unchanged; `clientView.book` does not exist and the
   agent-side `workspace.booking.book/.quote` are correctly `FORBIDDEN` to a traveler (INV-024).
   Mechanically pinned by `traveler-self-book-attempt/scenario.mjs` (29 checks). This is the
   headline the `/for-travelers` landing already promises — the loop turned an aspiration into a
   reproducible, prioritized execute target.

3. **Trust boundary proven airtight one layer out, at the marketplace (iter 8).** A signed-in
   traveler is `FORBIDDEN` on `browse/license/rate`, an anonymous caller is `UNAUTHORIZED`, no
   consumer `clientView` marketplace/discover/book procedure exists (each `NOT_FOUND`), and the
   whole journey conserves state (zero new `marketplace_license`, zero new `itinerary`). The
   trade/money path is structurally closed to consumers — exactly what Constitution VI requires.

### Coverage Expansion

Untested → validated during the window: `itinerary-builder × {api,web} × client` (iter 6,
cross-checked against Postgres ground truth on both surfaces), `content-library × web × agent-seller`
(iter 6, real device upload), `trust × api × client` (iter 7, PASS), `booking × web × client`
(iter 7, `fail` = the self-book stub gap), and `marketplace × {api,web} × client` (iter 8, both
`fail` = consumer-marketplace capability gaps). Net: 83.3% → 91.7%, with only 3 combos left
untested (`content-library × web × agent-reseller`, `revenue-share × web × {agent-seller,client}`).

---

## Metrics

| Metric | Start (iter 6) | End (iter 8) | Trend |
|--------|----------------|--------------|-------|
| Pass rate | 100% (573/573) | 100% (619/619) | stable ✅ |
| Test count | 573 | 619 (621 on the unmerged #7 branch) | +46 ▲ |
| L3 smoke | 46/46 | 46/46 | stable (iter-7 "47/47" was a count anomaly, reconciled) |
| Coverage | 30/36 (83.3%) | 33/36 (91.7%) | +3 combos ▲ |
| Tickets created (window) | — | 22 | — |
| Backlog done% | 90.8% | 90.3% | ~stable |
| Net backlog | 98 total / 9 open | 113 total / 11 open | +15 total, +2 open |
| PRs merged (campaign remote) | — | #2, #3, #4, #5, #7 | — |
| Avg product-PR quality | — | **Good** (Codex + gates clean) | — |
| Typecheck (investigative) | FAIL (6 errors) | FAIL (same 6 errors) | **unfixed 3 iters** ▼ |

---

## Scenario Coverage

| Iter | Tier | Scenario | Result |
|------|------|----------|--------|
| 6 | T1 | `fresh-draft-client-view` — API payload + rendered `/view` HTML cross-checked vs Postgres | PASS (66/66) |
| 7 | T2 | `traveler-self-book-attempt` — traveler reads/attaches/handoffs a shared trip, cannot self-book | PASS (29/29); surfaced the self-book stub gap |
| 8 | T3 | `traveler-marketplace-attempt` — traveler tries to browse/act on a listed itinerary | PASS (22/22); mapped the consumer-marketplace gap, no product bug |

Tier balance was deliberate and healthy: T1 (iter 6) corrected an under-weighted foundation slot;
T2/T3 (iters 7/8) probed the fresh campaign's frontier where the deliverable is a gap map, not a
bug list.

---

## Findings

Disposition key: **[ticketed]** = a loop ticket was created/updated by this review;
**[operator-gated]** = touches a DIRECTIVE ALWAYS-HALT / sealed area → belongs on `OPERATOR-DESK.md`,
never a loop ticket (an existing row already covers it — escalated, not duplicated);
**[report-only]** = tracked here, no clean ticketable action.

### Blockers

#### BLOCKER-1 — REGRESS-ARTIFACT-LOSS is silently dropping operator gates *(loop-behavior)* **[operator-gated]**

- **Source**: Regression iter 6/7/8 (loop-state Warnings); `OPERATOR-DESK.md` row `REGRESS-ARTIFACT-LOSS` (open since 2026-07-09).
- **Description**: The orchestrator's post-phase auto-commit lands loop artifacts (loop-state, desk rows, backlog snapshots, sweep reports) on the *worktree's current branch*, which for a campaign iteration is a `kitchen/iter-N` branch forked from `campaign/two-sided-surface`. Only PR-merged product changes flow back to the campaign base, so loop-artifact edits — including **operator-ask rows** — never persist. This is no longer a theoretical drift; it dropped real gates this window.
- **Evidence** (verified this review):
  - Iter 6: **six** orphaned `rescue/iter-6-*` regress attempts (`89115fa`, `76a15ab`, `cfa605a`, `b530a0d`, `ac88496`, `56d1b41`) — a completed quality sweep + a typecheck-break ticket nearly lost, recovered only by independent re-verification.
  - Desk row `TYPECHECK-GATE-GAP` was **re-filed three times** (iter 6, 7, 8) because each filing failed to persist. Confirmed by diff: `git show campaign/two-sided-surface:OPERATOR-DESK.md` does **not** contain `TYPECHECK-GATE-GAP`; it lives only on this iter-8 worktree's committed desk (which itself will be squashed away on merge).
  - `PRM-SEAL-7` — the operator seal-merge gate for the **money-adjacent** chat-first build-to-book PR — existed *only* as an uncommitted working-tree edit in the root checkout, absent from the campaign branch's committed desk. (The operator did seal + merge #7 at 21:57, but the gate's durability was luck, not design.)
- **Why Blocker**: the loop's core governance contract is "a gate that is not on the desk was not asked" (DIRECTIVE §5). A persistence mechanism that routinely evaporates desk rows breaks that contract at the root, and has historically merged over an unread UAT `PRODUCT_FAIL` (PR #27, per `uat-orphaned-verdict-recovery`).
- **Recommendation**: prioritize the **existing** `REGRESS-ARTIFACT-LOSS` desk row (authorize the `kitchenloop.sh` fix to target `kitchen/iter-N` — or a dedicated loop-state branch — for phase-artifact commits regardless of the checked-out branch). The fix touches the orchestrator (loop machinery, operator-gated), so this review does **not** file a loop ticket or a duplicate row — it escalates the existing row with the new iter-6/7/8 evidence.

### Important

#### IMPORTANT-1 — Typecheck blind spot: 6 test-file type errors invisible to every merge gate, unfixed for 3 iterations *(test-coverage / loop-behavior)* **[ticketed]**

- **Source**: Quality sweep iter 6 (Step 3); Regression iter 6/7/8 Warnings.
- **Description**: `pnpm run typecheck` (`tsc --noEmit`, in-image) exits 2 on 6 errors, **all in test files**, unchanged since iteration 6. `pnpm test` (vitest, loose types) and `eslint` both stay green, and typecheck is not in `verification.oracle`, so **no merge gate catches it**.
- **Evidence** (re-confirmed in source at HEAD this review):
  - `packages/api/src/__tests__/l3-agency-admin.test.ts` — `callerFor(session: SessionContext | null)` (line ~70) rejects the `SessionContext | undefined` produced by indexed `sessions["…"]` access under `noUncheckedIndexedAccess` (4× TS2345).
  - `packages/api/src/__tests__/l3-booking.test.ts` — `const [toBook, ...rest] = heldItems` then `toBook.quote.quoteRowId` is possibly-undefined (2× TS18048).
- **Disposition**: the fix ticket `typecheck-break-agency-admin-booking-l3` (medium) already existed but had **stalled in `backlog`**, so Execute would never pick it up. This review **promoted it `backlog → todo`** and added a comment recording the 3-iteration recurrence and its role as the named prerequisite for desk row `TYPECHECK-GATE-GAP`. (No duplicate ticket created.)
- **Related operator-gated rows** (existing, escalate — not duplicated): `TYPECHECK-GATE-GAP` (add typecheck to the oracle — sealed oracle change) and `CI-IMG-BUILD` (CI never builds the compose image, so the whole hermetic-build + type-break class is invisible to `ci_pass`).

#### IMPORTANT-2 — Regress-checkpoint cadence gap: ~12 PRs merged between two regress runs *(loop-behavior)* **[report-only]**

- **Source**: Regression iter 7 ("First regress checkpoint since iter-6 (2026-07-15)").
- **Description**: No regress checkpoint ran between iter 6 (2026-07-15) and iter 7 (2026-07-21) — a ~6-day span that merged the entire `#74–#85` tail plus the campaign bootstrap (landing, deploy CI, traveler surface). The full-suite + L3-smoke safety net therefore did not run between execute cycles for that whole span; an app-level break introduced mid-span would not have been caught until the deferred checkpoint.
- **Mitigant**: L1/L2 lint+test stayed green PR-by-PR via CI (`lint-and-test`, now also on `campaign/**` PRs), and the deferred iter-7 checkpoint came back fully green — no regression was hiding. This is the same deferred-span pattern seen benignly at iter 3.
- **Disposition**: **report-only** — the actionable lever is regress cadence/config (`runtime.review_interval`) and phase-cycle discipline during sprint-style bursts, not a code change. No ticket. Recommendation below.

#### IMPORTANT-3 — Consumer-surface honesty & mis-routing gaps *(product / process)* **[ticketed — extended existing]**

- **Source**: Experience report iter 7 (FRICTION-1/3/4, IMP-1/2) and iter 8 (FRICTION-1, IMP-1).
- **Description**: Two honest-copy defects on the consumer surface the campaign is building:
  1. `/for-travelers` advertises "plan a new trip with AI" and "book it yourself through the platform" — a traveler can do **neither** today (iter 7). Same overpromise class as the marketplace "earn a share on every resale" copy (desk `RESALE-SHARE-SEMANTICS`).
  2. A **signed-in traveler** hitting `/marketplace` or `/discover` is told to "create an account and agency" — pushed onto the *supply* side of a two-sided product (iter 8).
- **Disposition**: gap (1) is already tracked by `consumer-copy-honesty-interim`. Gap (2) was **not** covered by that ticket's original three places; this review **extended `consumer-copy-honesty-interim`** via a comment to include the `/marketplace` + `/discover` signed-in-traveler mis-routing (a cheap interim fix decoupled from the larger FEAT builds). No near-duplicate ticket created. Iteration-8's remaining ideate findings (FEAT-1..4, the consumer marketplace/discover build-outs) are the campaign's execute queue and belong to the triage/backlog phases, not to this review.

### Observations

*(Per this run's directive, Observations are reported but not auto-ticketed.)*

- **O-1 — L3 smoke count anomaly (47 vs 46)**: iter-7 loop-state recorded 47/47; `smoke.mjs` is byte-identical across the window (43 `check()` sites, one inside a 4-iteration loop → 46 executed) and iter-8 reconciled it to 46/46. No lost assertion.
- **O-2 — Backlog-state lag**: `goal-ui-depoliteform` still shows `todo` in the backlog although its PR #5 merged into the campaign branch. Cosmetic; the backlog-grooming phase reconciles ticket state.
- **O-3 — Ideate is out-running the consumer execute queue**: iters 7–8 mapped the consumer surface faster than it is being built — all five `goal-consumer-*` / `goal-marketplace-fork-whitelabel` / `goal-group-trips` deliverables sit in `backlog` while the loop keeps producing gap maps. Appropriate for a *fresh* campaign (the maps seed execute), but worth watching that gap-mapping doesn't substitute for building once the maps are complete.

---

## External Auditor Results

### Codex (`reviewers.codex.enabled: true`)

Consulted on the two money-adjacent merged product PRs — **#3** (traveler home / client-view) and
**#5** (premium UX restyle touching `booking-flow.tsx` + `planner.tsx`) — against INV-020
(client-view brand/confidential-field leaks), INV-024 (traveler → agent-only procedures), and the
server-side-integer-minor-units money rule. Codex performed live code inspection (it ran `rg`/`sed`
over `booking-flow.tsx`, `view/page.tsx`, `client-auth-shell.tsx`) and corroborated:

- **No client-side money arithmetic** in `booking-flow.tsx` — `QuoteReview`'s `heldCount` is item-count
  pluralization, not price math; prices flow through as server values.
- **Client-view stays brand-neutral** — `data-plain` + a gradient-only, `aria-hidden` story panel with
  no platform name / `◇` mark / product shot on `/view` auth and home.
- **No new server capability / trust surface** — the traveler home reads only the pre-existing
  session-keyed `clientView.me` / `clientView.myTrips`; INV-023/024 unchanged.

**Verdict: no BLOCKER/IMPORTANT findings surfaced.** (Codex spent its turn verifying rather than
emitting a final one-line tag; its investigation raised no issues and independently confirms the
"Good" product-PR quality score.)

### Gemini

Disabled (`reviewers.gemini.enabled: false`).

### Review Bot

None configured (`pr_manager.review_bot: ""` — Codex is the sole external reviewer). No unresolved
review-bot threads to reconcile. All merged product PRs carried green pr-auditor + Codex + CI gates
per the desk's PRM-SEAL resolutions; the sealed-card PRs (#3 traveler home, #7 chat-first) were
correctly held for operator hand-merge rather than self-merged.

---

## Loop Behavior Assessment

- **Scenario diversity**: **Good.** One scenario per tier (T1/T2/T3), each targeting a genuinely
  untested combo; no repetition. Tier balance was reasoned explicitly each iteration.
- **Ticket quality**: **High.** Findings carry mechanical witnesses (L3 scenarios, DB deltas, browser
  network traces), correct invariant citations (INV-020/023/024, Constitution VI), and honest
  scope/roadmap framing. Gap "fail" cells are correctly distinguished from regressions and blocked
  combos.
- **Fix rate**: healthy for *product* defects (the one real bug found — the derive-coverage crash —
  was fixed same-iteration); **poor for loop-infra debt** — the typecheck fix sat unpromoted for 3
  iterations and REGRESS-ARTIFACT-LOSS has been open since 2026-07-09.
- **Throughput**: high in iter 6 (14 PRs), then deliberately shifting to campaign build-out + gap
  mapping (iters 7–8). Consumer execute queue is seeded but not yet draining.
- **Self-improvement signal**: **mixed.** The loop is *excellent* at finding and honestly reporting
  real issues (coverage tooling, money-path gaps, trust boundaries) and at escalating operator
  decisions correctly. But it is **poor at making its own governance state durable** — the same defect
  keeps dropping the very rows that would fix it, a self-referential trap that only the operator can
  break.

---

## Recommendations

1. **Prioritize `REGRESS-ARTIFACT-LOSS` (existing desk row) — it is now the top loop-health risk.**
   Authorize the `kitchenloop.sh` change so post-phase auto-commits land loop artifacts (loop-state,
   desk rows, backlog) on a durable target (`kitchen/iter-N` or a dedicated loop-state branch)
   regardless of the checked-out branch. Until this lands, every operator ask filed from a campaign
   iteration is at risk of silently evaporating — as `TYPECHECK-GATE-GAP` (3×) and `PRM-SEAL-7`
   demonstrate.
2. **Close the typecheck blind spot.** The fix ticket `typecheck-break-agency-admin-booking-l3` is now
   in `todo` (promoted by this review) — work it, then answer `TYPECHECK-GATE-GAP` to add
   `pnpm run typecheck` to `verification.oracle` so the whole test-code type-break class becomes gate-visible.
   Pair with `CI-IMG-BUILD` (build the compose image in CI) to close the sibling hermetic-build blind spot.
3. **Don't let regress cadence lapse during sprint bursts.** ~12 PRs merged between the iter-6 and
   iter-7 checkpoints with only PR-level L1/L2 CI as the net. Run the regress gate (full suite + L3
   smoke) at least at `runtime.review_interval` even mid-campaign, so a deferred checkpoint never
   spans a whole feature bootstrap.
4. **Ship the consumer honesty interim fix now.** `consumer-copy-honesty-interim` (extended this
   review to include the `/marketplace` + `/discover` mis-routing) is copy/UX-only, INV-safe, and
   decoupled from the multi-iteration FEAT builds — it should not wait for `goal-consumer-*` to land.
5. **Begin draining the consumer execute queue.** The gap maps (iters 7–8) are complete and
   mechanically witnessed; the next iterations should convert `goal-consumer-selfbook` (critical) and
   `goal-consumer-planner`/`goal-consumer-whats-hot` into shipped, money-path-tested PRs rather than
   producing further gap analysis of the same absent surfaces.

---

## Ticket Actions Taken by This Review

| Action | Ticket / Row | Type | Rationale |
|--------|--------------|------|-----------|
| Promoted `backlog → todo` + comment | `typecheck-break-agency-admin-booking-l3` | loop ticket (Important) | Verified real, unfixed 3 iters, was stalled unpromoted; prerequisite for `TYPECHECK-GATE-GAP` |
| Extended scope via comment | `consumer-copy-honesty-interim` | loop ticket (Important) | Adds the iter-8 `/marketplace`+`/discover` signed-in-traveler mis-routing not covered by its original 3 places; avoids a near-duplicate |
| Escalated (no new row — existing) | `REGRESS-ARTIFACT-LOSS` (desk) | operator-gated (Blocker) | Touches the orchestrator (loop machinery); an open desk row already exists — escalated with new iter-6/7/8 evidence, not duplicated |
| Noted (existing) | `TYPECHECK-GATE-GAP`, `CI-IMG-BUILD` (desk) | operator-gated (Important) | Sealed oracle / CI-gate changes; existing rows |

*No new loop tickets or desk rows were created — every Blocker/Important finding either already had a
home (updated non-destructively) or is operator-gated with an existing desk row, per dedup discipline
and the DIRECTIVE ALWAYS-HALT boundary.*
