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

---

# Kitchen Loop Report - Iteration 3 — SECOND IDEATE PASS (2026-07-11)

> **Why a second pass exists in this file**: the loop restarted on 2026-07-11
> and re-derived iteration = 3 because the iteration-3 regress state never
> landed in `docs/internal/loop-state.md` (loop-state history stops at iter 2 —
> the known REGRESS-ARTIFACT-LOSS class; the desk row is already filed). The
> first pass above is a landed artifact (merged to main via #32) and is NOT
> overwritten; this section is the 2026-07-11 ideate run. The first pass's
> coverage-matrix update (3→13/36) was also lost — repaired this pass from the
> landed report's witness.

## Scenario: Content Library Frontier — attach licensed media, preview the branded client view with a gallery
**Date**: 2026-07-11
**Mode**: strategy
**Tier**: T3 Frontier
**Features Exercised**: content-library (+ itinerary-builder, marketplace, trust seams) — platforms: web + api; user types: agent-seller, agent-reseller, client
**Codex check**: REDIRECT — adopted. The scenario as first framed ("attach media via the product") is impossible: `workspace.itinerary` exposes only draft/list/get/share; there is no media attach API, no library UI. Redirected to *licensed-media gap verification*: prove the gap end-to-end as a user, and pin the live behavior of every path that DOES exist for media-bearing canonical documents.

## What I Did (as a user)

All against a fresh live compose stack (`down -v` → `up --build --wait`,
keyless → FakeLLM), first in a real browser (Playwright MCP), then as an
API-level scenario script. Evidence screenshots in
`.kitchenloop/evidence/iter-3-ideate-b/` (git-ignored). Priority-Zero check
first: the wired L3 smoke oracle ran green against the booted stack.

1. **Signed up in the browser** (Mira, "Aster Atlas MediaGap") and drafted
   Paris 2026-09-01→04, 2 adults, balanced, 1000 USD hardCap. Got the full
   3-day draft with budget table. Then hunted for ANYTHING media: the nav has
   only Workspace and Marketplace; the itinerary card has no photo, no image
   slot on any stay/activity, no gallery panel, no attach affordance. The PRD
   Pillar-1 session step ("attach content from the media library") has **zero
   product surface**.
2. **Shared with the client** and opened `/view/<token>` as the traveler:
   a branded, well-typeset, but **entirely text-only** proposal — no imagery
   at all. Against the operator's premium sell-grade bar, a picture-less
   travel proposal is the single most visible gap in the product today.
3. **Probed for hidden affordances via API**: `workspace.itinerary.draft`
   with a `media` key → typed zod refusal (strict input), nothing persisted.
   No other workspace procedure accepts media. Confirmed: no attach path,
   hidden or otherwise.
4. **Verified the dormant schema**: a fresh draft's canonical document
   round-trips `media: []` at both gallery and item level through
   `workspace.itinerary.get` — the `MediaRef` model (closed licensed-only
   source enum per D-006.c) is live in every persisted document, waiting.
5. **Arranged a valid gallery operator-side** (psql, same pattern as vetting)
   — licensed-stock + agent-upload refs with sentinel storage keys and an
   attribution naming the authoring agency — then walked every existing read
   path: agent `get` returns the gallery intact (INV-001 re-validation
   passes); share-link mint works; the public `clientView.itinerary` payload
   is **structurally free of media** (no key, no sentinel values); the
   `/view` SSR page renders branded and text-only. The trust boundary
   allowlist does exactly what its design comment promises.
6. **Traded the media-bearing itinerary on the marketplace** (vetted seller,
   listed; vetted second agency "Nomad Media", licensed): the white-label
   copy carries the gallery **verbatim** — including the agent-upload
   attribution naming the ORIGINAL agency — with no rights model anywhere in
   the flow.
7. **Attacked the closed enum** (D-006.c): arranged a second itinerary whose
   media `source` is `"scraped-web"` (share link minted before the
   arrangement). Every surface refused: agent `get` errors, public clientView
   never serves the scraped sentinel, `/view` never renders it. But all three
   refusals are **raw 500s** (ZodError → INTERNAL_SERVER_ERROR + stack in
   compose logs), not typed unavailable states.
8. Encoded the whole probe as
   `scenarios/incubating/content-library-media-gap/scenario.mjs` — **20
   checks, 20 green** on first run.

## What Worked

- **The trust boundary is exemplary.** The client-view allowlist projection
  (spec 010 FR-007) held against data-level media on payload AND page: a
  field the projection never named is structurally absent, exactly as the
  design comment promises ("confidential by default until explicitly
  allowlisted"). This is the right foundation to build a gallery on.
- **The closed media-source enum is enforced live** (INV-001 boundary
  re-validation): scraped/AI-fabricated-class imagery cannot reach a traveler
  through any surface, even when planted in the store.
- **Strict inputs everywhere**: the smuggled `media` key was refused typed
  with nothing persisted — no silent-ignore trap.
- **Every existing path tolerates media-bearing documents**: get, share,
  public resolve, SSR page, listing (stamp + re-validate), licensing
  (white-label copy). Whenever attach lands, the pipes already work.
- L3 smoke green (Priority Zero), in-image L1/L2 309 passed / 37 skipped,
  lint clean, compose logs clean except my own arranged-invalid-document
  probe (self-inflicted, and itself the D-006.c witness).

## Friction Points

1. **Unparseable documents crash instead of degrading** (see BUG-b1): a
   stored document that fails canonical re-validation turns agent `get`, the
   public `clientView.itinerary`, and the `/view` page into raw 500s with
   stack traces in the logs.
2. The FakeLLM demo plan's day-3 return transfer is titled "Shared shuttle
   Paris Airport → Paris" while its own detail line reads "Paris → Paris
   Airport" — the title contradicts the from/to on the return leg. Same
   demo-realism family as the already-filed seed-0019 (fold into its scope;
   not a new ticket).
3. Loop process, not product: this is the SECOND ideate pass numbered
   "iteration 3" — the loop restarted 2026-07-11 and re-derived iteration 3
   because the first pass's regress state never landed in `loop-state.md`,
   and its coverage-matrix update (3→13/36) was lost the same way
   (REGRESS-ARTIFACT-LOSS class; evidence appended to the existing desk row —
   matrix repaired this pass from the landed report's witness).

## Bugs Found

**[BUG-b1] A stored document that fails canonical re-validation produces raw
500s on every read surface — including the traveler-facing share link**
(medium). Spec 010 promises typed unavailable states ("not_found is a
payload, never an error … the unavailable state reveals nothing"), and the
share link is a durable URL in a client's inbox. Any document the current
schema refuses (future: a legacy document after a schema evolution, a bad
migration, operator surgery) turns that client-held link into a crash page,
and `workspace.itinerary.get` gives the agent no way to see WHICH document is
broken or why. Repro: `UPDATE itinerary SET document = jsonb_set(document,
'{media}', '[{…"source":"scraped-web"…}]')` → `GET /view/<token>` → 500;
`workspace.itinerary.get` → 500; `clientView.itinerary` → 500. Witnessed in
`scenarios/incubating/content-library-media-gap/scenario.mjs` (boundary
checks green — the refusal is CORRECT, its shape is not) and in the compose
log (ZodError → INTERNAL_SERVER_ERROR). Suggested shape: catch parse failure
in `resolveShareLink`/`itineraryOverview` → typed `not_found`/`unavailable`
for the traveler, a typed diagnostic for the owning agent, and a structured
warn (not a stack) in the log.

## Missing Features

**[FEAT-b1] Content library v0 — the PRD Pillar-1 surface (attach licensed
media, branded client view with a gallery)** (high). Nothing exists between
the canonical schema (complete `MediaRef` model, closed licensed-only source
enum, gallery + per-item arrays — all dormant) and the premium client view
that needs imagery to sell. Gap analysis — what v0 needs, in dependency
order:
  1. **Media storage port + derived tables** (INV-025: the itinerary carries
     only refs; binaries live in Postgres-derived tables/CDN via
     `packages/db`) — a `MediaStorePort` in the supply-adapter port family
     with a local/compose implementation.
  2. **Agency media library API** (`workspace.media.*`): upload
     (`agent-upload`), register licensed stock (`licensed-stock`), list —
     tenant-scoped (INV-004), source enum enforced at the boundary.
  3. **Attach/detach mutations** on the itinerary (gallery + per-item). The
     schema already supports it — **no canonical schema bump needed**, so no
     ALWAYS-HALT migration; this is buildable inside normal loop autonomy
     via speckit.
  4. **Client-view allowlist decision**: projecting alt/kind/serving-URL into
     `ClientItineraryView` is a deliberate change to the trust-boundary
     allowlist (spec 010 FR-007) — a spec amendment through the speckit flow
     with operator review, NOT a silent code change.
  5. **Rendering**: workspace preview + `/view` gallery + marketplace listing
     card imagery, to the premium bar (seed-0009s lineage).
  What it unlocks: sell-grade branded proposals (the operator's stated bar),
  imagery on marketplace cards (today text-only), and the full PRD typical
  session. Today a client-facing travel proposal has zero pictures.

**[FEAT-b2] No media rights model on marketplace trades** (medium, design
needed before FEAT-b1 step 5 reaches the marketplace). Licensing a listing
copies the gallery verbatim into the white-label copy — including
`agent-upload` assets whose attribution names the ORIGINAL agency (pinned
live by the scenario). Once real images exist, a reseller white-labels a trip
whose photos they may have no right to re-brand, and the attribution line
contradicts the white-label promise. Needs a product decision: do
agent-upload assets transfer under the license terms, get stripped from the
copy, or travel with a mandatory attribution obligation? (Adjacent to the
open RESALE-SHARE-SEMANTICS desk row but a distinct decision — this is
content rights, not revenue split. Flagged here for triage as a
spec/design ticket; no semantics were changed this pass.)

## Improvements

**[IMP-b1] Typed media-source refusal message** (low): when media attach
lands (FEAT-b1), a source outside the closed enum should refuse with the
enum's actual member list (the zod error already carries it) — the D-006.c
policy is user-visible today only as a 500.

## Tests Added

- `scenarios/incubating/content-library-media-gap/scenario.mjs` — L3-style
  live gap-verification, 20 state-delta checks against the platform's own
  stored documents and public payloads: strict-input refusal, dormant-schema
  round-trip, valid-gallery flow through all four read paths, trust-boundary
  structural absence (key + sentinel values), verbatim media propagation into
  a white-label copy (pins the FEAT-b2 rights question), closed-enum refusal
  on every surface. 20/20 green — this scenario asserts today's correct
  behavior and will catch regressions when FEAT-b1 lands.
- `scenarios/incubating/content-library-media-gap/README.md` — run
  instructions + what each pin means (the FEAT-b2 green check is a pin, not
  an endorsement).

## Verification Results

- **L3 smoke** (`node tests/integration/smoke.mjs` vs the live stack): PASS —
  Priority-Zero confirmation of the wired oracle.
- **Scenario**: 20/20 green (exit 0), first run.
- **L1/L2** (`pnpm test` in the built image): PASS — 309 passed, 37 skipped
  (the L3 DB suites, exercised under the regress boot), 28 files.
- **Lint** (`pnpm run lint` in the built image): PASS, no findings.
- **Compose log scan**: clean except one self-inflicted ZodError/500 from the
  arranged invalid-media probe (the D-006.c witness; classified benign for
  this run — its EXISTENCE as a raw 500 is BUG-b1).
- Host `pnpm` untouched per desk row ENV-PNPM-DENY; all verification
  in-image per the established recipe. Stack torn down (`down -v`) after.

## Outcome

**SUCCESS** — the frontier gap is now precisely mapped and pinned by a green
20-check live scenario: the content-library feature is exactly one layer of
missing product surface (storage port → library API → attach → allowlist →
render) on top of foundations that all already work — dormant schema, strict
inputs, live closed-enum enforcement, and a trust boundary that held
everything I threw at it. Two real deliverables for triage: the v0 gap
analysis (FEAT-b1, high — the text-only client proposal is the most visible
premium-bar gap in the product) and the media-rights design question
(FEAT-b2) that must be answered before imagery reaches the marketplace, plus
one genuine bug (BUG-b1: unparseable documents brick the traveler's share
link with raw 500s). Coverage repaired + extended: 3/36 recorded → 17/36
(47.2%) — 10 first-pass cells backfilled from the landed report, 4
content-library cells newly exercised this pass.
