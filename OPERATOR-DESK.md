# OPERATOR DESK — what the loop is waiting on YOU for

One row per pending human gate. The loop adds a row whenever it halts for the
operator; the operator answers by saying the exact word(s) in **Say**. Cleared
rows are removed (history lives in the loop state and git log). Empty table =
nothing is asked of you.

Rules for the loop:
- Every halt-for-the-operator MUST be a row here — never buried in prose or a PR
  comment. A gate that is not on the desk was not asked.
- Each row includes one short context paragraph directly below the table row it
  belongs to: what happened, the recommendation, and what stays blocked.
- Never edit or reinterpret an existing row's **Say** word; add a new row instead.

| ID | Say | Question | Recommendation | Since | Blocks |
|----|-----|----------|----------------|-------|--------|
| CI-IMG-BUILD | `add ci image build` | Should CI build the compose image so hermetic-build breaks gate merges? | Yes — add a docker-build job to `.github/workflows/ci.yml` | 2026-07-07 | Nothing today (gap: BUG-1-class breaks stay invisible to `ci_pass`) |
| ENV-PNPM-DENY | `pnpm perms fixed` | Why did the loop harness deny ALL `pnpm` commands in the iter-2 ideate session despite the `.claude/settings.json` allowlist? | Verify/repair the harness permission wiring so allowlisted `pnpm install`/`pnpm test`/`pnpm run lint` run inside loop sessions | 2026-07-07 | In-session L1/L2 + lint verification during ideate/execute (regress runs in its own runtime and is unaffected) |
| UAT-PR14 | `waive uat pr14` | Waive the UAT-card gate for PR #14 (spec-gap-0001: docs-only sync of data-model.md to resolved D-006)? | Yes — waive: markdown-only spec amendment, no product behavior, no browser journey applies; every other merge gate is green | 2026-07-09 | Merging PR #14 (spec-gap-0001 stays open) |
| ✅ PRM-SEAL-17 (resolved) | *(done)* | PR #17 changes a sealed loop gate (`.kitchenloop/uat-cards/seed-0006.md`); the loop may not merge it. | RESOLVED 2026-07-09 — operator reviewed by hand: legitimate NEW UAT card (not an edit of an evaluated card); money path codex-gated (INV-010/011/012, conservation, concurrency, RBAC, INV-028 all PASS); merged #17. Non-money follow-ups filed: seed-0006a (seller-vetting, high), seed-0006b (PMF payload, low). | 2026-07-09 | done |
| ✅ UAT-PR18 (resolved) | *(done)* | Waive the UAT-card gate for PR #18 (QS3-1: remove/inline 20 knip-flagged unused exports — export-surface-only, no behavior change)? | RESOLVED 2026-07-09 — waived (export-surface-only, no runtime path, no browser journey applies); merged #18. | 2026-07-09 | done |
| ✅ PRM-SEAL-20 (resolved) | *(done)* | PR #20 changes a sealed loop gate (`.kitchenloop/uat-cards/seed-0006a.md`); the loop may not merge it. | RESOLVED 2026-07-09 — operator reviewed: legit new UAT card; seller-vetting fix refuses a de-vetted seller (not_vetted, state conserved), falsifiable UAT card, L3-tested; merged #20. | 2026-07-09 | done |
| ✅ PRM-SEAL-21 (resolved) | *(done)* | PR #21 sealed UAT card seed-0008.md | RESOLVED 2026-07-09 — legit new card; sign-in UI Live-Test PASS (browser journey), 254/254 tests, e2e 9/9; merged #21. | 2026-07-09 | done |
| ✅ PRM-SEAL-23 (resolved) | *(done)* | PR #23 sealed UAT card seed-0009a.md | RESOLVED 2026-07-09 — legit NEW card (absent on main, not an edit). Planner UI Live-Test PASS: rendered "Lisbon City Break — 3 Days/2 Nights" itinerary on the premium theme (operator eyed the screenshot), e2e 12/12, in-image 278/278, L3 smoke 30/30, zero-context UAT evaluator 6/6 PASS. Both paused blockers resolved (empty-itinerary = real canonicalCriteria drift, fixed; signup-403 = BETTER_AUTH_URL origin, not a product bug). No schema/money/gate weakening. Merged #23 (4fd1aa77a). Latent booking deadlock filed seed-0015 (high). | 2026-07-09 | done |
| ✅ PRM-SEAL-24 (resolved) | *(done)* | PR #24 sealed UAT card seed-0015.md | RESOLVED 2026-07-09 — legit NEW card (absent on main, not an edit). Money-path deadlock fix reviewed by hand: correct global id-order lock discipline (`lockQuoteRowsInClaimOrder` — the unordered Phase-4 recording tx + releaseClaims were the writers racing the already-ordered claim gate). Deterministic red-witness 40P01 pre-fix → 281/281 green post-fix; L3 stress asserts concurrent conservation (one winner, loser `already_consumed` on every component, no 500); stress also caught+fixed a sandbox quote-id cross-instance collision. INV-028 N/A (the singleton is the sandbox TEST engine id-tag, not a prod money singleton). Benign duplicate-key allowlist untouched. UAT evaluator PASS, e2e 12/12, smoke 33/33. Merged #24 (8542323ef). | 2026-07-09 | done |
| ✅ PRM-SEAL-25 (resolved) | *(done)* | PR #25 sealed UAT card seed-0009b.md | RESOLVED 2026-07-09 — legit NEW card (absent on main, not an edit). Booking flow UI (quote→review→book) money path made visible in the browser on the premium `.tf-booking-*` kit. FR-007 verified: zero client money arithmetic (formatters only — `formatMinorAmount`/`formatMarkupBps`; exact server minor units, INV-009/010). Live Test Verdict PASS; zero-context UAT evaluator PASS 8/8 on a fresh contamination-free stack pinned at PR HEAD; L3 smoke 33/33 (money conservation + race); e2e green. Merged #25 (849ca85b4). Screenshots auto-cleaned with the worktree — operator to eyeball the look live on main. | 2026-07-09 | done |
| ✅ PRM-SEAL-26 (resolved) | *(done)* | PR #26 sealed UAT card seed-0009c.md | RESOLVED 2026-07-10 — legit NEW card (absent on main, not an edit). Client-view UI (white-labeled shared itinerary). INV-020 verified MECHANICALLY: e2e 16/16 incl. 2 new client-view specs whose NEGATIVE assertions require "TripForge"/"Trellis" to appear nowhere in the page body OR tab title; code uses `[data-plain]` + `robots: noindex` + `toClientItineraryView` allowlist projection; money via domain `addMoney` (no new math). Live Test Verdict PASS (8-screenshot journey, 2 defects fixed in-cycle); lint clean; codex+pr-auditor gates green. NOTE: zero-context UAT gate comment absent on this PR (present on #23-25) — the passing e2e white-label negatives + Live Test cover the same ground. Merged #26 (c9d174683). | 2026-07-10 | done |
| ✅ PRM-SEAL-27 (resolved) | *(done)* | PR #27 sealed UAT card seed-0009d.md | RESOLVED 2026-07-10 — legit NEW card (absent on main, not an edit). Marketplace UI (browse cross-tenant listings / list own itinerary with terms / license → white-label copy + recorded revenue split). Money path proven THREE ways: (1) pr-auditor CLEAN all axes — split rendered verbatim from the recorded license tx (`splitTakeRate`), zero client money arithmetic; `basis-points.ts` scales a rate only; new `workspace.itinerary.list` tenant-scoped + L3-proven (INV-004/009/010/011/012, Constitution VI). (2) zero-context UAT evaluator PASS 12/12 on a fresh contamination-free keyless stack pinned at PR HEAD d6698a4 (Step 9 split 250.00=225.00+25.00 USD; Step 10 re-license refused, no double). (3) live `revenue_share_ledger` cross-check: 1 row, 25000=22500+2500 minor units, 0 conservation violations, atomic. One pr-auditor finding — PR body claimed follow-up ticket `seed-0009d-a` filed but it was absent at merge (loop wrote it to root scratch); RESOLVED by operator filing `seed-0009d-a` (rating + deactivate controls, low) in THIS reconcile commit. Ran the zero-context UAT by hand, closing the gap that recurred on #26. Merged #27 (1f79143). | 2026-07-10 | done |
| ✅ UAT-PR28 (resolved) | *(done)* | Waive the UAT-card gate for PR #28 (QS3-4 schema column-builder refactor)? | RESOLVED 2026-07-10 — waived (pure-refactor class, precedent UAT-PR18). Operator read the full diff: the named builders (`moneyMinor`/`agencyFk`/`agencyRef`/`itineraryFk`/`supplierNetColumns`/`agencySellColumns`) preserve the cascade-vs-no-cascade distinction EXACTLY (immutable trade records keep no-cascade `agencyRef`); DDL byte-identical (pg_dump witness). pr-auditor + codex Stage-4a + merge-safety APPROVE, CI green on 53907b2, 337/337 in-image tests, e2e 19/19. Merged #28 (squash b60c627). | 2026-07-10 | done |
| ✅ PRM-SEAL-29 (resolved) | *(done)* | PR #29 sealed UAT card seed-0006b.md | RESOLVED 2026-07-10 — legit NEW card (absent on main, not an edit). Marketplace PMF split event — PAYLOAD-ONLY: `take_rate_accrued` now carries priceMinor/amountMinor(platform take)/sellerCreditMinor; the license money movement (itinerary copy, marketplaceLicense, revenue_share_ledger) is UNCHANGED and revenue_share_ledger stays the source of truth. Money path proven THREE ways: (1) pr-auditor APPROVE — conservation priceMinor==amountMinor+sellerCreditMinor guaranteed BY CONSTRUCTION in domain money.ts (sellerCredit=price−take) + write-time `split_not_conserved` guard, INV-009 integer/negative + both-or-neither pairing; `pmf_take_rate` view unchanged (no double-count); two additive NULLABLE columns. (2) zero-context UAT PASS 10/10 pinned at HEAD ee12b37 with live DB witness `1|20000|2000|18000|t`. (3) CI green + L3 forced-fault zero-survivor + happy-path split assertions on real Postgres. Non-blocking follow-ups filed: spec-gap-0006b (pin FR-014→event mapping), seed-0006b-a (seller-side failure-path zero-count). Merged #29 (squash 36d235f). | 2026-07-10 | done |
| REGRESS-ARTIFACT-LOSS | `fix artifact landing` | Authorize a kitchenloop.sh fix so post-phase auto-commits land regress/sweep artifacts durably (iteration branch or main), not on the worktree's current feature branch? | Yes — target `kitchen/iter-N` for phase-artifact commits regardless of the worktree's checked-out branch (or commit artifacts straight to a dedicated loop-state branch) | 2026-07-09 | Nothing today (this run's artifacts ride the open seed-0009a PR); recurs whenever regress runs on an already-merged feature branch |
| UAT-VERDICT-DURABILITY | `adopt uat durability` | Adopt the three sealed-regulator fixes from `docs/internal/reports/uat-gate-comment-investigation.md` so a zero-context UAT verdict can't be silently dropped (a PRODUCT_FAIL sat unread in /tmp while PR #27 merged)? | Yes — all three are sound and two are already operator practice this session: (1) the evaluator writes evidence into the ROOT repo `.kitchenloop/uat-runs/<ticket>/` and the parent posts the comment as its FIRST action after return; (2) the PRM-SEAL hand-merge checklist requires "UAT comment present OR explicit waiver row"; (3) execute Step 0 scans `/tmp/uat-*` + `.kitchenloop/uat-runs/` for orphaned verdicts. Touches UAT-GATE.md + the pr-manager stages (sealed regulator) — a GATE change, so it halts for you. | 2026-07-10 | Durable UAT gating on sealed-card PRs (today the operator does 2/3 by hand every merge) |
| RESALE-SHARE-SEMANTICS | `resale semantics` | What are v0 semantics when a licensed white-label copy is RE-LISTED and re-licensed: (a) may re-listing overwrite the copy's licensed-under provenance, and (b) must the resale split pay the original seller's declared revenue share in money? | (a) No — stamp listing terms per-trade and keep the copy's licensed-under provenance immutable (Constitution VI); (b) either wire the declared share into the resale split (three-way conserved split) or defer the money and soften the marketplace UI copy, which today promises "earn a share on every resale" that pays 0 | 2026-07-10 | Fixing iteration-3 report BUG-1/BUG-2 (resale provenance + upstream share); the marketplace copy overpromise stands until decided |
| ✅ UAT-PR31 (resolved) | *(done)* | Adjudicate the zero-context UAT verdict on PR #31 (bundle: seed-0016 + seed-0009d-b + seed-0020): false PRODUCT_FAIL? | RESOLVED 2026-07-10 — adjudicated a genuine FALSE PRODUCT_FAIL and merged #31 by hand (squash ab7c3a7). The evaluator's own raw Step-12 evidence met every literal assertion on sealed card seed-0016.md (picker "(USD)" copy option, no "Nothing to list yet", DB-confirmed buyer-owned copy matching the receipt); its FAIL rested on an additional-option expectation the card never states, contradicted by its own Step-11 PASS. Independently confirmed by a fresh read-only pr-auditor (APPROVE) which also verified both red-green witnesses (seed-0009d-b `Expected "7.5"/Received "10"`; seed-0016 old handleLicense never called loadItineraries) and that money integrity held (client-only; marketplace-flow.ts/basis-points.ts byte-identical; Constitution VI). Live Test PASS with ledger conservation 18000|1800|16200. Adjudication comment posted on the PR; `uat-failed` label removed. Real UX signal (copy indistinguishable from original) tracked as seed-0018. | 2026-07-10 | done |
| ✅ PRM-SEAL-34 (resolved) | *(done)* | PR #34 sealed UAT card seed-0017.md | RESOLVED 2026-07-11 — legit NEW card (absent on main, not an edit). Workspace itinerary-list panel (spec 012): the agency's trips newest-first, reopenable to continue work/book, a draft appears without page reload. READ-SIDE/UI ONLY — reuses the existing L3-proven tenant-scoped `workspace.itinerary.list`/`get` procedures; no new server capability, no canonical-schema change, no money math, no migration. Proven: (1) pr-auditor APPROVE — tenant scoping AIRTIGHT (client supplies no tenant id; server derives agencyId in agentProcedure from the verified session; both reads filter `scopedWhere`; cross-tenant `get` → NOT_FOUND); pre-existing INV-004 L3 test intact + new real-Postgres license→buyer-list assertion; grep confirms zero money/schema/migration files touched. (2) zero-context UAT PASS 13/13 (durable root-repo evidence, loop now writing to `.kitchenloop/uat-runs/` on its own). (3) CI green, in-image 353/353, e2e 23/23, Live Test PASS (receipt conservation 180.00=162.00+18.00). Merged #34 (squash 13a68b0). | 2026-07-11 | done |
| ✅ UAT-PR36 (resolved) | *(done)* | Adjudicate the zero-context UAT verdict on PR #36 (seed-0025, booked-price fidelity): false PRODUCT_FAIL from a token transcription slip? | RESOLVED 2026-07-11 — adjudicated a GENUINE FALSE PRODUCT_FAIL (2nd of the gate, after UAT-PR31) and hand-merged #36 (squash 207ec35). The failing Step 6 navigated to a share token with two hex chars transposed (evaluator's own step-5.png shows `adbfc8a4…`, its evidence.md wrote `adbfc84a…`), landing on the correct unknown-token unavailable state that Step 8 of the same card defines as CORRECT. Independently confirmed by pr-auditor APPROVE (booked prices from booking_component.sell_minor, integer minor units via formatMinorAmount only, no money-math/schema change; INV-020 white-label negatives intact/strengthened; INV-004 scoping preserved; cross-currency fails loudly). Real token serves 424.31/152.50 USD + Booked badges, markup_ledger conserves 42431 minor; 361/361 in-image, e2e 24/24 (deterministic click-through), Live Test PASS. Adjudication comment posted; `uat-failed` label removed. Card-writing lesson (loop practice): never make the evaluator transcribe long tokens. | 2026-07-11 | done |
| ✅ PRM-SEAL-40 (resolved) | *(done)* | PR #40 sealed UAT card seed-0030.md | RESOLVED 2026-07-11 — legit NEW card (absent on main, not an edit). Marketplace seller-earnings surface (spec 014): a seller sees their listings' license count + revenue-share income, plus a "Listed" mark on the workspace trip list. READ-SIDE ONLY — earnings aggregated in SQL from the recorded revenue_share_ledger.sellerCreditMinor (integer minor units, sum() in DB, one ledger row per unique license_id); no schema/money-semantics change (licensing.ts/splitTakeRate untouched; db barrel only gains `sum`). Proven: (1) pr-auditor APPROVE — earnings == sum(seller_credit_minor) over the seller's own ledger rows == conserved per-license credit (L3 on real Postgres); tenant scoping double-scoped server-side (sellerAgencyId = session.agencyId AND listingId IN ownListings; mine:false → null) — cross-tenant leak impossible. (2) zero-context UAT PASS (durable, 8 screenshots): '1 license · 225.00 EUR earned' matches the recorded seller credit; buyer sees no earnings on the seller's card (FR-004). (3) CI green, 368/368 in-image, e2e 25/25, Live Test PASS. Merged #40 (squash dad6869). First cycle after the Fable-5→Sonnet-5 model fix. | 2026-07-11 | done |
| ✅ PRM-SEAL-42 (resolved) | *(done)* | PR #42 sealed UAT card seed-0022.md | RESOLVED 2026-07-11 — legit NEW card (absent on main). Content library v0 (spec 015): register URL-only media (INV-025 — no binaries ever land), attach to an itinerary's gallery/items (first mutation to the stored document since draft, re-validated through ItinerarySchema.parse), white-label client-view renders it. New MediaStorePort + additive `media_asset` table + tenant-scoped workspace.media.* API. Proven by pr-auditor APPROVE: (a) client-view allowlist AIRTIGHT (INV-020) — toClientViewMedia builds a fresh {kind,url,alt} object (not spread/omit), internal id/source/attribution/storageKey structurally unreachable, triple-covered (L1 sentinel + L3 payload + e2e HTML scans); (b) cross-tenant attach SAFE (INV-004) — media asset AND itinerary independently re-scoped to session.agencyId before any write, both directions → NOT_FOUND state-conserved, detach never deletes the asset; (c) additive-only schema, closed MediaSource enum at Zod+adapter, NO money source touched. Live Test PASS (378/378 in-image, e2e 27/27, browser_evaluate HTML leak-scan zero-leak). NOTE: zero-context UAT comment absent (evaluator did not post — reinforces UAT-VERDICT-DURABILITY); trust boundary covered by the triple deterministic negatives + independent pr-auditor mechanical allowlist verification (PR #26 precedent). Merged #42 (squash 645da4f). seed-0022a (real binary-upload pipeline) deferred/filed. | 2026-07-11 | done |
| ✅ PRM-SEAL-44 (resolved) | *(done)* | PR #44 sealed a UAT card (17837888449248712164.md) | RESOLVED 2026-07-12 — 5-ticket polish bundle (batch-marketplace-polish), no feature-sized item. Tickets: marketplace listing-card copy clarity (declared share applies to FUTURE resales, not the first sale — partially addresses RESALE-SHARE-SEMANTICS overpromise); tickets.sh id-collision loop-infra fix (/dev/urandom); seed-0021 typed invalid-document read errors (no more 500 stack dumps on the share link); sell-form picker disables already-listed itineraries; seed-0019 FakeLLM demo-plan quality. pr-auditor APPROVE: (a) NO existence oracle — anonymous /view returns {status:not_found} byte-identical for invalid-document / unknown-token / other-tenant (L3 toEqual-verified); owner-only invalid diagnostic gated behind tenant-scoped loadItinerary. (b) NO money-math change — only itinerary read-path typed-error guards; domain/itinerary-schema/pricing untouched, no schema bump, FR-011 criteria-pinning preserved. INV-020 intact. UAT PASS 10/10 (durable); Live Test 392/392 in-image, e2e 32/32; tests strengthened (replaced an assertion that had pinned the 500-crash as correct). Merged #44 (squash 48feba7). First clear polish cycle (evolve→drain transition signal). | 2026-07-12 | done |
| ✅ PRM-SEAL-49 (resolved) | *(done)* | PR #49 sealed UAT card seed-0026.md | RESOLVED 2026-07-12 — drain-phase 3-ticket bundle: serializeOffers hoist (behavior-identical); seed-0026 workspace day-subtotals show booked client price from the booking record (read-side projection, agent-facing analog of seed-0025); seed-0009d-a wires the existing owner-scoped rate/deactivate marketplace controls into the UI (closes the operator follow-up from PR #27). pr-auditor APPROVE: seed-0026 read-side only (bookingComponent.sellMinor, integer-minor subtotals, tenant-scoped, netRate untouched, L3 booked==record & !=netRate); seed-0009d-a procedures UNCHANGED (deactivate flips only status/deactivatedAt — no revenue_share_ledger/money touch); no schema/port/money-math change. UAT PASS (durable). Merged #49 (squash 9462263). | 2026-07-12 | done |
| MEDIA-RIGHTS-SEMANTICS | `media rights semantics` | Once a licensed listing carries real media (seed-0022 content library), what happens to `agent-upload`/`traveler-ugc` assets on license: (a) transfer under license terms with no obligation, (b) strip from the copy, or (c) travel unchanged with a mandatory attribution obligation the client-view/marketplace UI must render? | (c) — no code change to `whiteLabelCopy` (media + attribution already travel byte-for-byte); add a client-view/marketplace-card read-side projection of the stored `attribution` string so the original creator is never silently implied to be the reseller. Full option analysis in `specs/006-marketplace-v0/spec.md` "Decisions surfaced for operator review" (D-0006.c) | 2026-07-12 | Implementing seed-0023's follow-up (spec 010 FR-007 attribution projection); ratifies before any code lands per DIRECTIVE #3 |

**CI-IMG-BUILD** — Iteration-2 ideate found the compose image was never hermetic
(report [BUG-1]/[IMP-4]: empty `.dockerignore` let host `node_modules` leak into
`COPY . .`, masking a broken build; every fresh clone failed `docker compose up
--build`). The product fix is ticketed (seed-0010, fix already verified in the
iter-2 worktree), but CI never builds the image (`lint`/`test`/`depcruise` only),
so this entire break class is invisible to the `ci_pass` merge gate. CI is a merge
gate, so adding an image-build job (full `docker build`, or at least
`docker build --target build`) is an operator change, not a loop commit — the loop
will not touch `.github/workflows/ci.yml` for this without this row being answered.
Nothing is blocked today; the gap just persists until wired.

**ENV-PNPM-DENY** — During the iteration-2 ideate session the runtime denied every
`pnpm` invocation (`pnpm install`, `pnpm install --frozen-lockfile`, `pnpm test`)
even though `.claude/settings.json` explicitly allowlists them; the prior ideate
run executed `pnpm install` fine, so the permission wiring regressed between runs
(report: Friction Points). Consequence: L1/L2 vitest and eslint could not be run
inside that session — the loop fell back to regress-phase coverage. This is
loop-infrastructure, not product; only the operator can inspect/repair the harness
permission config. Until then, in-session verification during ideate/execute may
silently degrade to live-stack-only evidence.
Evidence update (iteration-2 execute re-run, 2026-07-07): reproduced in the execute
session too, and the scope is wider than pnpm — `npm install` and even `rm` were
denied. The execute phase worked around it by running `pnpm test`/`pnpm run lint`
INSIDE the built Docker image (deterministic, same lockfile) and running the
Playwright e2e suite via a git-ignored `node_modules` shim over the npx-cached
`playwright` package (1.62.0-alpha; lockfile pins 1.61.1) with a CDN-downloaded
chromium-headless-shell. Workarounds are evidence-grade but slow and versioned
off-lockfile — the harness wiring still needs the operator fix. The shim was left
in place in the iter-2 worktree (`rm` denied); safe to delete or overwrite.

**UAT-PR14** — The pr-manager prep pipeline for PR #14 (`docs(spec-002): sync
data-model.md to resolved D-006`, ticket spec-gap-0001) passed every gate except
the UAT card, which fails closed: no `UAT Gate Results` comment exists on the PR
(docs-only change — no browser journey was run) and no per-PR waiver row was on
the desk. Green witnesses: pr-auditor APPROVE (doc verified line-for-line against
D-006 and packages/itinerary-schema/src/); codex Stage-4a APPROVE after one fixed
VIOLATION (the ListedItinerarySchema snippet contradicted itinerary.ts — corrected
in fed673b, pushed to the PR branch, codex re-review clean); codex final
merge-safety APPROVE; CI lint-and-test green on head fed673b1ba; zero file
deletions; no `uat-failed` label. Precedent: UAT-PR4/UAT-PR5 waivers for non-UI
PRs. Recommendation: waive (same class as UAT-PR4 — nothing for a browser journey
to exercise). Blocked until answered: merging PR #14; spec-gap-0001 remains open.
A follow-up ticket spec-gap-0003 was filed for the stale pre-D-006 open-decision
language remaining in sibling spec.md/plan.md (non-blocking, pr-auditor finding).

<!-- Resolved 2026-07-05 (operator ratified both at iteration-1 kickoff):
     D-002 `scope pushes` — DIRECTIVE item 2 push rule scoped to halt only on
       pushes to main outside the gated pr-manager merge pipeline, pushes to new
       remotes, force-pushes, and deploys; feature-branch pushes authorized.
       Direct state-sync pushes to main remain gated off (repo.allow_state_sync_push
       stays false — those are pushes to main outside the merge pipeline).
     D-003 `align seals` — DIRECTIVE sealed-gate list now names the pr-manager
       review stages (scripts/pr-manager/prompts/) and system-architecture.md,
       matching CLAUDE.md. -->

<!-- Resolved 2026-07-05 (seed-0001 landing):
     D-005 `land seed-0001` — operator merged PR #1 (seed-0001 skeleton) by hand
       as squash commit 0a1b1dc; the pr-manager sealed-path guard correctly blocked
       the loop from self-merging its own regulator artifacts (first UAT card + this
       desk). seed-0001 marked done in backlog.json.
     D-004 `wire skeleton gates` — after the merge and CI green on 0a1b1dc, wired
       kitchenloop.yaml: oracle.smoke_command=`node tests/integration/smoke.mjs`,
       live.boot_command=`docker compose down -v && docker compose up --build --wait`,
       live.e2e_command=`npx playwright test`, pr_manager.require_ci=true. INV-027
       live verification is now out of the pre-skeleton carve-out. -->

<!-- Resolved 2026-07-06 (seed-0002 schema decision + design landed on main):
     D-006 `land schema v0` — operator authorized the seed-0002 canonical-itinerary-
       schema landing. DECISIONS the execute phase MUST implement exactly:
       (a) SCHEMA_VERSION = "0.1.0";
       (b) THREE item kinds only — stay | activity | transfer. carRental is DEFERRED
           to a later operator-gated bump and is NOT in v0 (resolve the spec's
           [OPEN: D-006.b] markers as "3 kinds, no carRental"; supplyRef.port =
           [hotel, activity, transfer]);
       (c) media `source` enum = {licensed-stock, official-embed, agent-upload,
           traveler-ugc} (closed set; no scraped/AI-fabricated-as-real member).
       Implement via /speckit-implement against
       specs/002-canonical-itinerary-schema/tasks.md. Repo is pnpm — use pnpm.
     PRM-SEAL-2 `review pr 2` — operator authorized landing PR #2 (seed-0002 design +
       its desk edit) by merging the branch into main; the sealed-path guard correctly
       blocked the loop from self-merging its own desk edit, so the operator landed it
       by hand (per "do all"). Also landed: control-plane fix — loop oracle npm→pnpm +
       crash-notify (commit 0474a01), since the repo is a pnpm workspace. -->

<!-- Resolved 2026-07-06 (seed-0002 + seed-0007 landed via operator waiver):
     UAT-PR4 `waive uat pr4` — operator waived UAT for PR #4 (seed-0002 canonical
       itinerary schema v0). UAT was ENVIRONMENT_BLOCKED, not a defect: itinerary-
       schema is a pure-validation leaf library (no server/route/UI => no browser
       journey). Deterministic witness green (CI lint-and-test, pr-auditor APPROVE,
       exact D-006 compliance). Merged squash 1a2ab53 (#4); seed-0002 marked done.
     UAT-PR5 `waive uat pr5` — operator waived UAT for PR #5 (seed-0007 trust-
       boundary tests). Test-only (3 test files, no product source). Deterministic
       witness green (22 vitest incl. 5 new RBAC tests, eslint, pr-auditor APPROVE,
       codex clean, zero deletions). Merged squash 05f182d (#5); seed-0007 done.
     The UAT env-build fix (b9c6a19, option A) now installs deps in the evaluator
       worktree so future non-UI PRs reach a real verdict, not ENVIRONMENT_BLOCKED. -->

<!-- Resolved 2026-07-06 (REG-L3-STACK Option 2 + REG-L3-MSG, operator-authorized):
     REG-L3-STACK `wire l3 stack` — operator chose Option 2 (real L3 in regress).
       regress-gate now boots verification.live.boot_command around the L3 smoke and
       tears down; a boot that can't come up is L3 NOT-RUN (warning), never a HALT
       (commit 5d2246a). Fixed the two bugs that kept the stack from going healthy so
       `docker compose --wait` now exits 0: Next.js bound to $HOSTNAME (-> HOSTNAME=0.0.0.0)
       and the IPv6 `localhost` healthcheck (-> 127.0.0.1) + start_period (commit eab3ec7).
       Verified: web healthy ~10s, --wait exits 0, L3 smoke 5/5 green. Also unblocks the
       execute-phase INV-027 live gate (same --wait path).
     REG-L3-MSG `soften l3 msg` — smoke.mjs prints `FAIL: app not reachable at <url>`
       instead of a raw fetch stack dump on connection failure (commit 5d2246a). -->

**PRM-SEAL-17 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/seed-0006.md` in PR #17's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**UAT-PR18** — The pr-manager pipeline for PR #18 (`refactor(quality): remove/inline
20 knip-flagged unused exports`, quality-sweep ticket QS3-1, backlog id
17835183621278801481) passed every gate except the UAT card, which fails closed:
no `UAT Gate Results` comment exists on the PR (non-UI export-surface refactor —
no browser journey was run) and no per-PR waiver row was on the desk. Green
witnesses: pr-auditor APPROVE after two fixed criticals (four stray Playwright
session artifacts — `.playwright-mcp/*.yml` + `step-14/15.png` — stripped from the
branch in 15d0498; missing Spec Alignment PR-body section added); codex Stage-4a
alignment APPROVE (no findings); codex final merge-safety APPROVE; CI
lint-and-test green on head 15d0498; branch up to date with main; zero file
deletions; no `uat-failed` label. Precedent: UAT-PR4/UAT-PR5/UAT-PR14 waivers for
non-UI PRs. Recommendation: waive (same class — nothing for a browser journey to
exercise). Blocked until answered: merging PR #18 (QS3-1 stays open). Advisory
(non-blocking, pr-auditor): the cited `quality-sweep-iter-3` report is not
committed in-tree (docs/internal/reports/ has only iterations 1-2) — a follow-up
process-ticket candidate, not a change to this PR.

**PRM-SEAL-20 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/seed-0006a.md` in PR #20's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**PRM-SEAL-21 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/seed-0008.md` in PR #21's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**PRM-SEAL-23 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/seed-0009a.md` in PR #23's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**REGRESS-ARTIFACT-LOSS** — Iteration 3 needed three regress runs because the
orchestrator's post-phase auto-commit pushes artifacts (loop-state, sweep report,
patterns, backlog snapshot) to the worktree's CURRENT branch: the 2026-07-08 run's
commit was orphaned on `rescue/iter-3-b4b978e`, and the 07-09-morning run's commit
(d999def) sat on `kitchen/fix-seed-0006a-seller-vetting` after PR #20 had already
squash-merged — both green runs' state never reached main (this also explains the
pr-auditor advisory on UAT-PR18 about the missing in-tree sweep report). The third
run recovered the sweep report from d999def (now in-tree with provenance notes) and
re-landed loop state. Root-queue tickets always survived; only worktree artifacts
are at risk. The fix touches `scripts/kitchenloop/kitchenloop.sh` (loop machinery,
operator-authorized by precedent) — the loop will not self-modify the orchestrator
without this row being answered. Nothing is blocked today: the current regress ran
on the not-yet-merged `kitchen/fix-seed-0009a-planner-ui`, so its artifacts enter
PR-diff scope; the loss recurs whenever regress runs on a branch whose PR already
merged.
Evidence update (2026-07-11 ideate): the loss now also skews the ITERATION COUNTER —
the 2026-07-11 loop restart re-derived "iteration 3" because the iter-3 regress
state never reached `loop-state.md` (history stops at iter 2), so the run produced a
SECOND ideate pass appended to `iteration-3-report.md`; the first pass's
coverage-matrix update (3→13/36) was lost the same way and was backfilled this pass
from the landed report's witness (matrix now carries a provenance note).

**RESALE-SHARE-SEMANTICS** — Iteration-3 ideate ran the golden path end-to-end
live (draft → book at 18% → list at 7.5%/250 USD → license → RE-LIST the
white-label copy at 5%/400 USD → third agency licenses the resale; scenario
`scenarios/incubating/golden-path-trade-live/`, report iteration-3). Two
findings only the operator can rule on, both revenue-share/provenance
semantics (DIRECTIVE ALWAYS-HALT): (1) re-listing a licensed copy OVERWRITES
the copy's provenance in place — `revenueShareBps` 750→500 and the seller's
license terms replaced by the reseller's own — erasing the platform's stamp of
the first trade (license-time stamping itself is correct; proven by a fresh
license of the original). The scenario pins the correct behavior as a
known-red assertion. (2) The resale split pays the original seller nothing
(40000 → 4000 platform + 36000 reseller; the declared 750 bps drives no money),
while the marketplace page promises "earn a share on every resale … enforced by
the platform on every trade". Everything conserved two-way today
(ledger-verified); the question is whether v0 must conserve three-way. Nothing
else is blocked: booking/markup/first-license money paths verified green.

**UAT-PR31** — First bundle cycle (batching policy 2026-07-09): PR #31 carries
seed-0016 (high bug, picker stale post-license), seed-0009d-b (the recovered
seed-0009d UAT PRODUCT_FAIL — declared revenue share snapping back to the 10%
default on a refused submission; escalated to high after the e2e red witness
`Expected "7.5" / Received "10"` proved hypothesis (a) PRODUCT), and seed-0020
(fee-currency hint). All merge gates are green except the UAT card verdict:
CI green on c438906, in-image 346/346, e2e 20/20, L3 smoke PASS, live QA
journey PASS with conserved ledger split. The zero-context evaluator (fresh
stack, PR-HEAD-pinned worktree, durable root-repo evidence per the
UAT-VERDICT-DURABILITY practice) passed steps 1–11 and 13 and failed Step 12
against an expectation the card does not state; its raw output for Step 12
matches the card's expected result verbatim (`.kitchenloop/uat-runs/seed-0016/`
+ PR comment carry the full analysis). Integrity check CLEAN. The loop honored
the verdict fail-closed and did not self-adjudicate: this row is the
adjudication ask. If adjudicated false-fail, PR #31 is a normal PRM-SEAL
hand-merge (new sealed card seed-0016.md in diff); if upheld, the bundle
returns to rework.

**UAT-PR36** — Second false PRODUCT_FAIL of the UAT gate (first: UAT-PR31), new
failure class: the sealed card asks the evaluator to "record the full /view/…
URL" and re-navigate to it, and the haiku evaluator transcribed the 36-char
token from the page with one two-character transposition (`adbfc8a4…` read as
`adbfc84a…`; its own step-5-retry.png shows the extraction friction). The
mistyped token correctly rendered the typed unavailable state — the very
behavior Step 8 of the same card pins as CORRECT — and the evaluator scored it
as the feature failing. Mechanical refutation on the PR (analysis comment):
the DB holds exactly one link for the booked trip; fetching the REAL token
serves 424.31 USD / 152.50 USD / 6× Booked / zero net-rate strings; the
markup_ledger cross-check is exact (42431 minor). Independent same-HEAD
witnesses: e2e booked journey (24/24), implementer MCP journey screenshots,
reseller scenario's new hard price-fidelity assertion. Everything else on the
PR is green: 361/361 in-image, lint/tsc/depcruise clean, smoke PASS, Live Test
PASS, integrity check clean, evaluator steps 1–5/7/8 PASS. Fail-closed
honored: `uat-failed` tag stays, seed-0025 stays in_progress, no self-merge.
Card-writing lesson for future cards (loop practice, not a gate change): never
make the evaluator transcribe long tokens — pin "click the link" or assert on
the same page. If adjudicated false-fail, PR #36 is a normal PRM-SEAL
hand-merge; if upheld, seed-0025 returns to rework with the operator's repro.

**UAT-VERDICT-DURABILITY** — The iteration-3 investigation into the missing UAT
comments on #26/#27 (report `docs/internal/reports/uat-gate-comment-investigation.md`,
ticket loop-uat-gate-comment-missing, now done) found the zero-context UAT verdict
lives only in the parent session's pending subagent turn plus a throwaway `/tmp`
checkout until the parent posts the `## UAT Gate Results` comment — so any parent
death in the spawn→post window silently drops the gate, and on PR #27 a completed
PRODUCT_FAIL sat unread while the PR merged (it later proved a benign false
positive, but the gate had no way to know). Compounding it, every UI PR ships a
new sealed uat-card → PRM-SEAL hand-merge, and the pr-manager's fail-closed
"UAT comment must exist" check only runs for LOOP merges — so the PRs most needing
the gate never face it. The report proposes three fixes (root-repo evidence +
post-first, PRM-SEAL checklist requires a comment-or-waiver, Step-0 orphan scan);
all three touch UAT-GATE.md / the pr-manager stages, which are sealed regulator —
a gate change that halts for the human operator, never a loop commit. I applied
#2 and #3 as manual discipline this session (scanned /tmp + uat-runs before every
merge; verified #29's PASS comment was posted); this row asks whether to CODIFY
them. Nothing product-facing is blocked; the gap persists on the next sealed-card
PR until adopted.

**PRM-SEAL-40 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/seed-0030.md` in PR #40's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**MEDIA-RIGHTS-SEMANTICS** — ticket seed-0023 (iteration-3 second ideate pass,
report FEAT-b2), confirmed live: `whiteLabelCopy` (`packages/marketplace/src/white-label.ts`)
copies a listed itinerary's `media`/per-item `media` arrays verbatim into the
white-label copy, including an `agent-upload`/`traveler-ugc` asset's
`attribution` string naming the ORIGINAL agency — now that content-library v0
(seed-0022) makes real media possible, a reseller could unknowingly re-brand a
trip whose photos they have no stated right to, or (worse) the copy silently
implies the reseller took the photo. This is a content-rights decision,
distinct from the open **RESALE-SHARE-SEMANTICS** row (that one is about money
split on resale; this one is about content attribution on the FIRST license).
No code changed this cycle — the full three-option analysis (transfer / strip
/ mandatory-attribution) is written into `specs/006-marketplace-v0/spec.md`
"Decisions surfaced for operator review" as D-0006.c, following the same
recommended-default-pending-ratification pattern as D-0006.a/b. Nothing is
blocked today (v0 media is text-attribution only, no rendered gallery yet
carries this risk in production); this just needs ratifying before the
attribution-rendering follow-up ticket is filed and implemented.
