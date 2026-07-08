# Research: Budget Allocator + Quote-Then-Book Flow (005)

Phase 0 output. Every decision below was verified against the installed
toolchain (pinned SDK inspected on disk) or the repo's governance docs —
nothing is assumed from memory.

## D1 — Planner architecture: AI proposes, deterministic code guarantees

- **Decision**: `LLMPort` gains one planner operation, `draftItinerary`.
  The model's job is selection + narrative through tool-driven lookups; a
  deterministic pipeline in `packages/api` + `packages/domain` re-verifies
  every proposed offer against the ports, re-prices from real offers,
  enforces budget fit (allocator + rebalance + assemble), and constructs the
  canonical itinerary via `ItinerarySchema`/`parseItinerary`.
- **Rationale**: INV-014 (priced against live inventory, never generated
  text), INV-016 (draft-until-agent-approves), Money-Safe bar (no money value
  originates from tokens). Also makes the keyless compose stack fully
  functional: the FakeLLM implements the same `draftItinerary` contract
  deterministically over the same injected tools, so live verification
  exercises the identical downstream path (INV-019).
- **Alternatives considered**: (a) model emits the full canonical itinerary
  and the server trusts it — rejected: money from tokens, brittle on Haiku,
  violates INV-014; (b) no LLM at all at P0 — rejected: INV-013/ticket
  explicitly wire the planner now, and the port boundary is the cheap moment
  to do it.

## D2 — Structured output on SDK 0.65.0: submit-tool pattern, not messages.parse

- **Decision**: the planner's structured output is captured by a final
  `submit_itinerary_draft` tool (a `betaZodTool` whose zod `inputSchema` IS
  the draft shape). The tool runner loop ends when the model calls it; the
  SDK validates the tool input against the zod schema (invalid input is fed
  back to the model to retry); the run function simply captures the draft.
- **Rationale**: the pinned `@anthropic-ai/sdk` 0.65.0 was inspected on disk:
  `helpers/beta/zod` exports `betaZodTool`, `beta.messages.toolRunner`
  exists with a `max_iterations` option — but there is **no**
  `messages.parse`, no `output_config`, no `zodOutputFormat` in this version.
  The loop runtime cannot regenerate the pnpm lockfile to upgrade (install
  denials; frozen-lockfile image build), so the ticket's
  "messages.parse + zod" intent is delivered at the same guarantee level —
  zod-validated, schema-conformant plans at the SDK boundary — via
  tool-input validation. Documented here so review does not read the
  substitution as silent drift from the ticket text.
- **Alternatives considered**: (a) upgrade the SDK — blocked by the frozen
  lockfile constraint (D4); (b) free-text JSON + manual zod parse with retry
  — weaker: no schema enforcement at the API layer, hand-rolled retry loop
  duplicating what the runner already does.

## D3 — zod versions: llm/api pin ^4.4.3 (already lockfile-resolved), schemas never cross packages

- **Decision**: `packages/llm` and `packages/api` declare `zod@^4.4.3` —
  the exact version already present in the lockfile as the SDK's
  instantiated peer (`@anthropic-ai/sdk@0.65.0(zod@4.4.3)`).
  `packages/itinerary-schema` stays on zod 3 (untouched). No zod schema
  object crosses a package boundary: llm validates its draft vocabulary with
  its own zod 4; api validates procedure inputs with zod 4 **as plain parse
  functions** (`.input((v) => Schema.parse(v))`) so nothing depends on
  @trpc/server's standard-schema support level; canonical validation runs
  inside itinerary-schema (zod 3) via `parseItinerary`.
- **Rationale**: reusing the already-instantiated peer keeps the lockfile
  edit to importer entries only (no new snapshot resolution). Function-form
  tRPC inputs are version-proof.
- **Alternatives considered**: llm on zod 3 — creates a NEW SDK peer
  instantiation `(zod@3.25.76)` requiring snapshot-level lockfile surgery;
  rejected as higher-risk than reusing the existing one.

## D4 — Dependency policy: workspace links + already-locked versions only, lockfile hand-maintained if installs stay denied

- **Decision**: manifest additions are limited to (a) `workspace:*` links
  (`api`→`domain`/`itinerary-schema`; `llm`→`supply-adapter` type-only) and
  (b) `zod@^4.4.3` (already in the lockfile). Attempt `pnpm install
  --lockfile-only` first; if the session denies pnpm (ENV-PNPM-DENY class),
  hand-edit the `importers:` section of `pnpm-lock.yaml` (workspace links are
  `version: link:../<pkg>`; zod pins the existing `4.4.3`). The image build's
  `pnpm install --frozen-lockfile` is the mechanical verifier — a wrong edit
  fails the build loudly.
