# Data Model: Workspace AI Itinerary Planner UI

**Feature**: specs/008-planner-workspace-ui | **Date**: 2026-07-09

This feature persists nothing and defines no new server-side entities. Every shape
below is either (a) an existing contract consumed verbatim, or (b) a client-side
view-model projection that lives only in component state. The canonical itinerary
schema is **not** modified, forked, or extended (Constitution IV).

## Consumed contracts (existing, unchanged)

### Trip request — input of `workspace.itinerary.draft`

Owned by spec 005 (`tripRequestSchema`, `packages/api/src/services/planner.ts`).
Consumed as-is:

| Field | Type | Constraint (server-enforced) |
|-------|------|------------------------------|
| destination | string | min length 1 |
| checkIn / checkOut | string | `YYYY-MM-DD`; `checkOut > checkIn` (refinement) |
| party.adults | int | ≥ 1 |
| party.children | int | ≥ 0 (default 0) |
| tripStyle | `"balanced" \| "budget" \| "premium"` | optional |
| budget.mode | `"hardCap" \| "target"` | required |
| budget.amountMinor | int | positive |
| budget.currency | string | 3 letters, uppercased |
| flightsReserveMinor | int | optional, ≥ 0 — **not collected by this UI** (assumption: allocator default applies at P0) |

### Draft outcome — output of `workspace.itinerary.draft`

Owned by spec 005 (`DraftOutcome`, un-exported; consumed via router inference — research D5):

- `{ status: "drafted", itinerary: Itinerary, fit: { categories: CategoryFit[], rebalances: RebalanceMove[] } }`
- `{ status: "infeasible", reason: "budget_below_reserve" | "no_days" }`
- `{ status: "planner_failed", reason: "malformed_output" | "no_proposals" }`

Where `Itinerary` is the canonical schema (spec 002): `title`, `currency`,
`days[] { dayNumber, date?, subtotal?, items[] }`, items are the
`stay | activity | transfer` union with optional `pricing { netRate, sellPrice }`
(Money = integer `amountMinor` + `currency`), and `pricing` block
(`budgetMode`, `total`, `categories[] { category, allocated, spent? }`).
`CategoryFit` = `{ category, allocatedMinor, spentMinor, state: "fits" | "underFilled" | "overTarget" }`.

## Client-side view models (new, component-state only)

### PlannerFormValues

What the controlled form holds — raw input strings; parsing happens exactly once
in the mapping helper (single parse point, unit-testable):

| Field | Type | UI validation (pre-submit; server remains authoritative) |
|-------|------|----------------------------------------------------------|
| destination | string | non-empty after trim |
| checkIn / checkOut | string (date input) | both set; checkOut after checkIn |
| adults | string (number input) | parses to integer ≥ 1 |
| children | string (number input) | empty ⇒ 0; parses to integer ≥ 0 |
| tripStyle | "" \| balanced \| budget \| premium | "" ⇒ omitted from the request |
| budgetMajor | string (number input) | parses to a finite value > 0 |
| budgetMode | hardCap \| target | one of |
| currency | string | 3-letter code (uppercased); default "EUR" |

Mapping `PlannerFormValues → trip request` is a pure function
(`apps/web/lib/planner-form.ts`): trims strings, uppercases currency, converts
`budgetMajor` to integer `amountMinor` using the currency's fraction digits
(research D7), omits empty optionals. Returns either the request object or a
human-readable validation message (never throws).

### PlannerViewState

Single discriminated union driving the render:

- `{ phase: "idle" }`
- `{ phase: "drafting" }` — submit disabled (FR-003)
- `{ phase: "drafted", outcome: DraftedOutcome }` — itinerary + fit rendered (FR-004/005)
- `{ phase: "failed", message: string }` — human-readable only (FR-006/007); form values retained

### Failure → message mapping (FR-006/007, research D6)

| Source | Case | Message intent |
|--------|------|----------------|
| outcome | infeasible / budget_below_reserve | budget below the flights reserve — raise budget or lower reserve/dates |
| outcome | infeasible / no_days | date range yields no plannable days |
| outcome | planner_failed / malformed_output | planner could not produce a usable plan — try again |
| outcome | planner_failed / no_proposals | no bookable options fit — adjust budget/dates |
| thrown | TRPCClientError UNAUTHORIZED | session expired — sign in again |
| thrown | TRPCClientError FORBIDDEN | agency membership required |
| thrown | TRPCClientError BAD_REQUEST | check the form values |
| thrown | anything else / network | could not reach the server — try again |

## State transitions

```
idle → drafting → drafted        (successful draft; stays until next submit)
            ↘   → failed → (edit) → drafting   (form values survive failure)
```

No client-side cache, storage, or cross-request state (INV-028-consistent).
