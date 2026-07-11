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

---

# Kitchen Loop Report - Iteration 3 — THIRD IDEATE PASS (2026-07-11)

> Appended per loop convention: iteration 3 runs multiple ideate passes; earlier
> sections above are the first (golden-path) and second (content-library) passes.

## Scenario: Reseller Operates the Copy — book net-rate inventory inside a licensed white-label itinerary, client views the branded booked trip
**Date**: 2026-07-11
**Mode**: strategy
**Tier**: T2 Composition
**Features Exercised**: booking (primary) × marketplace + revenue-share (arrangement) — platforms web+api, user_types agent-reseller + client
**Coverage combos targeted** (all untested before this pass): booking×api×agent-reseller, booking×web×agent-reseller, booking×api×client, booking×web×client

## What I Did (as a user)

Feasibility (Codex): REDIRECT — predicted the client view would not reflect
booked sell prices because it projects the document's `pricing.sellPrice` while
booking writes to the booking tables only. Adjustment logged: ideate acts as a
user, so instead of pre-fixing the seam I kept the scenario and MEASURED it
(the prediction proved right — see BUG-1). Stack: compose built + booted
keyless (FakeLLM deterministic planner).

API pass (`scenarios/incubating/reseller-books-copy-live/scenario.mjs`, 40
checks, all green):
1. Seller agency drafts a Lisbon trip (AI planner), gets vetted
   (operator-side psql arrangement), lists it at 300.00 USD / 600 bps share.
2. Reseller agency licenses the listing → white-label copy.
3. Tenancy probe: reseller quotes the SELLER's original → `NOT_FOUND`, no
   existence oracle.
4. Reseller quotes THEIR copy at **2200 bps** → 6 components held, every row
   carries 2200 bps priced in USD (net×1.22 exact on USD nets; EUR nets
   FX-converted first).
5. Books all 6 → confirmed with supplier refs. State-deltas: reseller's
   `markup_ledger` conserves net+markup=sell on all 6 rows and equals the held
   sells exactly; the seller's ledger has ZERO rows (money isolation).
6. Reseller mints the share link for the copy; anonymous `clientView.itinerary`
   resolves it: reseller branding, 6 booked marks, structural allowlist clean
   (no netMinor/netRate/markupBps/supplierBookingId/supplyRef/provenance/
   agencyId/budget), original seller agency and platform name absent; SSR
   `/view/<token>` page the same incl. tab title; guessed token → typed
   neutral `not_found`.

Browser pass (Playwright, evidence in `.kitchenloop/evidence/iter-3-ideate-c/`):
fresh reseller-B agency arranged via API (licensed the same listing), then all
booking work done in the real UI — sign-in → workspace list shows the copy
(seed-0017 panel) → open → "Book this trip at your markup" → set 22% → "Quote
live prices" (6-row table: Net rate / Markup / Client price / Hold expiry) →
"Book selected items" → "Booking confirmed" with per-component supplier refs →
"Share with client" → copy link → open `/view/<token>` in a second tab as the
traveler → reseller-branded page, all items "Booked", clean tab title; bogus
token renders the neutral "This trip link isn't available" page.

