# Data Model: Consumer Chat-First AI Planner

## 1. NEW — `consumer_plan_request` (bolt-on operational table)

A durable, **agency-less** lead created when a signed-in traveler asks an agent to arrange
their self-planned trip. NOT the canonical itinerary (Constitution IV untouched). **NOT a
money path** — no net/markup/take-rate/revenue-share columns (mirrors `trip_handoff_request`,
spec 022).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk (defaultRandom) | |
| `traveler_user_id` | text NOT NULL | the requesting traveler (Better Auth `user.id`); the owner scope for "my requests" |
| `destination` | text NOT NULL | from the resolved `TripRequest` |
| `check_in` | text NOT NULL | ISO `YYYY-MM-DD` |
| `check_out` | text NOT NULL | ISO `YYYY-MM-DD` |
| `adults` | integer NOT NULL | party |
| `children` | integer NOT NULL | party (default 0) |
| `budget_amount_minor` | integer NOT NULL | the traveler's own budget (authoritative money context) |
| `budget_currency` | text NOT NULL | ISO-4217 |
| `budget_mode` | text NOT NULL | `hardCap` \| `target` |
| `variant` | text NOT NULL | chosen option `budgetSavvy` \| `balanced` \| `premium` |
| `option_title` | text NOT NULL | the chosen option's title (a display label, not a price) |
| `contact_name` | text NOT NULL | who the agent contacts |
| `contact_email` | text NULL | optional |
| `notes` | text NULL | optional |
| `status` | text NOT NULL | `new` (only value in v0; agent inbox/accept is deferred) |
| `created_at` | timestamp NOT NULL defaultNow | |

**Indexes**: `(traveler_user_id, created_at DESC)` — the traveler's own requests (and the
scope the future agent-network inbox, D-1, will re-key on `status`).

**Invariants**: no money column; created only via the traveler `protectedProcedure`; never
references or mutates `booking`/`markup_ledger`/`itinerary`.

## 2. REUSED — `TripRequest` (planner criteria, unchanged)

`packages/api/src/services/planner.ts` `tripRequestSchema`: `{ destination, checkIn, checkOut,
party{adults,children}, tripStyle?, budget{mode,amountMinor,currency}, flightsReserveMinor? }`.
Produced by the chat interpreter, consumed by the draft engine, and echoed into the
request-agent submission. No change.

## 3. REUSED — transient `DraftOption` → redacted for the traveler

`draftOptions` yields `DraftOption { variant, label, itinerary: Itinerary, fit }`. For the
consumer path each is projected to a traveler-safe shape and the raw `Itinerary` is **never
persisted**:

```
ConsumerDraftOption {
  variant: "budgetSavvy" | "balanced" | "premium"
  label: string                       // human label (e.g. "Balanced")
  title: string                       // itinerary title
  view: ClientItineraryView           // toClientItineraryView(...) — sell price only, no netRate/ids
  totalMinor: number | null           // client-safe trip total (from the redacted view)
  currency: string
  fit: { categories: { category, allocatedMinor, spentMinor, state }[] }  // single-figure per-category breakdown
}
```

`ClientItineraryView` is the existing redacted projection (client-view.ts). The ephemeral
`agencyId` stamped on the source `Itinerary` never crosses to the traveler (the projection
drops it) and is never written.

## 4. Reused negative-space (must NOT change)

- Canonical `@tripforge/itinerary-schema` — untouched (`SCHEMA_VERSION 0.1.0`).
- `booking` / `booking_component` / `markup_ledger` / `revenue_share_ledger` — untouched; no
  consumer-planner path writes them.
- `pmf_event` `trip_created` — NOT emitted (nothing is persisted as a trip). (A future
  consumer-lead PMF event, if desired, is a follow-up.)
