# Contracts: Booking Flow UI — Quote → Review → Book

**Feature**: specs/009-booking-flow-ui | **Date**: 2026-07-09

Two contracts: the API contract this UI **consumes** (owned by spec 005, unchanged)
and the UI rendering contract this feature **exposes** (what e2e/UAT may rely on).

## §1 Consumed API contract (unchanged — owned by spec 005)

- Procedures: `workspace.booking.quote` and `workspace.booking.book` (tRPC
  mutations, agent-gated via `agentProcedure` — UNAUTHORIZED without a session,
  FORBIDDEN without an agency membership, NOT_FOUND for an itinerary outside the
  caller's tenant). Input/output per
  `specs/005-budget-quote-book/contracts/planner-and-booking.md` §3–4 and
  [data-model.md](../data-model.md). **This feature makes zero changes to them.**
- Transport: the existing browser tRPC client over the `/api/trpc` mount
  (INV-018) — same client module the planner uses, extended with inferred
  quote/book types only.

## §2 UI rendering contract (new — what e2e/UAT may assert)

Page: `/workspace`, inside the planner's rendered draft (spec 008 contract §2.1
stays fully intact — nothing there changes).

### §2.1 Booking controls (verified agent, draft rendered)

- Below the rendered draft, a booking region is present containing: a numeric
  input labeled **"Markup %"** pre-filled with `15`, and a button named
  **"Quote live prices"**.
- While a quote is in flight the button is disabled and reads **"Quoting…"**.
- On quote success a region `data-testid="quote-review"` renders one row per
  quoted item:
  - held rows show: the item's title and kind (joined from the draft), the **net
    rate** and the **sell price** formatted `{amount} {CUR}` (exact server minor
    units via the shared formatter), the applied markup (`{n}%` from the server's
    `markupBps`), **"Held until {time}"**, and a selection checkbox (checked by
    default);
  - failed rows show the item's title and one human-readable reason per
    data-model.md's quote-failure table, and are not selectable.
- A button named **"Book selected items"** is present; it is disabled while zero
  rows are selected or a request is in flight, and reads **"Booking…"** while the
  book call runs.
- If every quoted item failed, the review region explains that no items could be
  held and no book button is enabled.

### §2.2 Confirmation (book response rendered)

- On book response a region `data-testid="booking-confirmation"` renders:
  - the status label per data-model.md (**"Booking confirmed"** / **"Booking
    partially confirmed"** / **"Booking failed — nothing was booked"**);
  - the booking reference when the platform returned one;
  - one line per component: confirmed components show the item title, supplier
    booking reference, and sell price `{amount} {CUR}`; failed components show
    the item title and one human-readable reason per data-model.md's
    book-failure table.
- The confirmation stays on screen (INV-016); the quote controls remain usable —
  re-quoting replaces the confirmation with a fresh review, in which items the
  platform reports as `already_booked` render that reason and are not
  selectable.

### §2.3 Failure display (transport)

- Transport/authorization failures during quote or book render exactly one
  human-readable message in a `role="alert"` region, per data-model.md's
  transport table. No raw error objects, payloads, or stack traces are ever
  rendered. The drafted itinerary stays on screen.

### §2.4 Anonymous / traveler (guardrail)

- Byte-for-byte the spec 007/008 membership-prompt behavior: no markup input, no
  quote or book button, no booking region anywhere on the page (FR-009). Server
  authorization is unchanged (INV-023).

### §2.5 Money display invariant (SC-003)

- Every money value in §2.1/§2.2 is the platform-returned integer minor-unit
  value formatted for display. The page computes no sums, totals, markups, or
  conversions; the only client-side numeric conversion is markup percent →
  integer basis points on the quote input (research D5).

## §3 Pure view-logic contract (what L1 unit tests pin)

- `toMarkupBps` — bounds, defaults, integer-bps representability, error strings.
- `quoteFailureMessage` / `bookFailureMessage` / `bookStatusLabel` — exhaustive
  over their unions; exact strings per data-model.md (a new server reason fails
  compilation).
- `transportErrorMessage` (shared `transport-error.ts`) — per-code wording with
  booking overrides; `draftErrorMessage`'s existing strings unchanged.
- `formatMarkupBps` — 1500 → "15%"; `formatHoldExpiry` — "Held until " prefix +
  non-empty local time.
- `itemMetaIndex` — id → {title, kind} join with raw-id fallback.
