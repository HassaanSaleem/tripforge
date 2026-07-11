# Research: Booked-Price Fidelity on the Client View

**Feature**: specs/013-booked-price-fidelity | **Date**: 2026-07-11

No NEEDS CLARIFICATION markers remained in the spec; this document records the design
decisions and the alternatives they beat.

## D1 — Where the booked client price lives: read-time projection from booking records

- **Decision**: Traveler-facing reads project the booked sell from `booking_component`
  (`sell_minor`, recorded in the itinerary currency at quote time). The canonical document
  is never stamped.
- **Rationale**: The value already exists, per item, tenant- and itinerary-scoped, written
  atomically inside the booking recording transaction (spec 005). Projecting at read time is
  retroactive (old share links heal instantly), keeps the booking money path write-set
  untouched (no new conservation surface), and preserves spec 010 FR-011 (the view never
  modifies the stored document). Precedent: `revenue_share_ledger` is the source of truth
  for marketplace splits; booking records are the source of truth for realized sells.
- **Alternatives considered**:
  - *Book-time document stamping* — writes the sell into `item.pricing.sellPrice` during
    Phase 4 recording. Rejected: adds a canonical-document write inside the money path (new
    failure/compensation branch), races concurrent document edits and licensing copies,
    denormalizes a value the platform already persists, and does not heal documents booked
    before the fix. It would also make white-label copies inherit the SELLER's booked sells
    verbatim (a fresh trust question), whereas projection scopes prices to the viewing
    itinerary's own bookings by construction.
  - *Read-time re-quote* — spec 010 explicitly forbids ("does not re-quote live inventory");
    holds expire in minutes and a traveler view must be stable.

## D2 — Payload shape: no new fields; `booked` already carries the distinction

- **Decision**: `ClientViewItem` keeps exactly `{ …, booked, sellMinor }`. The
  confirmed-vs-estimate presentation (FR-004) derives from facts already in the payload:
  `booked && sellMinor !== null` → confirmed price; `!booked && sellMinor !== null` →
  estimate. The page derives "total includes estimates" the same way — boolean presentation
  logic, not money arithmetic (FR-008's prohibition is on money math).
- **Rationale**: The smallest truthful contract. A separate `priceConfirmed` flag would be
  derivable from `booked`, could drift from it, and widens the allowlisted surface for no
  information gain.
- **Alternatives considered**: `sellKind: "confirmed" | "estimate"` enum per item — richer,
  but redundant with `booked` while item-level exclusivity holds (one confirmed component
  per item, spec 005 FR-016).

## D3 — Currency-mismatch guard: construct Money from the component's recorded currency

- **Decision**: The service builds each booked price as `money(sellMinor, component.currency)`
  (the component's OWN recorded currency, not the document's), and the projection folds with
  domain `addMoney`. A hypothetical cross-currency corruption then throws `MoneyError`
  server-side — the spec's "fail loudly rather than render a wrong total" edge case — and
  surfaces as the generic server fault, never a silent wrong number.
- **Rationale**: Zero new validation code; the domain money guards are the existing loud
  failure mechanism (INV-009/010). Quote-time recording guarantees `component.currency ==
  document.currency` (spec 005 FR-007), so the guard is a tripwire, not a code path.
- **Alternatives considered**: explicit pre-check + typed refusal — more code for a
  can't-happen state, and a typed "unavailable" would HIDE a data-integrity bug that should
  page someone via the log scan instead.

## D4 — Total semantics: one mixed fold, absent when nothing is priced

- **Decision**: `totalSellMinor` = fold of (booked component sell | document sellPrice) per
  item, exactly the values shown per item; stays `null` when no item contributes a price.
- **Rationale**: FR-002; SC-001's zero-delta against the booking confirmation becomes
  structural (the total IS the sum of what is displayed). Existing "unpriced proposal states
  no total" behavior is untouched (US3).

## D5 — Sibling-spec amendment mechanics: annotate with provenance, never silently reword

- **Decision**: spec 010's Assumptions bullet ("Prices shown are the itinerary's stored sell
  prices…") and FR-008 gain explicit "Amended by spec 013 (2026-07-11)" notes stating the
  booked-case projection; spec 005's Assumptions gains a note that the draft-time
  `netRate == sellPrice` placeholder is draft-only semantics and the realized sell is
  projected at read time from booking records. Original text stays readable as history.
- **Rationale**: DIRECTIVE item 3 (spec amendments through the speckit flow, operator review
  at the PR gate) + spec-gap-0001 precedent (annotate resolved decisions with provenance).

## D6 — Landing the reseller scenario on this branch

- **Decision**: `git checkout d0a9fdc -- scenarios/incubating/reseller-books-copy-live/`
  (the iter-3 ideate auto-commit that authored it — it is not on main yet), then promote the
  price-fidelity observation to a hard assertion
  (`check(viewBookedSum === ledgerSellSum)`).
- **Rationale**: Ticket acceptance criterion 6 requires the promotion; the scenario file must
  exist on the PR branch to be promoted. Landing ideate-authored files via a ticketed PR is
  established practice (seed-0007, seed-0010). Only the scenario directory is taken — the
  iteration report in the same commit stays on the iteration branch (loop state is not
  feature-PR material).

## D7 — Estimated/confirmed presentation copy

- **Decision**: Within the existing `.tf-*` premium kit: booked priced items keep the
  `Booked` badge (spec 010 FR-009 — unchanged) and their price is the confirmed price;
  un-booked priced items get a small `estimate` marker beside the price; the total line
  reads "Trip total" when every shown price is booked and gains an "includes estimates"
  qualifier when any estimate contributes. Exact copy is presentation-level (spec assumption)
  and pinned by e2e assertions on the marker text.
- **Rationale**: FR-004 with minimal copy surface; existing e2e/scenario checks that assert
  the `Booked` badge and white-label negatives keep passing (nothing removed or renamed).
