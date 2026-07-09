# Data Model: Budget Allocator + Quote-Then-Book Flow (005)

Phase 1 output. Money columns are integer minor units + explicit currency
(INV-009). Every table carries the owning `agency_id` referencing
`organization.id` and every query path filters through
`tenantScope`/`scopedWhere` (INV-004). Timestamps default to now.

## New tables (packages/db/src/schema.ts — landed by `db:push`)

### `itinerary`

The persisted canonical itinerary plus the trip-request context needed to
re-derive supply searches (research D6). The canonical document is stored
whole — the DB never forks its shape (INV-001).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | equals `document.id` |
| `agency_id` | text NOT NULL → organization.id (cascade) | tenant key (INV-004); equals `document.agencyId` |
| `title` | text NOT NULL | denormalized for listings |
| `currency` | text NOT NULL | ISO-4217; equals `document.currency` |
| `document` | jsonb NOT NULL | the canonical Itinerary (validated by `parseItinerary` before write and after read) |
| `trip_request` | jsonb NOT NULL | the draft request (destination, dates, party, style, budget) — supply-search re-derivation context, NOT part of the canonical schema |
| `created_at` / `updated_at` | timestamp NOT NULL default now | |

### `booking_quote`

A server-held firm price for one itinerary item (FR-009). Dead at
`expires_at` (never served past it — INV-006/026 carve-out); consumed by at
most one booking.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | |
| `agency_id` | text NOT NULL → organization.id | tenant key |
| `itinerary_id` | uuid NOT NULL → itinerary.id (cascade) | |
| `item_id` | text NOT NULL | canonical item id inside the document |
| `port` | text NOT NULL | `hotel \| activity \| transfer` (mirrors supplyRef.port) |
| `offer_id` | text NOT NULL | supplier-agnostic offer reference |
| `supplier_quote_id` | text NOT NULL | the port quote consumed at book time; updated on consume when the hold was re-established at book time (research D11, INV-028) |
| `net_minor` | bigint NOT NULL | supplier net, in `net_currency` |
| `net_currency` | text NOT NULL | supplier currency |
| `rate_numerator` / `rate_denominator` | bigint NULL | conversion rate applied (NULL when same-currency) — FR-008 transparency |
| `converted_net_minor` | bigint NOT NULL | net in itinerary currency |
| `markup_bps` | bigint NOT NULL | basis points applied |
| `sell_minor` | bigint NOT NULL | sell price in itinerary currency; `sell − converted_net = markup` exactly |
| `currency` | text NOT NULL | itinerary currency |
| `merchant_of_record` | text NOT NULL | `platform \| agency \| supplier` |
| `expires_at` | timestamp NOT NULL | hold expiry (exclusive boundary) |
| `consumed_at` | timestamp NULL | set when a booking confirms against it — flipped ATOMICALLY (`WHERE consumed_at IS NULL`); rows in other tables are written only when the flip won, so a hold is consumed by at most one booking under any interleaving (FR-009) |
| `created_at` | timestamp NOT NULL default now | |

Index: `(agency_id, itinerary_id)`.

### `booking`

One booking attempt that confirmed at least one component. A booking where
every component fails writes **nothing** (FR-011 conservation).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | |
| `agency_id` | text NOT NULL → organization.id | |
| `itinerary_id` | uuid NOT NULL → itinerary.id | |
| `status` | text NOT NULL | `confirmed` (all components) \| `partially_confirmed` |
| `created_at` | timestamp NOT NULL default now | |

### `booking_component`

