# Kitchen Loop Report - Iteration 4

## Scenario: Reseller builds fresh, not just resells
**Date**: 2026-07-12
**Mode**: strategy
**Tier**: T2 (Composition)
**Features Exercised**: itinerary-builder + booking + trust/client-view, crossed with platforms web+api and user_type agent-reseller

## What I Did (as a user)

Before picking a scenario I read `.kitchenloop/coverage-matrix.yaml` (17/36 combos
recorded) but cross-checked it against the actual scenario files in
`scenarios/incubating/` from iteration 3 (6 ideate passes), since the matrix
carries a documented artifact-loss note and `docs/internal/loop-state.md`
claims a different total (30/36) than the file itself shows. Reading all 6
scenario scripts directly (not just their summaries) surfaced the true gap:
**no iteration-3 pass ever had an agent-reseller identity call
`workspace.itinerary.draft`.** Every reseller-role scenario so far only
*operated* a good someone else built — licensing a seller's listing
(`reseller-books-copy-live`), booking a licensed copy, or probing tenancy
negatives (`trust-demand-side-live`). This meant `itinerary-builder x web x
agent-reseller` and `itinerary-builder x api x agent-reseller` were genuinely
untested, not just unrecorded.

Chose the scenario: a demand-side agency with **zero marketplace history**
(never listed, never licensed) signs up and uses the AI itinerary-builder to
draft, book, and share an **original** trip — proving the feature isn't
gated behind having sold or bought something first. Ran a Codex feasibility
check first (`PROCEED` — confirmed `workspace.itinerary.draft` is agent-gated
only, no seller-history check, and that this combination of zero-listing
reseller + fresh draft + web/API parity + booked-price fidelity had no prior
coverage).

Then acted as the user end-to-end against the **live built compose stack**
(`docker compose up --build --wait`):

1. **Live browser (Playwright MCP)**: signed up a fresh agency ("Nomad Demand
   Co"), used the AI planner form to draft an original Prague trip, set a
   custom 20% markup, quoted and booked all 6 items via the web UI, minted a
   client share link, signed out, and — as a signed-out visitor — opened the
   `/view/<token>` link to see the branded, booked trip. Screenshots archived
   to `.kitchenloop/evidence/iter-4-ideate/`.
2. **API companion script** (`scenarios/incubating/reseller-builds-fresh/scenario.mjs`,
   L3-style 4-layer): a second fresh reseller identity ("Waypoint Demand")
   drafts a Vienna trip purely via `workspace.itinerary.draft`, confirms
   `workspace.itinerary.list` parity, quotes/books at a custom 24% markup,
   asserts markup-ledger conservation via `psql` state deltas, shares, and
   **formally asserts** (not just logs) booked-price fidelity on the client
   view — per-item and as an exact-sum zero-delta check against the ledger —
   plus the full structural trust-boundary scan (no net/markup/supplier/
   platform-brand leak) and the typed `not_found` negative for a guessed token.
3. Ran the full oracle stack in the built image: `pnpm run lint` (clean),
   `pnpm test` DB-inclusive (392/392 passed, 39 files), `node
   tests/integration/smoke.mjs` (L3 smoke, all green), and a compose-log
   `ERROR|FATAL|Unhandled` scan (one hit — the documented-benign
   `booking_component_itinerary_item_idx` duplicate-key line from the
   concurrent-booking race test, not a new defect).

## What Worked

- The AI planner, booking flow, and share control impose **no marketplace-
  history gate** — a reseller identity that has never listed or licensed
  anything gets full parity with a seller on itinerary-builder, exactly as
  the PRD's two-sided-marketplace vision implies (agents both build AND
  trade). Confirmed on both web and API.
- **Booked-price fidelity holds** on this third, previously-unasserted code
  path (reseller-self-built, as opposed to seller-direct or licensed-copy).
  The client view showed the exact booked sell price on every item (verified
  both visually in the browser — `387.30 EUR` total, matching `27.90 +
  139.50 + 54.00 + 84.00 + 54.00 + 27.90` — and via a hard zero-delta
  assertion against the markup ledger in the API script: `43126 === 43126`).
  This is the fix landed for BUG-1/seed-0025/PR #36 generalizing correctly
  to a case its own regression tests didn't cover.