- **Rationale**: the compose image is the verification target (INV-027) and
  its deps stage is frozen-lockfile; the loop runtime has a track record of
  denied installs (desk row ENV-PNPM-DENY). No new registry packages keeps
  the edit deterministic and reviewable.
- **Alternatives considered**: adding any new third-party package — rejected;
  nothing in the design needs one.

## D5 — Draft vocabulary lives in packages/llm and is NOT an itinerary type

- **Decision**: the planner draft is `{ title, days: [{ note?, items:
  [{ port, offerId } + kind-specific hints] }] }` — offer references +
  narrative only. No pricing fields, no provenance, no schema-version field.
  The assembler (`packages/domain/assemble.ts`) converts verified draft
  items into canonical `Item`s (stay/activity/transfer) using the trip
  request for kind-specific fields (occupancy, dates, from/to) and the
  re-verified offers for prices.
- **Rationale**: INV-001 — no itinerary-shaped type outside the schema
  package. A shape that cannot carry money or provenance is a proposal
  vocabulary, not a fork of the canonical model. The transfer offer's
  `mode` (`private | shared`) and the search criteria supply the itinerary
  item fields deterministically.
- **Alternatives considered**: draft = canonical `Itinerary` minus pricing —
  rejected: that IS a privately-extended itinerary type (INV-001 violation)
  and forces the model through strict fields it cannot know (ids, agencyId).

## D6 — Sandbox statefulness across requests: process-singleton container + re-search-before-quote

- **Decision**: two complementary moves. (1) `apps/web` memoizes the
  container at module scope (one container per server process) instead of
  building one per request — the sandbox engines' issued-quote memory then
  survives across the draft→quote→book HTTP sequence on the compose stack.
  (2) The quote service re-runs the relevant port searches (criteria derived
  from the persisted trip request) before quoting, re-registering offers
  idempotently, so a fresh process can still quote a previously-drafted
  itinerary.
- **Rationale**: the sandbox engine is documented as stateful-per-instance
  by design ("production booking topology is seed-0005 scope"). A
  per-request container makes every quote fail with `unknown_offer` on the
  live stack. The singleton is compatible with INV-028 because it is a
  *cache-free* composition root (ports, rates, db handle — no request state);
  real aggregator adapters are stateless over HTTP, and supplier-side quote
  state (the `book(quoteId)` handshake) lives with the supplier, exactly as
  it will in production. Re-search-before-quote additionally removes the
  single-process assumption from the *offer* half of the lifecycle.
- **Alternatives considered**: persisting sandbox engine state in Postgres —
  rejected: builds production infrastructure for a test double and smuggles
  live-price data toward the DB (INV-026 smell).

## D7 — Tool definitions: betaZodTool factories in packages/llm, executors injected, type-only port imports

- **Decision**: each file in `packages/llm/src/tools/` exports (a) the zod
  input schema mirroring the port's search criteria, and (b) a factory that
  binds an injected async executor (`(criteria) => offers`) into a
  `betaZodTool`. `packages/api`'s planner service supplies the executors by
  closing over the container's ports and serializes offers into compact tool
  results (offerId, title, net amount + currency, kind-specific hints).
  `packages/llm` imports the port criteria/offer types with `import type`
  only.
