# Investigation: UAT verdict comments missing on PRs #26/#27 (ticket loop-uat-gate-comment-missing)

**Author:** Kitchen Loop iteration-3 execute (2026-07-10)
**Ticket:** loop-uat-gate-comment-missing (diagnosis only — fixes touch the sealed regulator, see desk row UAT-VERDICT-DURABILITY)
**Question:** does the uat-evaluator step still run for sealed-card PRs and merely fail to post, or is it being skipped — and where does the post step drop?

## Answer

The evaluator step is **not being systematically skipped**. Both misses are
**session-lifecycle deaths between PR creation and the comment post** — two
different deaths, same structural weakness: the UAT verdict has no durable,
crash-surviving record until the `gh pr comment` post succeeds.

### PR #26 (seed-0009c) — gate never started: session died on API credits

Transcript witness: `~/.claude/projects/-Users-hassansaleem-Desktop-tripforge--claude-worktrees-kitchen-iter-3/798af106-7131-4153-a72d-6f1a6c18798c.jsonl`

| Time (UTC, 2026-07-09) | Event |
|---|---|
| 20:23:26.483 | `gh pr create` returns `https://github.com/disrupt-gt/tripforge/pull/26` |
| 20:23:27.819 | next assistant turn: **“Credit balance is too low”** — transcript ends |
| 20:27:47 | operator merges #26 (PRM-SEAL-26, knowingly without the gate — e2e negatives + Live Test cited) |

The session died **one second** after PR creation, before UAT-gate step 12a
(card validation) could begin. No evaluator was spawned; nothing existed to
post. This is another instance of the known credit-exhaustion failure mode
(the loop force-sources the depleted `.env` key — see loop memory
`loop-oauth-fallback-unblocks-depleted-key`).

### PR #27 (seed-0009d) — gate ran, verdict ORPHANED: parent interrupted while waiting

Transcript witnesses: parent `d9b55d8b-07ee-4be6-935c-d117bfdd31c2.jsonl`, evaluator
`d9b55d8b…/subagents/agent-ac50bc837012ff263.jsonl`, evidence
`/tmp/uat-seed-0009d/.kitchenloop/uat-runs/seed-0009d/evidence.md`.

| Time (UTC, 2026-07-10) | Event |
|---|---|
| 09:25:16 | execute session starts (seed-0009d cycle) |
| 10:02:54 | PR #27 created (body promises “Evaluator verdict will be attached as a PR comment”) |
| 10:04:50 | uat-evaluator spawned (haiku, pinned checkout `/tmp/uat-seed-0009d`) — async; parent says “the harness will notify me when it returns” |
| 10:14 | evaluator finishes writing `evidence.md` — **`**Overall:** PRODUCT_FAIL`** |
| 10:15:09.747 | evaluator transcript: `[Request interrupted by user]`; parent’s last entry (queue-operation) same moment — **session killed before the verdict was consumed** |
| 10:49–10:55 | operator hand-runs the sealed card from the root repo — PASS 12/12 (`.kitchenloop/uat-runs/seed-0009d/`) |
| 11:06:36 / 11:06:51 | operator posts hand-run verdict / merges #27 |

The integrity check, verdict parse, and comment post are all parent-side steps
(UAT-GATE.md steps 4–6); the parent never ran again, so a completed
**PRODUCT_FAIL** verdict was silently dropped into an unwatched `/tmp` worktree.

### The dropped PRODUCT_FAIL was substantive (now ticketed)

The loop evaluator witnessed: seller fills “Revenue share %” with **7.5** →
Step-4 submission refused (not vetted, as the card expects) → the field
**snapped back to the 10 default** → the Step-6 retry listed at **10%**
(split 225.00 + 25.00 of 250.00). The operator’s hand-run of the same card at
the same HEAD had 7.5% stick (PASS). Code inspection
(`apps/web/app/(workspace)/marketplace/marketplace-panel.tsx:101-122`) shows
values are NOT reset on refusal — the snap-back is the controlled-input
symptom of a fill that never committed to React state, so it is either an
interaction-dependent product bug or a Playwright-MCP fill artifact. Either
way the declared-terms path deserves a deterministic repro: filed as
**seed-0009d-b** (bug, medium; escalation criteria in the ticket). The
recovered evidence was posted to PR #27 as a late comment for the record.

## Systemic weaknesses (fix proposals — ALL sealed-regulator, operator gate)

1. **Verdict durability.** The verdict lives only in the parent’s pending
   subagent turn + a `/tmp` worktree until step 6 posts it. Any parent death in
   the spawn→post window silently drops the gate — even a PRODUCT_FAIL.
   Proposal: UAT-GATE.md orders the evaluator to write evidence into the
   REPO’s `.kitchenloop/uat-runs/<ticket>/` (root repo, not the throwaway
   checkout), and the parent posts the comment straight from `evidence.md`
   as its FIRST action after return, before parsing/acting.
2. **Sealed-card PRs never face the fail-closed check.** Every UI PR ships a
   new `.kitchenloop/uat-cards/<ticket>.md`, trips the sealed-path guard, and
   is hand-merged by the operator — so the pr-manager’s “UAT Gate Results
   comment must exist” check (which fails closed for loop merges) never gates
   exactly the PRs most in need of it. #23–25 had comments only because those
   sessions survived long enough to post. Proposal: the PRM-SEAL hand-merge
   checklist requires “UAT comment present or explicit per-PR waiver row”.
3. **No orphan-verdict recovery.** Nothing scans for completed-but-unconsumed
   evaluator runs. Proposal: execute Step 0 (stale-ticket recovery) also
   checks `/tmp/uat-*` and `.kitchenloop/uat-runs/` for evidence newer than
   the ticket’s PR comment set.

All three touch the UAT protocol / pr-manager stages — sealed regulator files
the loop may not change. Desk row **UAT-VERDICT-DURABILITY** carries the ask.