- Full trust boundary held on both platforms: raw HTML/RSC payload and the
  tRPC JSON response were both structurally free of `netMinor`, `netRate`,
  `markupBps`, `supplierBookingId`, `supplyRef`, `provenance`, `agencyId`,
  `budget`, and the platform's own name ("TripForge") — verified against the
  *full* rendered surface (page title, meta description, raw HTML), not just
  visible body text (the INV-020 blind-spot class from earlier iterations).
- `workspace.itinerary.list` correctly reflects a self-built trip immediately
  after drafting, both in the browser ("Trips in your workspace") and via API.

## Friction Points

1. **[UX/process] Coverage matrix drift cost real time to work around.**
   `.kitchenloop/coverage-matrix.yaml` records 17/36 tested combos, but
   `docs/internal/loop-state.md`'s iteration-3 regression section claims
   30/36 with a *different* list of remaining gaps — neither of which matched
   reality once I actually read the 6 iteration-3 scenario files. The matrix
   has a self-documented artifact-loss note but no equivalent flag on
   loop-state.md's number, so there's no single trustworthy source for "what
   have we actually tested." I had to read every `scenarios/incubating/*`
   file by hand to find the real gap. Recommend: the regress phase should
   derive the coverage count from the scenario files' own headers/witnesses
   (or a lightweight coverage-claim block each scenario declares) rather than
   a hand-maintained YAML that can silently desync.
2. **[Pattern gotcha] The established `held = quote.data.items.filter(...).map(i => i.quote)`
   idiom (used by `golden-path-trade-live` and `reseller-books-copy-live`)
   silently drops `itemId`.** It works fine for those scripts because they
   never need to correlate a held/booked row back to a specific document
   item. My first draft of this scenario copied that idiom and needed
   `itemId` for per-item price-fidelity correlation — `held.map(r => [r.itemId, ...])`
   silently collapsed every row onto a single `undefined` key (Map size 1
   instead of 6), and the resulting assertion failure looked like a product
   bug at first glance ("all 1 booked items show Booked... view shows 6
   booked of 6") before I traced it to my own script keeping the wrong shape.
   `partially-booked-client-view` gets this right by keeping the outer
   `{itemId, quote}` shape. Worth a one-line comment on the pattern itself so
   the next scenario author doesn't repeat the diagnosis.

## Bugs Found

None. This composition was clean end-to-end — no product defect surfaced.

## Missing Features

- **[FEAT-1] The licensed-copy price-fidelity path is still only an
  observation, not an assertion.** `reseller-books-copy-live`'s README
  explicitly logs (does not assert) a delta between the client view's shown
  price and the reseller's booked ledger sum on a *licensed white-label
  copy*, deferring the classification as "a cross-spec product decision."
  This iteration formally proved the fix generalizes correctly to the
  reseller-**self-built** path (zero delta, hard-asserted). Whether it also
  holds for the reseller-**licensed-copy** path is still unverified with a
  real assertion — worth a follow-up ideate/triage pass that either
  hardens `reseller-books-copy-live`'s observation into an assertion, or
  investigates why the copy path was left soft in the first place (does
  `whiteLabelCopy()` preserve `item.id` across the copy, which the
  `bookedPriceByItemId` lookup in `client-view.ts` depends on?).

## Improvements

- **[IMP-1]** Add a short comment to the `held = ... .map(i => i.quote)`
  idiom in `golden-path-trade-live`/`reseller-books-copy-live` noting it
  drops `itemId`, or standardize all incubating scenarios on the
  `{itemId, quote}`-preserving shape `partially-booked-client-view` uses, so
  future scenario authors don't rediscover this the hard way.

## Tests Added

- `scenarios/incubating/reseller-builds-fresh/scenario.mjs` — 32 checks, L3-style
  4-layer (real requests, parsed responses, Postgres state-delta assertions,
  client trust-boundary scan). All 32 pass against the built compose stack.
- Live browser journey (Playwright MCP, not a committed spec file): sign-up →
  draft → book → share → sign-out → anonymous client view. Evidence
  screenshots in `.kitchenloop/evidence/iter-4-ideate/` (git-ignored):
  `iter4-01-reseller-draft.png`, `iter4-02-reseller-booked.png`,
  `iter4-03-client-view-booked.png`.

## Outcome

SUCCESS — closed a real, confirmed coverage gap (itinerary-builder x
{web,api} x agent-reseller, plus booking x web x agent-reseller) with 32/32
scenario checks green, a clean live-browser journey, 392/392 unit+L3 tests
green, lint clean, and L3 smoke green. No product bugs found; one follow-up
verification gap flagged for triage (FEAT-1, licensed-copy price fidelity).