- **Rationale**: INV-013 [M] fixes the location and shape ("defined in code
  in `packages/llm/src/tools/` as typed definitions (zod input schemas via
  the SDK's `betaZodTool`, one file per tool), wrapping the supply ports").
  Injection keeps runtime coupling out of `packages/llm` (its runtime deps
  stay SDK + zod), honors the DI rule (handlers/adapters never construct
  adapters), and keeps supplier-agnostic port shapes as the only vocabulary
  that crosses the boundary (INV-005). The architecture-table tension is
  recorded in plan Complexity Tracking.
- **Alternatives considered**: (a) llm constructs sandbox adapters directly —
  violates the composition-root rule and couples llm to adapter lifecycles;
  (b) redeclaring criteria shapes in llm — near-duplicate types, drift risk,
  review-blocking under Pre-Write discipline.
- **Naming note**: the four lookup tools keep their INV-013 names verbatim
  (`search_hotel_rates`, `search_activities`, `quote_transfer`,
  `quote_car_rental`). The transfer/car tools return *priced offers* (the
  supplier's quotable price for the leg), which is what "quote" means in the
  planner's vocabulary; firm holds are only created later by the booking
  flow's port `quote()` calls.

## D8 — Exchange rates: fixed deterministic table injected via the container

- **Decision**: `Container` gains `rates: ReadonlyArray<ExchangeRate>` where
  `ExchangeRate = { from, to, numerator, denominator }` (integer rate as a
  ratio, e.g. EUR→USD = 108/100). `buildContainer` wires `STATIC_RATES`
  (EUR↔USD at P0 — the sandbox's two currencies). Conversion math is a pure
  domain function `convertMoney(money, rate)` (round-half-up on the scaled
  value); every conversion is recorded on the quote row / booking component
  (supplier currency, supplier amount, numerator, denominator) and logged
  through the shared logger.
- **Rationale**: INV-009 (explicit, logged conversions), INV-019 (zero
  external services — deterministic), FR-008 transparency (reproducible from
  stored rate). Injecting via the container keeps the seam where a live
  rate adapter lands later without touching domain math.
- **Alternatives considered**: float rates — never (INV-009); a RatesPort —
  premature (extraction threshold not met: one consumer, no second impl).

## D9 — Money math extensions in packages/domain

- **Decision**:
  - `splitByWeightsMinorUnits(total, weights[])` — largest-remainder
    weighted split; conservation invariant (sum === total) property-tested.
    Generalizes the existing `splitEvenMinorUnits` concept (which stays).
  - `applyMarkupBps(net, bps)` — sell = net + round-half-up(net×bps/10000);
    markup = sell − net by construction; bps validated integer ≥ 0.
  - `convertMoney(money, rate)` — round-half-up((amount×num)/den), returns
    money in `rate.to`; throws typed `MoneyError` on currency mismatch.
  - `allocateBudget(request)` (budget.ts) — trip-type band profiles
    (default: flightsTransport 40, accommodation 35, activities 12,
    localTransport 7, buffer 6 — midpoints of the PRD bands) fed through
    `splitByWeightsMinorUnits`; flightsTransport marked reserve.
  - `rebalanceAllocations(allocations, spent, deficitCategory, deficit)` —
    moves exact integer headroom from donors in FIXED priority order (buffer →
    localTransport → activities → accommodation; deterministic and auditable —
    simpler than proportional draws, which buy nothing at P0), never from
    flightsTransport, never below a donor's consumed amount, never changing
    the total; returns the move list for visibility (FR-005, US4).
- **Rationale**: INV-010/015 (pure domain money math), quality bar
  Money-Safe (exhaustive branch coverage on money functions).
- **Alternatives considered**: doing weighted split as repeated even splits —
  loses exactness; float percentages — forbidden.

## D10 — L3 strategy: smoke walks the happy path live; env-gated vitest L3 covers failure branches

- **Decision**: two L3 layers, both against real app + real Postgres:
  1. `tests/integration/smoke.mjs` (sealed oracle command) gains the live
     walk: agent bootstrap (sign-up → organization → session) → draft →
     quote → book over real HTTP, with `harness.mjs` exact-delta assertions
     (itinerary +1 & pmf_event +1 on draft; booking_quote +N on quote;
     booking +1, booking_component +N, markup_ledger +N, pmf_event +N on
     book) plus the double-book negative (re-book same quotes → typed
     failure, zero delta). WATCHED_TABLES extended with the five new tables.
  2. `packages/api/src/__tests__/l3-booking.test.ts` — vitest, skipped
     unless `DATABASE_URL` is set; tRPC caller + drizzle against the compose
     Postgres with controllable engine clocks and scripted FakeLLM: expired
     quote (clock advance) → typed failure + conservation; partial failure
     (SANDBOX_FAIL_BOOK_OFFER_ID in the cart via scripted draft) → siblings
     confirm, failure writes zero rows; all-fail → zero delta; hallucinated
     offer dropped at verification. Run in-cycle via the built image on the
     compose network (`docker run --network <stack> -e DATABASE_URL=…`),
     which sidesteps host install denials.
- **Rationale**: smoke must stay dependency-free and inside its 60 s budget
  (clock control is impossible over live HTTP; hold windows are 10–30 min),
  while Constitution VI demands failure-branch conservation be exercised
  against a real DB — the env-gated suite does that deterministically.
  Matches the architecture's stated L3 shape ("tRPC caller + Postgres").
- **Alternatives considered**: putting everything in smoke.mjs — cannot
  reach expiry/partial-failure deterministically over HTTP; putting
  everything in vitest — leaves the sealed oracle blind to this feature's
  live behavior.

## D11 — Serverless-correct booking: book-time hold re-establishment with exact-price reconciliation (INV-028 rework, PR #13 review)

- **Decision**: `bookItinerary` must not rely on the supplier still holding
  this process's quote state. When `port.book(supplierQuoteId)` fails with
  `unknown_quote` while OUR persisted `booking_quote` row is alive
  (unconsumed, unexpired), the service re-establishes the supplier hold on
  the book invocation: re-register supply state (the idempotent D6 sweep,
  lazily once per request), `port.quote(offerId)` for a fresh supplier
  quote, and book it ONLY if the re-quoted net price, currency, and
  merchant-of-record equal the persisted hold exactly. A price mismatch
  fails the component `quote_expired` (the firm price is gone — the caller
  re-quotes; INV-006), with both prices logged. The consumed row records the
  supplier quote actually booked (`supplier_quote_id` updated on consume).
  Consumption itself is atomic: `SET consumed_at = now() WHERE id = ? AND
  consumed_at IS NULL` with the component/ledger/PMF rows written only when
  that UPDATE affected a row, backstopped by a UNIQUE constraint on
  `booking_component.quote_row_id` (FR-009 at-most-once, INV-011).
- **Rationale**: on Vercel (INV-028) quote and book are separate
  invocations; the sandbox supplier's memory is per-process, so the original
  handshake returned `unknown_quote` for every component — every booking
  failed on the production topology while the single-process compose stack
  stayed green (the PR #13 review's CRITICAL finding). Re-establishment at
  book time keeps the server-persisted row as the single source of truth
  for price and expiry, works identically for real aggregator adapters
  (whose holds survive at the supplier, so the path simply never fires),
  and preserves D6's rejection of persisting supplier state in Postgres.
- **Alternatives considered**: sandbox engine rehydrating its quotes from
  persisted `booking_quote` rows — rejected: couples the supply adapter to
  `packages/db` (INV-017 layer violation), builds production plumbing for a
  test double, and models the SUPPLIER's memory inside our system of record
  (INV-005/026 smell) — the same grounds D6 already rejected it on. Known
  boundary (RESOLVED by D12 / seed-0005d): as first landed, a lost-race
  book request re-established and BOOKED at the supplier before losing the
  consume — an unrecorded external booking. Reserve-then-book (D12) decides
  the race in the database before any supplier call, so a loser never
  reaches the supplier at all.

## D12 — Conservation under concurrency: reserve-then-book, release-on-failure, cancel compensation (seed-0005d, PR #13 final tribunal)

- **Decision**: `bookItinerary` claims holds BEFORE booking at the supplier
  (reserve-then-book). One short claim transaction takes a locking read of
  the candidate `booking_quote` rows in id order and atomically flips
  `consumed_at` on every row still NULL; only claim winners proceed to
  `port.book` (with the D11 re-establishment when needed). A supplier book
  failure RELEASES the claim (`consumed_at` back to NULL), returning the
  hold to bookable with zero net state. The recording transaction then
  writes booking/component/ledger/PMF rows for booked components only —
  and if IT fails, every supplier booking just made is compensated with
  `port.cancel` and the claims are released before the fault is surfaced.
  No supplier booking survives unrecorded (FR-009/FR-011/INV-011).
- **Rationale**: booking before consuming let two concurrent fresh-process
  invocations of the same hold BOTH book at the supplier — each re-
  establishes a DISTINCT fresh supplier quote, so quoteId idempotency
  cannot dedupe them — and the consume race then left the loser's supplier
  booking recorded nowhere (the PR #13 final-tribunal blocking finding).
  Deciding the race in the database FIRST means a loser never reaches the
  supplier; the id-ordered locking read keeps concurrent claimants
  deadlock-free and one-winner-takes-all for identical carts.
- **Alternatives considered**: keep book-first and cancel the losers'
  supplier bookings after the consume race — rejected as the primary
  design: it knowingly performs an external booking that is cancellable in
  the common race (wasted supplier round-trips; refund semantics at real
  aggregators) and leaves a booked-but-unrecorded window on EVERY book.
  Cancel compensation is retained for the narrower recording-failure
  branch, where the supplier booking has already happened. Remaining crash
  windows (accepted, logged): a process death between claim and book
  strands a CLAIMED hold — money conserved, nothing external, the item
  stays re-quotable (the `already_booked` guard keys on components, not
  consumed quotes); a death between supplier book and the recording commit
  can still strand a supplier booking with no surviving process to
  compensate — closing that needs a persisted intent journal +
  reconciliation sweep, deferred to the first real aggregator adapter,
  which brings the supplier-side listing API to reconcile against.