The reservation row per confirmed component (FR-010).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | |
| `booking_id` | uuid NOT NULL → booking.id (cascade) | |
| `agency_id` | text NOT NULL → organization.id | |
| `itinerary_id` | uuid NOT NULL → itinerary.id | |
| `item_id` | text NOT NULL | |
| `port` | text NOT NULL | |
| `offer_id` | text NOT NULL | |
| `quote_row_id` | uuid NOT NULL UNIQUE → booking_quote.id | the consumed hold; UNIQUE backstops FR-009 at-most-once consumption (migration note: constraint added 2026-07-08 by the PR #13 review rework, applied by the compose migrate stage's `drizzle-kit push` — this repo's schema-migration mechanism) |
| `supplier_booking_id` | text NOT NULL | from the port's confirmed outcome |
| `net_minor` / `net_currency` | bigint / text NOT NULL | supplier net as quoted |
| `rate_numerator` / `rate_denominator` | bigint NULL | conversion recorded with the booking (FR-008) |
| `sell_minor` / `currency` | bigint / text NOT NULL | itinerary currency |
| `merchant_of_record` | text NOT NULL | |
| `created_at` | timestamp NOT NULL default now | |

Unique index: `(itinerary_id, item_id)` — item-level exclusivity backstop
(FR-016, amended 2026-07-09 spec-gap-0002): at most one booking component may
ever be recorded per itinerary item, even if a future caller bypasses the
claim-time guard (migration note: applied by the compose migrate stage's
`drizzle-kit push`, this repo's schema-migration mechanism).

### `markup_ledger`

The agency margin record (FR-010; the row later revenue-share/take-rate
features build on). One row per confirmed component, same transaction.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | |
| `agency_id` | text NOT NULL → organization.id | |
| `booking_component_id` | uuid NOT NULL → booking_component.id (cascade) | |
| `net_minor` | bigint NOT NULL | converted net (itinerary currency) |
| `sell_minor` | bigint NOT NULL | |
| `markup_minor` | bigint NOT NULL | `= sell_minor − net_minor` exactly (SC-005) |
| `currency` | text NOT NULL | |
| `created_at` | timestamp NOT NULL default now | |

## State transitions

```
draft:   (nothing) ──draft ok──▶ itinerary row + pmf trip_created   [one tx]
                └─planner/verify/fit failure──▶ zero rows

quote:   itinerary ──per item──▶ booking_quote rows (active until expires_at)
                └─per-item failure (unknown offer / no rate)──▶ typed outcome, no row for that item

book:    active quote rows ──port.book per component──▶ one tx:
           atomic consume (consumed_at flip if still NULL) per component,
           then booking + booking_component + markup_ledger + pmf
           booking_confirmed for the components whose consume WON
                └─supplier lost the hold (unknown_quote, row alive)──▶
                   re-establish: re-register supply, port.quote(offer_id),
                   book ONLY on exact net price/currency/MoR match (D11);
                   mismatch──▶ quote_expired outcome, zero rows
                └─item already booked: consumed sibling hold or existing
                   booking_component for the item (FR-016, spec-gap-0002)──▶
                   item_already_booked outcome, zero rows
                └─component failure (expired / rejected / unknown / consumed
                   / lost the consume race)──▶ typed outcome, zero rows
                └─ALL components fail──▶ zero rows anywhere
```

## Domain value shapes (packages/domain — not persisted)

- `ExchangeRate { from, to, numerator, denominator }` — integer ratio.
- `BudgetBandProfile` — per trip type, five integer weights (normalized by
  the split; default 40/35/12/7/6).
- `AllocationResult` — `BudgetAllocation[]` (canonical schema type) +
  re-balance move list `{ from, to, amountMinor }[]` + fit flags per category
  (`fits | underFilled | overTarget` — the last only under target mode, where
  the overshoot is shown honestly).

## Planner draft vocabulary (packages/llm — not persisted, not canonical)

```
PlannerDraft {
  title: string
  days: Array<{
    items: Array<
      | { port: "hotel";    offerId: string }
      | { port: "activity"; offerId: string; startsAt?: string }
      | { port: "transfer"; offerId: string }
    >
  }>
}
```

(No narrative field: canonical schema v0 has nowhere to persist per-day prose,
so the vocabulary carries none — dead surface is not carried speculatively.)

Offer references + hints only — no money, no provenance, no version field
(research D5). Validated by zod at the submit-tool boundary (research D2).
The assembler joins these against re-verified offers and the trip request to
produce canonical `Item`s; unknown offerIds are dropped (FR-003, SC-002).

## Existing entities consumed (unchanged)

- `Itinerary` / `PricingBlock` / `BudgetAllocation` / `Item` — canonical
  schema 0.1.0 (FR-015).
- `pmf_event` + `recordPmfEvent` — `trip_created` (source `self_built`) and
  `booking_confirmed` (sell amount, itinerary currency) written with the
  caller's transaction executor (INV-021).
- Supply port family + sandbox adapters + `SANDBOX_FAIL_BOOK_OFFER_ID`.
