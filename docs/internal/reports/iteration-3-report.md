# Kitchen Loop Report - Iteration 3

## Scenario: Golden Path — draft → book with markup → list → license → RESALE (three agencies)
**Date**: 2026-07-10
**Mode**: strategy
**Tier**: T2 Composition
**Features Exercised**: itinerary-builder, booking, marketplace, revenue-share (platforms: web + api; user types: agent-seller, agent-reseller)
**Codex check**: REDIRECT — scenario feasible and novel, but the verification criterion was adjusted per Codex: the license-fee split always uses the fixed 10% platform take (`DEFAULT_PLATFORM_TAKE_RATE_BPS`); the declared `revenueShareBps` travels as provenance and does not drive the fee split. Adopted: verify (a) split conservation at the fixed take, (b) the declared share survives verbatim into listing + copy provenance. That adjustment led straight to the iteration's two biggest findings.

## What I Did (as a user)

All against the live compose stack (fresh `down -v` boot, keyless → FakeLLM
planner), driven in a real browser (Playwright MCP) and then replayed as an
API-level scenario script. Evidence screenshots in
`.kitchenloop/evidence/iter-3-ideate/` (git-ignored).

1. **Seller** (Sana, "Meridian Trails GP3"): signed up via `/sign-up` (account +
   agency in one step, landed in `/workspace` instantly). Drafted Paris
   2026-09-01→04, 2 adults, balanced, hardCap 1000 USD → full 3-day itinerary
   with day subtotals and a budget table (all categories "fits").
2. Set a **custom 18% markup** (e2e only ever exercises the 15% default),
   quoted → 6 holds with net/markup/client price/hold-expiry per row, EUR net
   rates FX-converted to USD client prices consistently (45.00 EUR → 57.35 USD
   = 48.60 × 1.18). Booked all 6 → confirmation with a booking reference and
   per-component supplier refs (client total 410.41 USD).
3. Listed the trip on the marketplace: fee 250 USD, terms, **declared 7.5%
   revenue share** (not the 10% default — deliberate seed-0009d-b probe).
   Unvetted attempt refused with a clear typed message; after operator-side
   vetting (psql arrangement, same as `tests/e2e/support.ts`) the same form
   submitted and the card went live showing the verbatim terms + "Your listing".
4. **Reseller** (Rio, "Nomad Atlas GP3"): signed up, saw the listing
   cross-tenant, clicked License **while unvetted** (a path the e2e never
   exercises) → excellent refusal: "Licensing needs both agencies vetted for
   the marketplace — vetting is a platform-operator action." Vetted, licensed
   → receipt with the conserved split **250.00 = 225.00 seller credit + 25.00
   platform take** and a copy reference.
5. Looked for the promised white-label copy: the receipt says "is now in your
   workspace", but `/workspace` has **no itinerary list at all** — only the
   planner form. The copy only becomes visible inside the marketplace sell-form
   picker, labeled with the ORIGINAL title, and only after a page reload (the
   sell panel said "Nothing to list yet" on the same page that showed the
   receipt).
6. **Re-listed the white-label copy** (fee 400 USD, declared 5% share) — the
   platform allowed it. **Third agency** (Vera, "Vega Voyages GP3") signed up,
   was vetted, licensed the resale → receipt **400.00 = 360.00 to the reseller
   + 40.00 platform. The original seller received nothing.**
7. Verified in Postgres: `marketplace_listing.revenue_share_bps` stored
   verbatim (750/500); `revenue_share_ledger` conserved on both trades, no row
   credits the original seller on the resale; `pmf_event take_rate_accrued`
   carries the full conserved split (seed-0006b FR-014 verified live); copy
   provenance carries `rebrandLineage` + `originalAuthorAgencyId` across both
   generations.
8. **Provenance-mutation control experiment**: as Vega, licensed the ORIGINAL
   listing too — the fresh copy is stamped `revenueShareBps: 750` + the
   seller's exact terms, proving license-time stamping is correct. Therefore
   Nomad's copy (now showing 500 + Nomad's own resale terms) was **overwritten
   in place by the act of re-listing**.
9. Encoded the whole journey as
   `scenarios/incubating/golden-path-trade-live/scenario.mjs` — 28 checks:
   27 green, 1 intentional known-red pinning the provenance mutation.

## What Worked

- The entire golden path is REAL end-to-end: sign-up → AI draft → quote →
  book → list → cross-tenant license → white-label copy, three agencies, no
  crashes, zero browser-console errors, compose logs clean (the only ERROR
  lines were my own mistyped psql probes).
- **Money is exact everywhere it exists**: quote rows are net × (1+markup)
  rounded in minor units; `markup_ledger` conserves `net + markup = sell` on
  all 6 rows including FX-converted nets; both license splits conserve
  `price = platform_take + seller_credit` at the fixed 10% take; the PMF
  `take_rate_accrued` event carries the full split (2500/25000/22500).
- Custom 18% markup flowed UI → quote → ledger without loss (fresh coverage —
  every existing journey pins the 1500-bps default).
- Declared revenue share (7.5%) stored verbatim in the listing row and shown
  verbatim on the card — **seed-0009d-b did NOT reproduce** on the plain
  fill-once path (UI or API), even across the unvetted-refusal → resubmit hop.
- The vetting trust gate is real on BOTH sides (list and license), with typed,
  human refusals; the unvetted-license message is exemplary.
- Attribution lineage survives two generations (`rebrandLineage` chain +
  `originalAuthorAgencyId` intact on the copy-of-a-copy).
- FakeLLM keyless demo path held up for the full journey — no API credit
  needed for any of this.

## Friction Points

