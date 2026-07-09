# Contracts: Workspace AI Itinerary Planner UI

**Feature**: specs/008-planner-workspace-ui | **Date**: 2026-07-09

Two contracts: the API contract this UI **consumes** (owned elsewhere, unchanged)
and the UI rendering contract this feature **exposes** (what tests may rely on).

## §1 Consumed API contract (unchanged — owned by spec 005)

- Procedure: `workspace.itinerary.draft` (tRPC mutation, agent-gated via
  `agentProcedure` — UNAUTHORIZED without a session, FORBIDDEN without an agency
  membership). Input/output per
  `specs/005-budget-quote-book/contracts/planner-and-booking.md` §1 and
  data-model.md here. **This feature makes zero changes to it.**
- Transport: the existing fetch-adapter mount `POST /api/trpc/*` (INV-018). The
  browser client (research D1/D3) is `createTRPCClient<AppRouter>` with one
  `httpBatchLink({ url: "/api/trpc" })`, no transformer, session via same-origin
  cookie.

## §2 UI rendering contract (new — what e2e/UAT may assert)

Page: `/workspace` (route group `(workspace)`, server component gate per spec 007).

### §2.1 Agent (verified membership)

- The trip form is present, with accessible labels: Destination, Check-in,
  Check-out, Adults, Children, Trip style, Budget, Budget mode, Currency, and a
  single submit button labeled **"Draft itinerary"**.
- While a draft is in flight the submit button is disabled and reads
  **"Drafting…"** (FR-003).
- On success the page renders, in a region with `data-testid="draft-result"`:
  - the itinerary **title** as a heading;
  - **each day**: heading `Day {dayNumber}` plus the ISO date when present; the
    day's items as a list — every item line shows its kind (`stay` / `activity` /
    `transfer`), its title, and its **sell price** formatted as
    `{amount} {CUR}` (exact server minor units formatted per research D7); a day
    with zero items shows **"No items planned."**; a per-day subtotal line when
    the document carries one;
  - a **budget summary** table (`data-testid="budget-fit"`): one row per category
    with allocated, planned (spent), and state (`fits` / `underFilled` /
    `overTarget`), plus the trip **total** and budget mode from the document's
    pricing block.
- On failure a message region (`role="alert"`) shows exactly one human-readable
  message per data-model.md's mapping table; the form keeps its values (FR-006).
- The existing greeting (user name · agency name · role) and sign-out button
  remain present (FR-010).

### §2.2 Anonymous / traveler

- Byte-for-byte the spec 007 membership prompt behavior: sign-in / sign-up links,
  **no trip form**, no `draft-result` region (FR-008). Unchanged by this feature.

### §2.3 Error-shape guarantee

- No raw JSON, stack trace, or `TRPCClientError` text is ever rendered; every
  user-visible failure string comes from the pure mapping helper
  (`apps/web/lib/planner-form.ts`), which is unit-tested case-by-case (SC-002).