Verification: in-image `pnpm test` → 315 passed / 38 skipped (DB-bound L3
skips, consistent with prior runs). Compose log scan: web/migrate clean; the
single postgres ERROR is my own first-run harness query (`markup_bps` column
doesn't exist in `markup_ledger` — it stores integer money, not bps),
self-inflicted and benign.

## What Worked

- **The traded good is operable — licensing D8 intent proven live for the
  first time.** A licensed white-label copy quotes and books end-to-end (API
  and UI) because licensing inherits `tripRequest`; supply re-registers
  idempotently in a fresh process.
- **Markup independence.** The reseller's 2200 bps applied to every held row,
  independent of the seller's markup and the 1500 default; FX-converted rows
  (EUR nets → USD sells) still carry the exact markup.
- **Money isolation across the trade.** All booking money landed on the
  reseller's ledger, conserved row-by-row; the seller's ledger untouched.
- **Tenancy holds on the money path**: the reseller cannot even quote the
  seller's original (NOT_FOUND, indistinguishable from nonexistent).
- **White-label promise kept on identity**: client surface names the RESELLER
  only — original seller absent, platform absent, tab title clean (the INV-020
  class regression stayed fixed).
- **The booking UI is genuinely good**: transparent quote table (net / markup /
  client price / hold expiry per row), per-component supplier refs on the
  confirmation, "booked items stay booked" idempotency note.
- **Neutral unavailable state** for guessed/expired tokens — no existence
  oracle, still white-labeled.

## Friction Points

- **FRICTION-1**: Nothing in the workspace list, the open view, or the share
  panel marks the trip as a *licensed copy* (already filed: seed-0018 —
  confirmed live again from the reseller's seat; not re-filed).
- **FRICTION-2**: The UI "Markup %" spinbutton only takes whole percents while
  the API takes bps — an agency wanting 22.5% cannot express it in the UI.
- **FRICTION-3**: The workspace day subtotals ("Day subtotal: 198.60 USD") sum
  the document's stored sellPrice — i.e. the NET prices (BUG-1 root). After
  booking at 22% the page still shows the same net-based subtotals right above
  the booking confirmation showing the real client prices; the agent sees two
  totals that disagree with no explanation.

## Bugs Found

- **[BUG-1] Client view prices a BOOKED trip at the agency's confidential net
  rates** (severity: high — money-trust, client-facing; cross-spec seam).
  Reproduction: draft → license → book at any markup → share → open
  `/view/<token>`. Observed live: client page shows trip total **347.80 USD**
  while the booking confirmation for the same trip shows **424.31 USD** of
  client prices (delta = exactly the 22% markup); per-item DB probe confirms
  `document.pricing.sellPrice == pricing.netRate` on all 6 items.
  Causal chain (each part locally "correct", the composition broken):
  1. `packages/domain/src/assemble.ts:166` — `pricing = { netRate: priced,
     sellPrice: priced }` with comment "markup applies at quote time (FR-007)";
  2. the quote/book flow computes the real sell (net×markup) into
     `booking_quote`/`booking_component`/`markup_ledger` but never writes it
     back to the canonical document;
  3. spec 010 deliberately projects the document's stored sellPrice ("does not
     re-quote live inventory") — written for the un-booked case, silent on the
     booked case.
  The canonical schema itself documents the violated contract:
  `packages/itinerary-schema/src/item.ts:16` — `sellPrice … // client-facing
  (net + agency markup)`. Impact: margin exposure (the traveler reads the
  agency's exact cost — the share panel even promises "your brand, your
  prices"), and a contractual price mismatch beside a "Booked" badge. This
  affects ORIGINALS exactly as it affects copies — the reseller journey just
  made the markup delta visible.
  Suggested routing: product fix + spec amendment through the speckit flow
  (specs 005/010) — e.g. stamp the booked sell into the document at book time,
  or project booked-component sells at read time. NOT an ALWAYS-HALT item (no
  schema version bump — the field's semantics are already documented; no
  revenue-share/client-ownership change), but the chosen fix touches the
  canonical document write path, so the plan must say which. Credit: the Codex
  feasibility check predicted this seam.
- **[BUG-2] Departure-day transfer title contradicts its route in the client
  view** (severity: low — content realism, FakeLLM path). Day-3 item renders
  title "Shared shuttle Porto Airport → Porto" while its schedule line says
  "Porto → Porto Airport · shared" (from/to are the return leg; the title is
  still the arrival leg's). Adjacent to seed-0019 (FakeLLM plan realism) —
  triage may fold it in there rather than open a new ticket.

## Missing Features

- **[FEAT-1] No booked-price surface for the traveler**: even once BUG-1's
  storage question is settled, the client view has no notion of "what you will
  actually be charged" vs "estimated price" — booked items show the same
  price field as unbooked proposals with only a badge to distinguish them.
  A booked item's price is contractual; the view could distinguish estimate
  vs confirmed price. (Report-only; folds into the BUG-1 spec amendment.)

## Improvements

- **[IMP-1] Fractional markup in the booking panel** (FRICTION-2): accept
  decimals in the Markup % input (API already speaks bps).
- **[IMP-2] Reconcile workspace subtotals after booking** (FRICTION-3): once
  BUG-1's fix decides where the booked sell lives, the workspace day subtotals
  should read from the same source so the agent never sees two disagreeing
  totals on one page.

## Tests Added

- `scenarios/incubating/reseller-books-copy-live/scenario.mjs` — 40-check
  L3-style live scenario (4-layer: real requests → parsed → money/provenance
  state-deltas against compose Postgres), exit 0 green. Price-fidelity is a
  logged observation, not an assertion, pending the BUG-1 product decision —
  once fixed it should be promoted to a hard check.

## Outcome

**SUCCESS** — the composition works: a licensed white-label copy is fully
operable (quote/book at the reseller's own markup, money conserved and
isolated, client share branded to the reseller). One high-severity cross-spec
finding (BUG-1: booked client view shows net rates) with root cause pinned to
the draft-time `sellPrice = netRate` placeholder that nothing ever updates;
one low-severity content bug; two improvements. 4 previously-untested coverage
cells exercised (booking × {web,api} × {agent-reseller,client}); the two
client cells recorded as FAIL on BUG-1 evidence. Stack torn down after the
pass (`docker compose down -v`) to leave a clean slate for later phases.

---

# Kitchen Loop Report - Iteration 3 — FOURTH IDEATE PASS (2026-07-11)

<!-- Appended as a fourth pass: the 2026-07-11 loop run re-derived "iteration 3"
     (REGRESS-ARTIFACT-LOSS iteration-counter skew, see OPERATOR-DESK). This pass
     follows the third pass (reseller-books-copy) whose BUG-1 became seed-0025,
     fixed and merged via PR #36 before this pass started. -->

## Scenario: Client Reads a Partially-Booked Trip — estimates vs confirmed prices on the share link
**Date**: 2026-07-11
**Mode**: strategy
**Tier**: T2 Composition
**Features Exercised**: itinerary-builder, booking (platforms: web + api; user type under test: client, arranged by agent-seller)
**Codex check**: PROCEED — confirmed the booking UI exposes per-row checkboxes
and `workspace.booking.book` accepts a subset of quoteRowIds; flagged that the
novel surface is exactly the estimate→mixed transition of ONE share link over
time, which no existing e2e/UAT journey exercises (they all book the full trip
in one generation).

## What I Did (as a user)

All against a fresh keyless compose stack (`down -v` then `up --build --wait`,
empty `ANTHROPIC_API_KEY` → FakeLLM planner), driven in a real browser
(Playwright MCP) with anonymous curl/API reads playing the traveler. Evidence
screenshots in `.kitchenloop/evidence/iter-3-ideate-d/` (git-ignored).

1. **Agent** (Dana, "Atlas Peak Travel GP4"): signed up, drafted Barcelona
   2026-09-10→13, 2 adults, balanced, hardCap 1000 USD → 3-day itinerary,
   6 items, stored draft prices summing 347.80 USD, budget table all "fits".
2. **Shared the un-booked draft** and read it as the anonymous client: page
   says "Trip total 347.80 USD **includes estimates**", every item carries an
   "estimate" tag, nothing claims confirmed or Booked (spec 013 US3 + US2-AS2),
   white-labeled title "Barcelona balanced trip — Atlas Peak Travel GP4".
3. **Quoted at 22%** (non-default): 6 rows with per-row Book checkboxes, net /
   markup / client price / hold expiry visible to the agent, EUR nets
   FX-converted to USD sells. **Unchecked 3 rows and booked only the Day-1
   subset** (transfer 30.50 + stay 152.50 + tour 59.29 = 242.29 USD).
   Confirmation listed exactly the 3 selected components with supplier refs.
4. **Re-read the same share link as the client** (curl, no cookies): total is
   now "391.49 USD includes estimates" — the exact integer fold of 3 booked
   sells (24229) + 3 stored estimates (14920). Booked items show a "Booked"
   badge and their booking's client price with NO estimate tag; un-booked items
   keep "estimate". The stay's 125.00 net appears nowhere; no markup, supplier
   ref, tenant id, or platform brand anywhere in page or payload.
5. **"Book the rest later" at a different markup**: reopened the trip from the
   workspace list, re-quoted at 25%. The three booked items render "Already
   booked — this item is covered by an existing booking" (no re-hold, spec 005
   FR-016 exclusivity made visible); the three un-booked items quoted at 25%.
   Booked ONLY the river cruise (94.50 USD), leaving two items held-but-never-
   booked.
6. **Client re-read, two booking generations live on one trip**: cruise shows
   94.50 (its own generation's recorded sell — not the 92.23 the earlier 22%
   quote would have produced, not the 75.60 estimate); the first-generation
   items still show their 22% sells; the two held-but-never-booked items stay
   plain estimates (holds invisible to travelers); total 410.39 USD, exact.
7. **API-platform traveler payload** (`clientView.itinerary`, anonymous):
   structurally clean allowlist — `kind/title/booked/sellMinor` + kind fields
   only; `totalSellMinor` 41039 exact; no net/markup/supplier/tenant keys.
8. **State deltas in compose Postgres**: 4 `booking_component` rows (never
   over-books), 2 confirmed bookings (one per generation), `markup_ledger`
   conserves net+markup=sell on all 4 rows, and component sells == ledger
   sells == the client view's booked prices.
9. **Edge cases**: unknown token → typed "This trip link isn't available"
   page titled neutrally "Your trip" (no existence oracle, no branding);
   zero browser-console errors all session; compose-log scan clean (the only
   ERROR lines were my own mistyped psql probes — the benign class).
10. Encoded the whole journey as
    `scenarios/incubating/partially-booked-client-view/scenario.mjs` —
    **39 checks, ALL GREEN, exit 0** — and ran the in-image suite
    (`pnpm test`: 321 passed / 40 DB-gated skips) + `eslint .` clean.

## What Worked

- **Spec 013 holds live in its untested quadrant.** PR #36 was only ever
  live-verified on a FULLY booked trip; this pass proves the partially-booked
  and two-generation cases: per-item booked sells from the booking records,
  estimates from the stored document, one honest fold, retroactively on the
  same link (US1-AS3: no re-share needed — the identical URL transitioned
  through all three life stages).
- **Confirmed-vs-estimate distinction (US2/FR-004) is real and readable**:
  "Booked" badge + unqualified price vs "estimate" tag, and the total is
  qualified with "includes estimates" whenever any estimate is in the fold.
- **Mixed-markup fidelity**: each booked item prices at ITS OWN generation's
  recorded sell (22% and 25% coexisting on one trip) — nothing recomputes,
  nothing averages.
- **Item-level exclusivity is user-visible**: the re-quote labels covered
  items "Already booked" and the confirmation copy says "the platform never
  books an item twice" — and the DB agrees (4 components for 4 booked items).
- **Trust boundary held under composition**: net rates visible to the agent in
  the quote table never reached the traveler in any of the three life stages,
  structurally (payload key-set check) and visually (page-text scan).
- Holds that never became bookings stayed invisible to the traveler (spec 010
  assumption confirmed on the partial path).

## Friction Points

- **[FRICTION-1] The agent can't see WHICH items are booked in their own
  workspace.** The reopened trip says only "Bookings on this trip: confirmed
  (11 Jul 2026)" — no per-item Booked marks, no booked-vs-remaining summary.
  The only way to learn what's left is to run a fresh quote and read the
  "Already booked" rows. The CLIENT view is currently better-informed about
  booking state than the agent's own workspace. (Adjacent to seed-0026's
  price-reconciliation but distinct: this is booked-STATE visibility, not
  subtotal math.)
- **[FRICTION-2] Markup resets to the 15% default on every reopen/re-quote.**
  My first generation booked at 22%; when I reopened the trip the field showed
  15 again. An agent "booking the rest later" who doesn't remember their
  earlier markup will silently quote the remainder at a different rate than
  the client already saw booked — legal, conserved, but a coherence trap. The
  workspace shows the booked generations' markups nowhere.
- **[FRICTION-3] (observation, spec-accepted)** Un-booked estimates ARE the
  pre-markup stored prices (spec 013 FR-003 keeps draft-estimate semantics),
  so a traveler watching the link over time sees e.g. "25.00 estimate" become
  "30.50 Booked" — every estimate steps UP by the markup when it confirms.
  Price-anchoring risk on the client relationship; deliberately out of scope
  for 013 (the estimate would need the intended markup applied at draft or
  share time, an operator-relevant product decision, and interacts with
  seed-0026's same-source rule). Report-only.

## Bugs Found

None. All spec-pinned behaviors held on the previously-unexercised partial and
two-generation paths, on both platforms, at every life stage. (18 first-run
scenario-script failures were my own script's wrong guess at the
`workspace.itinerary.get` response shape — the product responses were correct
throughout; fixed in the script, not the product.)

## Missing Features

- **[FEAT-1] Booked-state surface for the agent**: per-item booked indicators
  and a booked/remaining summary in the workspace trip view (FRICTION-1), and
  the markups already realized per generation (FRICTION-2). Today that
  information exists only in the client view, the confirmation flash, and the
  quote table's "Already booked" rows.

## Improvements

- **[IMP-1] Remember or display the trip's last-used/booked markup** in the
  booking panel instead of always resetting to 15% (FRICTION-2) — cheap
  guard against unintentionally mixed client pricing.

## Tests Added

- `scenarios/incubating/partially-booked-client-view/scenario.mjs` — 39-check
  L3-style live scenario (4-layer: real HTTP → parsed → money/trust
  state-deltas against compose Postgres) covering the three life stages of one
  share link (all-estimates → partial 22% → two generations 22%+25%), the
  exclusivity-protected re-quote, holds-invisible-to-travelers, the structural
  trust-boundary key scan, and unknown-token. Exit 0 green against the built
  stack.

## Outcome

**SUCCESS** — clean pass, zero product bugs. Spec 013's partially-booked
quadrant (US2/US3, FR-002/003/004/005) verified live on web + api for the
client user type, composed with itinerary-builder and two booking generations
at distinct markups. 4 coverage cells recorded: itinerary-builder ×
{web,api} × client (first-ever test) and booking × {web,api} × client
re-recorded PASS post-seed-0025 (they were FAIL-on-BUG-1 at third-pass time).
One missing-feature finding (agent-side booked-state surface) and one
improvement (markup continuity) for triage. In-image suite 321/321 non-skipped
green, lint clean. Stack torn down after the pass (`docker compose down -v`)
to leave a clean slate for later phases.

---

# Kitchen Loop Report - Iteration 3 — FIFTH IDEATE PASS (2026-07-11)

## Scenario: The Seller Gets Paid — But Is Never Told (seller-side revenue-share visibility)
**Date**: 2026-07-11
**Mode**: strategy
**Tier**: T3 Frontier (reframed from T2 after Codex REJECT — the seller-earnings surface does not exist; the gap IS the deliverable)
**Features Exercised**: revenue-share (primary) × marketplace (arrangement) — platforms web+api, user_types agent-seller + client
**Coverage combos targeted** (all untested): revenue-share×web×agent-seller, revenue-share×api×agent-seller, revenue-share×web×client, revenue-share×api×client
**Scope guard**: first-sale split only — resale-split semantics are desk-pending (RESALE-SHARE-SEMANTICS) and NOT asserted here.
**Codex check**: REJECT on the T2 framing ("acting as the seller cannot produce
surface evidence — no seller-side earnings surface exists"), which is itself the
finding; reframed per its salvage analysis as a T3 gap-analysis pass and re-run:
PROCEED ("pivots from proving the first-sale money path works to proving the
seller cannot discover they were paid — directly tied to marketplace liquidity
and revenue-share integrity"). Candidate note: the only exploration ticket in
the queue (seed-0029, estimate-vs-booked price anchoring) was passed over — it
was already observed live in the fourth pass and pends an operator product
decision, not more testing.

## What I Did (as a user)

All against a fresh keyless compose stack (`docker compose up --build --wait`,
`.env` key commented → FakeLLM planner), API journey encoded as
`scenarios/incubating/revenue-share-seller-visibility/scenario.mjs` (26 checks,
ALL GREEN, exit 0), seller seat walked in a real browser (Playwright MCP);
screenshots in `.kitchenloop/evidence/iter-3-ideate-e/` (git-ignored).

1. **Arranged a real first-sale trade**: seller agency ("Meridian Seller")
   drafted Paris 2026-09-01→04 with the AI planner, got vetted (operator-side
   psql, spec 011 D10 pattern), listed at **331.00 USD / 7.5% share** with
   distinctive terms; a vetted reseller agency licensed it.
2. **Verified everything that EXISTS about the split** (state-deltas against
   compose Postgres): buyer-side receipt 33100 = 3310 + 29790 at the fixed 10%
   take; `revenue_share_ledger` holds exactly one conserved row crediting the
   seller (INV-012, price = take + credit, USD); PMF `take_rate_accrued` for
   the seller agency carries the full split (seed-0006b FR-014).
3. **Walked the SELLER's every read surface hunting for "you earned 297.90"**:
   - Browser: workspace (planner + trips list), the opened trip view, and the
     marketplace panel — no earnings figure, no "licensed N times" count, not
     even a "listed on marketplace" mark on the trip itself (e-01…e-03).
   - API: `browseListings` is the seller's only marketplace read; a deep
     key-scan of its payload finds zero earnings-semantics keys (GAP PIN);
     probed `workspace.marketplace.earnings` / `.licenses` → 404, no such
     procedures (GAP PIN).
4. **User re-submit probe**: the sell form still offers the already-listed
   itinerary in its picker; filled and submitted it → typed refusal "This
   itinerary already has an active marketplace listing." (`already_listed` +
   the EXISTING listing id), state conserved (1 listing row, 750 bps verbatim)
   (e-04).
5. **Traveler side of the same trade, both platforms** (revenue-share×client):
   reseller shared the licensed copy, seller shared the listed original —
   anonymous `clientView.itinerary` payloads and SSR `/view/<token>` pages
   structurally free of revenue-share data: forbidden-key scan (provenance,
   revenueShareBps, platformTake/sellerCredit, priceMinor, licenseTerms,
   net/markup, agencyId) empty; text scan for the trade's distinctive amounts
   ("331.00", "33.10", "297.90"), "revenue", "platform take", and the terms
   string all clean; copy page white-labeled to the reseller (original seller
   agency name absent, tab title reseller-branded) and the original's page
   never mentions its own listing title (e-05).
6. Zero browser-console errors all session; compose-log scan clean (zero
   ERROR/FATAL/Unhandled lines — first pass this iteration with a fully silent
   log); in-image verify green: `pnpm test` 321 passed / 40 DB-gated skips
   (consistent with prior runs), `eslint .` clean, both exit 0.

## What Worked

- **Revenue-share integrity is real at the money layer.** The split is
  conserved three ways (receipt, ledger row, PMF event) and immutable — the
  platform's books are exactly right on the first sale.
- **Double-listing is refused typed and idempotent-shaped** (`already_listed`
  with the existing listing id), and the refusal conserves state — a genuinely
  correct money-adjacent guard hit by a plausible user re-submit.
- **The trust boundary holds from BOTH ends of the trade**: neither the
  traveler of the licensed copy nor the traveler of the listed original can
  see fee, split, share bps, terms, or lineage — structurally (key scan) and
  textually — on api and web alike. White-label identity held everywhere.
- **The listing card's declared terms render faithfully** (7.5% share, terms
  verbatim, "Your listing" ownership badge, currency-labeled fee after pick —
  seed-0020's fix visible).
- Clean-log first: an entire multi-agency trade + browser session produced
  zero error lines in compose logs.

## Friction Points

- **[FRICTION-1] The seller cannot discover they were paid — anywhere.** The
  marketplace hero copy PROMISES "list your own and earn a share on every
  resale. Provenance and revenue share are enforced by the platform on every
  trade," and the platform did enforce it (297.90 USD credited in its ledger) —
  but no surface ever tells the seller: the listing card shows only
  rating/terms (identical whether licensed 0 or 50 times), the trip view
  doesn't even mark the trip as listed, and no API procedure projects
  `revenue_share_ledger` seller-side. The buyer got a receipt; the payee got
  silence. (THE frontier gap — FEAT-1.)
- **[FRICTION-2] Offer-then-refuse in the sell form**: the itinerary picker
  still offers an already-listed trip; the user fills the entire form before
  the typed refusal arrives. The picker knows the listings (same page renders
  the card) — it could mark/omit already-listed options.
- **[FRICTION-3] The seller's trip view carries no marketplace state at all**
  (no "Listed · 331.00 USD" chip on the workspace trip) — the agent's own
  workspace is again less informed than the platform's records, rhyming with
  seed-0027's booked-state gap.

## Bugs Found

None. Every asserted behavior held: split conservation (three surfaces),
double-list refusal + conservation, client-side redaction on both platforms,
white-label identity, typed refusals throughout.

## Missing Features

- **[FEAT-1] Seller earnings surface — "you earned X" (P0-shaped, Constitution
  I/VI).** A seller-scoped projection over `revenue_share_ledger` (+ PMF
  events): license count + seller-credit total per listing (card chip), a
  simple earnings list/panel, and a "Listed" mark on the workspace trip. All
  data already exists conserved in the ledger; this is read-side projection +
  UI only — no schema change, no money-semantics change (display of recorded
  splits, so NOT an ALWAYS-HALT item; the fixed-10%-take and split semantics
  stay untouched). What it unlocks: the marketplace-first flywheel — sellers
  list because they SEE income; today the platform's own North-Star behavior
  (GBV through trades) is invisible to the supply side that feeds it. The
  scenario's GAP PINs are written to flip when this lands.

## Improvements

- **[IMP-1] Mark or omit already-listed itineraries in the sell-form picker**
  (FRICTION-2) — the refusal is correct; the offer is the friction.
- **[IMP-2] "Listed on marketplace" state on the workspace trip view**
  (FRICTION-3) — natural sibling of seed-0027's booked-state surface; likely
  the same projection PR as FEAT-1.

## Tests Added

- `scenarios/incubating/revenue-share-seller-visibility/scenario.mjs` — 26-check
  L3-style live scenario (4-layer: real HTTP → parsed → money state-deltas
  against compose Postgres): first-sale split conservation on all three
  recording surfaces, double-list refusal + state conservation, the seller-side
  GAP PINs (no earnings key on the browse payload, no earnings/licenses
  procedure — machine-readable form of FEAT-1, to be flipped when the surface
  lands), and the client redaction matrix (copy + original × api + web).
  Exit 0 green against the built stack.

## Outcome

**SUCCESS** — frontier gap analysis delivered with all 26 checks green on what
exists. The first-sale revenue-share money path is provably conserved and
provably invisible to its payee: TripForge pays sellers correctly and never
tells them. One P0-shaped missing feature (seller earnings surface, FEAT-1)
with its gap pinned mechanically in the scenario; two improvements; zero bugs.
4 coverage cells recorded: revenue-share × {web,api} × agent-seller (the gap
walk + ledger/PMF verification) and revenue-share × {web,api} × client
(redaction, first explicit revenue-share client cells). Stack torn down after
the pass (`docker compose down -v`).