1. Vetting has no UI surface at all (by design, operator action) — but the
   *seller-side* refusal message ("isn't vetted for the marketplace yet")
   doesn't tell the user how vetting happens, unlike the license-side message
   which names it a platform-operator action.
2. The sell-form's "License fee" label only gains its currency suffix
   ("License fee (USD)") after an itinerary is picked — before that a user
   doesn't know what currency they're pricing in.
3. Environment, not product: the shared Playwright MCP browser dropped all
   tabs mid-flow once (the re-list submission survived server-side) and
   carried stale third-party tabs from earlier sessions — consistent with the
   known UAT-contamination pattern; worth remembering the evaluator must get a
   reset browser.

## Bugs Found

**[BUG-1] Re-listing a licensed copy OVERWRITES its provenance — the
licensed-under terms are erased** (high; Constitution VI provenance
integrity). Repro: license a listing declared at 750 bps → copy provenance =
`{revenueShareBps: 750, licenseTerms: <seller's>}` (correct, proven by control
experiment); re-list that copy declaring 500 bps → the SAME copy's provenance
now reads `{revenueShareBps: 500, licenseTerms: <reseller's>}`. The platform's
stamp of the first trade is destroyed; the marketplace's own promise —
"Declare the terms once — the platform stamps them into the itinerary's
provenance" — is silently violated by the next actor in the chain. Witnessed
in DB before/after; pinned as an intentional known-red assertion in
`scenarios/incubating/golden-path-trade-live/scenario.mjs`. Fix is
revenue-share/provenance semantics (+ likely a provenance-shape change in the
canonical schema) → **operator gate, desk row RESALE-SHARE-SEMANTICS**.

**[BUG-2] Resale pays the original seller nothing while the UI promises "earn
a share on every resale"** (high; money vs. product copy). The resale split is
two-way (400.00 → 360.00 reseller + 40.00 platform); the declared 7.5% drives
no money and no ledger row credits the original author. Marketplace page copy:
"list your own and earn a share on every resale. Provenance and revenue share
are enforced by the platform on every trade." Either the money is missing or
the copy overpromises v0 — that decision is DIRECTIVE ALWAYS-HALT territory →
**desk row RESALE-SHARE-SEMANTICS** (scenario logs the observation without
asserting either semantic).

**[BUG-3] The sell panel contradicts the license receipt until a page
reload** (medium). Immediately after licensing, the receipt says the copy "is
now in your workspace" while the SAME page's "Sell a trip" panel still says
"Nothing to list yet" (and an already-populated picker doesn't gain the new
copy). The browse panel refreshes without reload (FR-011) — the sell-form's
itinerary projection doesn't. Repro: fresh agency → license anything → read
the sell panel without reloading.

## Missing Features

**[FEAT-1] No workspace itinerary surface** (medium-high). Nothing in
`/workspace` lists the agency's itineraries — not drafts, not booked trips,
not licensed white-label copies. The license receipt's "in your workspace" is
only true via the marketplace picker after reload. `workspace.itinerary.list`
already exists (built for the picker) — this is a missing UI panel, not a
missing API.

**[FEAT-2] White-label copies are indistinguishable from originals**
(medium). After licensing both listings, Vega's picker shows two identical
"Paris balanced trip (USD)" options that carry materially different
licensed-under obligations (750 vs 500 bps). No licensed-copy marker, no
lineage hint, and cross-tenant listing cards carry no platform-authored
"resale / generation 2" badge either — a buyer can't tell a copy-of-a-copy
from an original (only the reseller's voluntary free-text terms said so).

## Improvements

**[IMP-1] Keyless-demo draft realism** (low): the FakeLLM 3-night Paris plan
books a stay for night 1 only and puts an *airport→city* shuttle on the final
day. Deterministic fixture, but this is the plan every keyless demo shows —
against the operator's premium-demo bar it reads as a broken plan, not a
placeholder.

**[IMP-2] Seller-side vetting refusal should say who vets** (low): mirror the
license-side message ("vetting is a platform-operator action") in the listing
refusal.

## Tests Added

- `scenarios/incubating/golden-path-trade-live/scenario.mjs` — L3-style live
  journey, 28 state-delta checks against the platform's own integers (markup
  ledger conservation, split conservation, PMF split, verbatim bps, provenance
  stamps, 2-generation lineage). 27 green + 1 intentional known-red pinning
  BUG-1 (documented in the README; do not weaken).
- `scenarios/incubating/golden-path-trade-live/README.md` — run instructions,
  known-red rationale, and the not-asserted operator question.

## Verification Results

- **Lint**: PASS (`pnpm run lint` in the built image; caught + fixed one
  unused import in the new scenario itself).
- **L1/L2 (`pnpm test` in the built image)**: PASS — 309 passed, 37 skipped
  (the skips are the L3 DB suites, exercised under the regress boot), 28 files.
- **L3 smoke (`node tests/integration/smoke.mjs` vs the live stack)**: PASS
  (full check list green — Priority-Zero confirmation that the wired oracle
  passes).
- **Scenario**: 27/28 (1 intentional known-red, BUG-1 pin), exit 1 by design.
- Host `pnpm` was not re-attempted this session (desk row ENV-PNPM-DENY
  stands); all verification ran in-image per the established recipe.

## Outcome

**SUCCESS** — the composed golden path works end-to-end with exact, conserved
money on every path that exists; the iteration's real product findings are at
the resale seam: provenance mutation on re-list (BUG-1), missing upstream
share vs. UI promise (BUG-2), plus a stale sell panel (BUG-3) and two missing
surfaces (workspace itinerary list, licensed-copy distinguishability). The
resale semantics decision is on the operator desk as RESALE-SHARE-SEMANTICS;
everything loop-executable is in this report for triage. Coverage 3/36 →
13/36 (36.1%).
