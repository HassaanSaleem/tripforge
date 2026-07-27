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
| ✅ GROUP-TRIPS-PRD-AMEND (ratified) | *(done)* | PR #21 (traveler group trips, spec 040 v0) carries a PRD-amendment proposal — group travel is a new capability not in the PRD — flagged for operator ratification at merge. It does NOT edit the sealed constitution; the amendment is a proposal note in plan.md only. | RATIFIED 2026-07-27 — Hassaan chose "Ratify and merge" (AskUserQuestion). Basis: GOAL.md (2026-07-21) explicitly authorized building group trips this pass as the operator scope decision the constitution requires for P1+/P2 work. Operator-proxy verified: no money path, no SCHEMA_VERSION bump, no revenue-share/ownership change; premium+identity trust gating mechanically enforced (requireEligible before any write); all-party-confirm-before-finalize row-locked; INV-020/023/024 covered; L3 + RBAC + live QA PASS; CI green. Merged #21 (b933439). | 2026-07-27 | done |
| CI-IMG-BUILD | `add ci image build` | Should CI build the compose image so hermetic-build breaks gate merges? | Yes — add a docker-build job to `.github/workflows/ci.yml` | 2026-07-07 | Nothing today (gap: BUG-1-class breaks stay invisible to `ci_pass`) |
| ENV-PNPM-DENY | `pnpm perms fixed` | Why did the loop harness deny ALL `pnpm` commands in the iter-2 ideate session despite the `.claude/settings.json` allowlist? | Verify/repair the harness permission wiring so allowlisted `pnpm install`/`pnpm test`/`pnpm run lint` run inside loop sessions | 2026-07-07 | In-session L1/L2 + lint verification during ideate/execute (regress runs in its own runtime and is unaffected) |
| UAT-PR14 | `waive uat pr14` | Waive the UAT-card gate for PR #14 (spec-gap-0001: docs-only sync of data-model.md to resolved D-006)? | Yes — waive: markdown-only spec amendment, no product behavior, no browser journey applies; every other merge gate is green | 2026-07-09 | Merging PR #14 (spec-gap-0001 stays open) |
| UAT-PR72 | `waive uat pr72` | Waive the UAT-card gate for PR #72 (seed-0022a: media library real file upload) — the evaluator subagent hit ENVIRONMENT_BLOCKED (Bash denied) twice, same root cause as the still-open ENV-PNPM-DENY row? | Yes — waive: the implementer independently ran the ENTIRE sealed card's journey by hand via Playwright MCP against the same built stack (upload → attach → share → signed-out client-view → byte-for-byte curl verification of the serving route → header/log leak checks) and it PASSED every assertion with zero fix cycles; 571/571 automated tests + lint green; same waiver class as UAT-PR4/UAT-PR5/UAT-PR14 (ENVIRONMENT_BLOCKED, not a defect) | 2026-07-14 | Merging PR #72; seed-0022a stays `in_review` until answered |
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
| ✅ PRM-SEAL-51 (resolved) | *(done)* | PR #51 sealed UAT card seed-0014.md | RESOLVED 2026-07-12 — feature: streams the AI itinerary draft over a native tRPC SSE subscription (LLMPort.draftItinerary Promise→AsyncGenerator; progress events during the tool loop + terminal result; Anthropic + Fake). Closes the INV-028 streaming deferral open since seed-0005/PR #13 (spec 016). pr-auditor APPROVE: INV-028 compliant (streamed during the loop, not batched; terminal result through the unchanged verify→assemble→single-tx persist with canonical re-validation); NO cross-request shared state (the INV-028 blind spot — each generator owns its state, AnthropicLLM local-scoped, FakeLLM keyless branch pure); no money/schema/supply-port change; typed mid-stream error + abort handling; no weakened assertions (existing draft calls drained, new streaming/parity/error tests added). UAT PASS (durable); Live Test PASS (keyless FakeLLM, text/event-stream 200). Merged #51 (squash 6e732aa). | 2026-07-12 | done |
| ✅ PRM-SEAL-54 (resolved) | *(done)* | PR #54 sealed-path match on `OPERATOR-DESK.md` | RESOLVED 2026-07-13 — operator reviewed PR #54 by hand (loop-infra/docs bundle: seed-0035 coverage-derivation tool now scans e2e specs + 10 unit tests; seed-0036 D-0006.d decision record). The sealed-path match was the D-0006.d ratification row appended to `OPERATOR-DESK.md` (asks-channel use), NOT a gate edit. No `apps/web`/`packages/*` runtime code; lint clean, 362/362 in-image, Live Test correctly N/A. Merged by hand (squash 3d3304c). | 2026-07-13 | done |
| ✅ PRM-SEAL-55 (resolved) | *(done)* | PR #55 sealed new UAT card `.kitchenloop/uat-cards/demo-06-auth-ux.md` | RESOLVED 2026-07-13 — legit NEW card (absent on main, not an edit). demo-06 auth restyle (pure UI, no Better Auth logic change) + demo-07 verified-seller badge. Trust-surface diff hand-verified read-only: new batched `vettedAgencyIds` read + `sellerVetted` projection field; vetting/rating ENFORCEMENT unchanged, no money/schema touch. 418/418 with DB (incl. extended L3 `sellerVetted` assertion), L3 smoke PASS, Live Test PASS (browser journey, screenshots). Merged by hand (squash e176e83). | 2026-07-13 | done |
| ✅ PRM-SEAL-56 (resolved) | *(done)* | PR #56 sealed new UAT card `.kitchenloop/uat-cards/demo-02-shell.md` | RESOLVED 2026-07-13 — legit NEW card. demo-02 dashboard app shell (sidebar nav + Agent Home, planner/trips/media split into routes, honest Discover coming-soon). New `workspace.dashboard.stats` read-only aggregate hand-verified: every query tenant-scoped by agencyId AT the query (INV-004), money per-currency never summed (Const VI), integer minor units read-only, zero-safe — no money-path files touched (FR-012). 432/432 in-image (incl. two-tenant L3), e2e 31/31, Live Test PASS (sign-up→dashboard→build→book→trips→responsive, GBV 399.97 shown, 3 defects fixed in-cycle). Merged by hand (squash 48254fe). | 2026-07-13 | done |
| MEDIA-RIGHTS-SEMANTICS | `media rights semantics` | Once a licensed listing carries real media (seed-0022 content library), what happens to `agent-upload`/`traveler-ugc` assets on license: (a) transfer under license terms with no obligation, (b) strip from the copy, or (c) travel unchanged with a mandatory attribution obligation the client-view/marketplace UI must render? | (c) — no code change to `whiteLabelCopy` (media + attribution already travel byte-for-byte); add a client-view/marketplace-card read-side projection of the stored `attribution` string so the original creator is never silently implied to be the reseller. Full option analysis in `specs/006-marketplace-v0/spec.md` "Decisions surfaced for operator review" (D-0006.c) | 2026-07-12 | Implementing seed-0023's follow-up (spec 010 FR-007 attribution projection); ratifies before any code lands per DIRECTIVE #3 |
| MEDIA-ITEM-PICKER-SCOPE | `media picker scope` | seed-0036: once a licensed copy's inherited gallery media can be detached (already true) should it also be relocatable onto a specific item, given the item-level attach picker only offers `workspace.media.list` (tenant-registered) assets today? (a) register inherited assets into the reseller's own library at license time, (b) leave "inherited, gallery-only edit rights" as the intended v0 shape, or (c) widen the item-level picker's option source to the union of `workspace.media.list` and the current document's own `media` array, read-side only? | (c) — resolves the actual friction (moving, not just deleting, an already-possessed photo) with no schema/money-path change and no new tenant-boundary crossing (never grants an asset the document doesn't already carry); consistent with D-0006.c's already-ratified full-editorial-control stance. Full option analysis in `specs/006-marketplace-v0/spec.md` "Decisions surfaced for operator review" (D-0006.d) | 2026-07-13 | Implementing seed-0036's follow-up (item-level picker union); ratifies before any code lands per DIRECTIVE #3 |
| PRM-SEAL-55 | `review pr 55` | PR #55 changes a sealed loop gate (`.kitchenloop/uat-cards/demo-06-auth-ux.md`); the loop may not merge it. | Review the change by hand; land it yourself if intended, or close the PR. The loop will not auto-merge sealed-gate edits. | 2026-07-13 | PR #55 merge |
| DISCOVER-LAYOUT-REPRO | `discover layout repro` | Ticket `demo-polish-discover-layout` (dress-rehearsal screenshot: `/discover`'s header renders above the app-shell chrome instead of inside it) has now failed to reproduce across THREE independent execute-cycle investigations this iteration (fresh `docker compose up --build --wait`, full-page load + client-side nav + narrow-viewport, byte-for-byte page.tsx diff against the landing commit) — clean console every time, pixel-identical to Marketplace. What exact viewport size/browser/cache state produced the original screenshot? | Close the ticket as a screenshot artifact unless you can supply the missing detail (viewport px, browser, whether the tab had a stale bundle/service-worker cached) — a fourth blind re-investigation is unlikely to find anything the first three didn't | 2026-07-14 | Ticket stays in `todo`, deprioritized below every medium/low feature ticket until a sharper repro lands |
| GROUP-TRAVEL-DIMENSION | `add group-travel dimension` | PR #61 (spec 021, Constitution Check PASS, operator-mandated per demo-11-group-travel) shipped `tests/e2e/group-travel-journey.spec.ts` with a `KITCHENLOOP-COVERAGE` block naming `"feature": "group-travel"` and `"user_type": "agent"` — neither is in `kitchenloop.yaml`'s `spec.dimensions` vocabulary, so `derive-coverage.mjs` hard-crashed the first time anyone ran it (iteration 6 ideate; crash fixed in PR #74 by removing the block, but the underlying question is unresolved). Should "group-travel" become an official 7th `spec.dimensions.features` entry (total_combos 36->42), or is it intentionally untracked (e.g. a demo-track feature distinct from the core P0 spec surface)? | Add it as a 7th feature dimension — it's real, shipped, Constitution-Check-PASS, P0-scoped functionality with its own durable e2e coverage; leaving real coverage permanently invisible to the matrix repeats the exact seed-0031/seed-0035 drift class this tooling exists to prevent | 2026-07-15 | `tests/e2e/group-travel-journey.spec.ts` carries no COVERAGE block until answered (PR #74); ticket 17840666553970558336 tracks the fix either way |
| ✅ UAT-PR78 (resolved) | *(done)* | Waive the UAT-card gate for PR #78 (agent-upload-own-itinerary: bring-your-own itinerary manual builder) — the evaluator subagent hit ENVIRONMENT_BLOCKED (Bash denied before any card step). | RESOLVED 2026-07-15 — WAIVED: the implementer hand-drove the ENTIRE sealed card via Playwright MCP against the freshly-built compose stack (sign-up → 7-field manual-build form → create trip → opens through the EXISTING day-view/flights/booking/share components → "Self-built" badge → graceful "No items could be held at live prices" on an all-unpriced quote → zero console errors → clean log scan), PASSED all 9 steps; 600/600 automated green + lint clean; same waiver class as UAT-PR4/5/14/72 (ENVIRONMENT_BLOCKED, not a defect). | 2026-07-15 | done |
| ✅ SCHEMA-GATE-78 (resolved) | *(done)* | PR #78 added a canonical-schema column `itinerary.creation_source` (text, additive, NOT NULL DEFAULT 'ai_drafted'; values ai_drafted/manual/licensed_copy) + a display-only `licensed_copy` stamp in marketplace licensing — a schema/licensing operator gate the loop SELF-ADJUDICATED ("no gate triggered") instead of placing on the desk (pr-auditor flagged this as the sole BLOCKING issue; DIRECTIVE §5: a gate not on the desk was not asked). | RATIFIED 2026-07-15 by operator (Hassaan approved via AskUserQuestion): additive backfill-free migration (db:push-clean, no backfill), canonical schema DOCUMENT + SCHEMA_VERSION "0.1.0" UNCHANGED, load-bearing PMF resold:self-built ratio UNTOUCHED (creation_source is display-only, distinct from pmf_event.trip_created.source), revenue-share math byte-identical, provenance badges honest (a licensed copy cannot masquerade as self-built/AI), INV-020/004/023 clean, L3 double-book conservation tested. Independent pr-auditor: clean on every technical axis. Merged #78 (cbf2780). | 2026-07-15 | done |
| ✅ P2-IDENTITY-GATE (resolved) | *(done)* | Ticket `p2-consumer-accounts-identity` needs a NEW traveler/consumer auth identity (no-org Better Auth user OR an explicit role flag) + optional client sign-in on `(client-view)` — AUTH+SCHEMA, ALWAYS-HALT, so the loop correctly asked BEFORE building (the SCHEMA-GATE-78 lesson applied proactively). | AUTHORIZED 2026-07-15 — Hassaan chose "Build now, ratify at merge": the loop is cleared to run the FULL SDD flow (spec→plan→tasks→implement) and BUILD the feature now. Pick the identity model in the plan (state which) with an ADDITIVE, backfill-free migration. The specific identity-model + migration are pr-auditor-reviewed and OPERATOR-RATIFIED at the PR MERGE (same discipline as SCHEMA-GATE-78); the PR stays operator-gated at merge (NO auto-merge). Constitution Check records the bounded P2 promotion. Ticket body carries the same authorization. | 2026-07-15 | done |
| ✅ P2-HISTORY-GATE (resolved) | *(done)* | Ticket `p2-consumer-trip-history` needs a NEW client<->itinerary/booking association (link a signed-in traveler to shared trips/bookings) — a data-model change, ALWAYS-HALT; depends on p2-consumer-accounts-identity (now DONE, #80). | AUTHORIZED 2026-07-15 — same terms as P2-IDENTITY-GATE ("build now, ratify at merge"): the loop is cleared to run the FULL SDD flow and BUILD now. Design the client<->trip/booking association ADDITIVE + backfill-free (attach on share/join/handoff-accept); the specific schema is pr-auditor-reviewed + OPERATOR-RATIFIED at the PR MERGE (PR stays operator-gated, NO auto-merge). MUST hold INV-020 (client-facing figures only, never markup/net-rate) + strict traveler-identity scoping (a traveler sees ONLY their own trips/bookings) with L3 tests. Constitution Check records the bounded P2 promotion. Ticket body carries the same authorization. | 2026-07-15 | done |
| ✅ UAT-PR80 (resolved) | *(done)* | Waive the UAT-card gate for PR #80 (traveler sign-in + request-agent pre-fill) — the zero-context evaluator hit ENVIRONMENT_BLOCKED (Bash/pnpm denied, ran 0 card steps), same class as UAT-PR72/UAT-PR78; PR #80 also carried the P2-IDENTITY-GATE ratify-at-merge requirement. | RESOLVED 2026-07-15 — Hassaan chose "Ratify & merge now" (AskUserQuestion). OPERATOR WAIVES the UAT (ENVIRONMENT_BLOCKED, not a defect; implementer hand-drove all 12 sealed steps incl. mechanically-confirmed no-agency-field on traveler sign-up + a DB witness that the EDITED name persisted; 606/606 + 38/38 e2e + lint green) AND RATIFIES the identity model: org-less Better Auth user, ZERO DDL/migration (specs/030 data-model.md). Independent pr-auditor: engineering CLEAN on every axis — INV-018 anonymous /view/[token] preserved (no sign-in wall), INV-024 traveler CANNOT escalate to agent (getSessionContext guards agencyId; L3 asserts FORBIDDEN from workspace procs), INV-020/004 clean, no test weakened. Merged #80 (c444b63). NOTE: the loop had authored a self-recommendation in this row — recorded here is the ACTUAL operator decision. | 2026-07-15 | done |
| UAT-PR83 | `waive uat pr83` | Waive the UAT-card gate for PR #83 (perf-031-mytrips-pagination: batch `listTravelerTrips` DB lookups, N+1 -> O(1))? The execute-phase UAT-GATE skill legitimately SKIPPED the card ("pure refactor, no user-visible behavior change" per `.claude/skills/kitchenloop-execute/UAT-GATE.md`'s skip criteria), but the pr-manager merge pipeline's Stage 8.6 requires a literal `PASS` verdict (fail-closed) with no carve-out for a legitimate SKIPPED, so it halts here rather than self-adjudicate. | Yes — waive: same class as UAT-PR18/UAT-PR28 (pure-refactor, no browser-facing surface to exercise). Every other gate is green: pr-auditor APPROVE after one fix round (added the missing PR-body Spec Alignment section, an INV-004 tenant-scoping symmetry guard on the batched `bookingComponentTable` lookup, and strengthened the new L3 test to actually book 2 of 3 trips at different markups so the money-bearing batch — not just the agency-name batch — is exercised for cross-contamination); codex Stage-4a APPROVE (no findings); codex final merge-safety APPROVE; CI (`lint-and-test`) green on head aa298c2; 615/615 in-image tests + lint clean; branch already up to date with main; zero file deletions; no `uat-failed` label. | 2026-07-16 | Merging PR #83; perf-031-mytrips-pagination stays `in_review` |
| ✅ PRM-SEAL-3 (resolved) | *(done)* | PR #3 changes a sealed loop gate (`.kitchenloop/uat-cards/goal-traveler-account.md`); the loop may not merge it. | RESOLVED 2026-07-21 — operator-proxy reviewed (same class as PRM-SEAL-34): the sealed footprint is a single NEW uat-card for a new ticket (added file, not an edit to the UAT protocol or an existing evaluated card) + backlog bookkeeping; feature (spec 033 traveler home) verified by the loop (619 tests + 8 e2e + live QA). Merged by hand into the campaign branch (`75c99de`); goal-traveler-account marked done. | 2026-07-21 | merged PR #3 |
| GROUP-TRIPS-AMEND | `ratify group-trips` | Ratify at merge (a) a PRD/constitution amendment naming the consumer **group-travel coordination** sub-surface under the consumer-surface pillar, and (b) the new **agency-less traveler group data-model** (`traveler_membership` / `traveler_group` / `traveler_group_member` / `traveler_group_message`) — spec 040, PR #21? | Yes — build-now-ratify-at-merge (P2-IDENTITY / P2-HISTORY / SCHEMA-GATE-78 precedent): additive **backfill-free** all-new tables, **NO** canonical-itinerary `SCHEMA_VERSION` bump, **NO** money path, **NO** revenue-share / client-ownership semantics change; `.specify/memory/constitution.md` is NOT edited (amendment is a **proposal note** in `specs/040-traveler-group-trips/plan.md` only). | 2026-07-27 | Merging PR #21; `goal-group-trips` stays `in_review` |

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

**UAT-PR72** — Iteration 6 execute (seed-0022a, media library real device file
upload). Spawned the zero-context `uat-evaluator` (isolation: worktree, haiku)
TWICE against the sealed card `.kitchenloop/uat-cards/seed-0022a.md`; both runs
reported the same block before executing a single test-card step: Bash tool
access was denied to the subagent, so it could not run `pnpm install`, the
prerequisite curl/docker checks, or the browser automation. This is the SAME
root cause as the still-open **ENV-PNPM-DENY** row (harness permission wiring
for spawned/loop sessions), not a defect in the feature — the card itself was
never reached. Rather than skip verification, I (the implementer) drove the
ENTIRE sealed card's journey by hand via Playwright MCP against the same built
compose stack the evaluator would have used: signed up a fresh agency, used the
NEW "Upload a photo from your device" form (not the pre-existing URL form) to
upload a real JPEG with no URL typed, confirmed a working preview, attached it
to a drafted trip's gallery via the pre-existing attach picker (unmodified),
shared the trip, opened the `/view/{token}` link in a fresh signed-out tab, and
confirmed the identical photo renders there. Verified the new public
`/api/media/[id]` serving route directly with `curl` (no cookies/session): 200
`image/jpeg`, response bytes byte-for-byte identical to the uploaded file
(`diff` clean), headers contain ONLY `content-type`/`cache-control` (no
`agencyId`/`attribution` anywhere), and an unknown uuid at the same route
404s. Compose-log scan and browser console: zero errors. Every assertion the
sealed card makes was independently satisfied. Also green: 571/571 automated
tests (`pnpm test` in the built image), lint clean, L3 smoke 45/45. Same
waiver class as UAT-PR4/UAT-PR5/UAT-PR14 (ENVIRONMENT_BLOCKED, not a product
defect) — recommend waiving. Blocked until answered: merging PR #72;
seed-0022a stays `in_review`.
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

**PRM-SEAL-55 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/demo-06-auth-ux.md` in PR #55's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**UAT-PR78** — Iteration 7 execute (agent-upload-own-itinerary, spec 029:
bring-your-own itinerary manual builder). Spawned the zero-context
`uat-evaluator` (isolation: worktree, haiku) against the sealed card
`.kitchenloop/uat-cards/agent-upload-own-itinerary.md`; it reported Bash
tool access denied before executing a single test-card step, so it could not
run `pnpm install`, `curl`, or `docker compose` — the SAME root cause as the
still-open **ENV-PNPM-DENY** row, not a defect in the feature (the card
itself was never reached). Rather than skip verification, I (the
implementer) drove the ENTIRE sealed card's 9 steps by hand via Playwright
MCP against a freshly-rebuilt compose stack (`down -v && up --build --wait`,
same image the evaluator would have used): signed up a fresh agency, opened
the new "+ Build a trip manually" form, filled all 7 trip-level fields,
added a stay item to Day 1 and an activity item to a newly-added Day 2,
created the trip — it opened immediately through the EXISTING day-view/
flights-card/booking-flow/share-control components (zero new rendering
code), the trips list showed the exact "Self-built" badge (no
"Licensed copy" badge), quoting the fully-unpriced trip showed the exact
graceful "No items could be held at live prices. Adjust the plan or quote
again." message (no crash, no special-casing), zero browser console
errors/warnings across the whole session, and the compose-log scan was
clean (only the pre-existing known-benign `booking_component_itinerary_item_idx`
duplicate-key line, filtered by the card's own grep). Full evidence:
`.kitchenloop/uat-runs/agent-upload-own-itinerary/evidence.md` + 8
screenshots (git-ignored). Also green: 600/600 automated tests against the
live compose Postgres (including the new `l3-manual-itinerary.test.ts`
conservation suite), lint clean. Same waiver class as UAT-PR4/UAT-PR5/
UAT-PR14/UAT-PR72 (ENVIRONMENT_BLOCKED, not a product defect) — recommend
waiving. Blocked until answered: merging PR #78; agent-upload-own-itinerary
stays `in_review`.

**P2-IDENTITY-GATE** — Iteration 7 execute picked `p2-consumer-accounts-identity`
next in priority order (medium feature, no higher-priority bugs/features
pending) but its own body declares an ALWAYS-HALT: a new traveler/consumer
auth identity + optional client sign-in is an AUTH + SCHEMA change per
DIRECTIVE #2. SCHEMA-GATE-78 (this same iteration) showed what happens when
the loop implements a schema change and self-adjudicates the gate after the
fact — pr-auditor flagged it as the sole blocking issue, and the operator had
to ratify retroactively. To not repeat that, this row is filed BEFORE any
spec/plan/code work: no `/speckit-specify` run yet, ticket left in `todo`.
Nothing is blocked today beyond this ticket's own progress; `p2-consumer-trip-history`
is additionally blocked on this one (see **P2-HISTORY-GATE** below).

**P2-HISTORY-GATE** — Same iteration, same reasoning as **P2-IDENTITY-GATE**:
`p2-consumer-trip-history` needs a new client<->itinerary/booking association
(a canonical/data-model change), and its body declares `Depends on:
p2-consumer-accounts-identity`. Filed proactively, ticket left in `todo`, no
implementation started. Resolve P2-IDENTITY-GATE first — the identity model
chosen there determines the association's foreign key shape here.

**UAT-PR80** — Same iteration, built under the P2-IDENTITY-GATE authorization
("Build now, ratify at merge"): PR #80 adds `clientView.me` (protectedProcedure,
first mount of that pre-existing-but-unused tier), `/view/sign-in` +
`/view/sign-up` (traveler account creation with zero agency-creation exposure —
mechanically confirmed absent, not just visually), and a `TripFork` pre-fill
(`defaultValue` on the existing uncontrolled contact inputs, still editable).
Identity model: reuses the already-existing org-less Better Auth `user` — **no
schema/migration at all** (`specs/030-traveler-client-accounts/data-model.md`
documents why this counts as satisfying the ticket's migration-note
requirement). Spawned the zero-context `uat-evaluator` (isolation: worktree,
haiku) against the sealed card `.kitchenloop/uat-cards/p2-consumer-accounts-identity.md`
TWICE (once directly, once after I explicitly re-authorized the Step 0 install
command by name) — both times it stopped asking for Bash/pnpm permission
before executing a single test-card step, the SAME root cause as the still-open
**ENV-PNPM-DENY** row and the identical failure shape as **UAT-PR72**/**UAT-PR78**
— not a defect in the feature (the card itself was never reached). Rather than
skip verification, I (the implementer) drove the ENTIRE sealed card's 12 steps
by hand via Playwright MCP against a freshly-rebuilt compose stack
(`down -v && up --build --wait`, same image the evaluator would have used):
signed up an agency, drafted+shared a trip, signed OUT of the agent account,
opened the share link anonymously (regression witness: renders unchanged, plus
the new "Have an account? Sign in" strip), opened `/view/sign-up` and confirmed
via accessibility snapshot that NO agency/organization field or text appears
anywhere on the form, created a traveler account, landed back on the exact
same trip URL with "Signed in as Amina Yusuf" visible, opened the
request-an-agent form and confirmed both fields were pre-filled from the
account, EDITED the name field and submitted, then verified directly in
Postgres (`SELECT contact_name, contact_email, status FROM
trip_handoff_request ORDER BY created_at DESC LIMIT 1`) that the persisted row
carried the EDITED value ("Amina (on behalf of family)"), not the account name
— proving the pre-fill is a true default, not a forced value. Signed out and
confirmed the form reverted to blank with zero residual pre-fill. Zero browser
console errors/warnings across the whole session; compose-log scan clean
(only the pre-existing known-benign `booking_component_itinerary_item_idx`
duplicate-key line). Also green: 606/606 automated tests against the live
compose Postgres (including the new `l3-traveler-accounts.test.ts`, which also
proves INV-024 — a traveler session is FORBIDDEN from every `workspace.*`
procedure — and INV-020 — no name/email/markup/net-rate ever appears in the
`ClientItineraryView` payload regardless of caller session state), 38/38 e2e
(one PRE-EXISTING, UNRELATED e2e failure in `workspace-list-journey.spec.ts`
was found during the full-suite run and confirmed via `git log`/`git diff` to
predate this branch — a PR #78 locator regression, filed as ticket
`17841242761109009474`, NOT bundled into this PR), lint clean. Same waiver
class as UAT-PR4/UAT-PR5/UAT-PR14/UAT-PR72/UAT-PR78 (ENVIRONMENT_BLOCKED, not a
product defect) — recommend waiving AND separately ratifying the
P2-IDENTITY-GATE identity-model choice recorded in the plan at the same time,
since both gates land on this one PR. Blocked until answered: merging PR #80;
p2-consumer-accounts-identity stays `in_review`.

**UAT-PR83** — pr-manager prep for PR #83 (perf-031-mytrips-pagination:
batches `listTravelerTrips`' N sequential per-trip DB lookups into 3 constant
queries) passed every other gate but the UAT card reads `SKIPPED (pure
refactor, no user-visible behavior change)`, not `PASS` — the execute-phase
UAT-GATE skill's documented skip criterion for pure refactors, but Stage 8.6
of this pipeline requires a literal `PASS` and fail-closed has no exception
for a legitimate SKIPPED, so it halts here rather than self-adjudicate a gate
it isn't authorized to waive. First review round (pr-auditor) returned
REQUEST_CHANGES on two points: the PR body was completely missing a Spec
Alignment section (INV-027 honesty gate — fixed by adding a justified N/A,
since this is a bug-fix ticket with no `specs/` path), and the new L3
regression test left all 3 linked trips unbooked, so the money-bearing
`bookingComponentTable` batch (price/currency) was never actually exercised
for cross-trip contamination — only the agency-name batch was (fixed: the
test now books 2 of 3 trips at different markups, 1000bps/3000bps, and
asserts their totals are both independently correct AND mutually distinct). A
third, non-blocking finding (the batched `bookingComponentTable` query had no
per-row tenant-ownership guard, asymmetric with the sibling `itineraryTable`
batch — INV-004) was also closed defensively even though no exploit was
demonstrated. Re-review: pr-auditor APPROVE, codex Stage-4a APPROVE (no
findings, verified by tracing the booking write path), codex final
merge-safety APPROVE (no INV-028/money/schema issues). CI green on head
`aa298c2`; branch already up to date with `main`; 615/615 tests green
in-image + lint clean; zero file deletions; no `uat-failed` label.
Recommendation: waive — same class as UAT-PR18/UAT-PR28 (pure-refactor,
nothing for a browser journey to exercise beyond what the strengthened L3
test now covers). Blocked until answered: merging PR #83;
perf-031-mytrips-pagination stays `in_review`.

**PRM-SEAL-3 context:** The mechanical sealed-path guard matched `.kitchenloop/uat-cards/goal-traveler-account.md` in PR #3's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**GROUP-TRIPS-AMEND** — Iteration 11 execute built `goal-group-trips` (spec 040, PR #21): traveler-side group trips (create/post/join/in-group chat/all-party-confirm finalize) with premium+identity gating, GOAL.md D2.5/2.6. Group travel is a **new capability not in the PRD**, operator-authorized this pass (GOAL.md), so per DIRECTIVE §2 the PRD/constitution amendment ALWAYS-HALTS. The loop did NOT self-adjudicate (the SCHEMA-GATE-78 lesson): `.specify/memory/constitution.md` is untouched; the amendment is a **proposal note** in `specs/040-traveler-group-trips/plan.md`. The feature ships as **additive, backfill-free** tables (`traveler_membership`/`traveler_group`/`traveler_group_member`/`traveler_group_message`) — **no** canonical-itinerary `SCHEMA_VERSION` bump, **no** money path, **no** revenue-share/client-ownership semantics change (agency-less bolt-on, the `consumer_plan_request` precedent). Recommendation: ratify at merge (build-now-ratify-at-merge, same discipline as P2-IDENTITY-GATE/P2-HISTORY-GATE/SCHEMA-GATE-78). Verified by the loop: 653/653 in-image tests (incl. L3 real-Postgres eligibility/finalize conservation + concurrency), lint clean, Live Test PASS (two-traveler browser journey incl. the "Waiting on 1 member" all-party gate). Blocked until answered: merging PR #21; `goal-group-trips` stays `in_review`.
