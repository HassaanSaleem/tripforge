# Contracts: Planner + Quote-Then-Book (005)

The single API surface is the tRPC router (INV-018). All procedures below are
`agentProcedure`-gated (INV-023) and tenant-scoped by the session's
`agencyId` (INV-004). Inputs are validated with zod parse functions at the
boundary; business failures are **values** (typed, discriminated outcomes),
thrown TRPCErrors are reserved for auth/validation/infra.

## 1. `workspace.itinerary.draft` (mutation)

Input:

```
{
  destination: string (min 1)
  checkIn: ISO date, checkOut: ISO date (checkOut > checkIn)
  party: { adults: int ≥ 1, children: int ≥ 0 }
  tripStyle?: "balanced" | "budget" | "premium"      // band profile selector
  budget: { mode: "hardCap" | "target", amountMinor: int > 0, currency: ISO-4217 }
  flightsReserveMinor?: int ≥ 0                      // manual estimate override
}
```

Output (success):

```
{
  status: "drafted"
  itinerary: Itinerary            // canonical 0.1.0, parseItinerary-validated
  fit: {
    categories: Array<{ category, allocatedMinor, spentMinor,
                        state: "fits" | "underFilled" | "overTarget" }>
    rebalances: Array<{ from, to, amountMinor }>
  }
}
```

Output (typed failures — no persistence, zero state delta):

```
{ status: "infeasible", reason: "budget_below_reserve" | "no_days" }
{ status: "planner_failed", reason: "malformed_output" | "no_proposals" }
```

Semantics: allocate (pure) → planner via `LLMPort.draftItinerary` (bounded)
→ re-verify proposals against ports (drop unknown offers) → assemble to fit
(pure; rebalance buffer-first, never the flights reserve; hard cap never
exceeded) → `parseItinerary` → persist itinerary row + `trip_created` PMF
event in one transaction.

## 2. `workspace.itinerary.get` (query)

Input: `{ itineraryId: uuid }` → Output: `{ itinerary, tripRequest,
quotes: booking_quote summaries (active + consumed), bookings: summaries }`.
FORBIDDEN/NOT_FOUND collapse to NOT_FOUND for cross-tenant probes.

## 3. `workspace.booking.quote` (mutation)

Input: `{ itineraryId: uuid, markupBps?: int ≥ 0 (default 1500) }`

Output:

```
{
  status: "quoted"
  items: Array<
    | { itemId, outcome: "held", quote: {
          quoteRowId, netMinor, netCurrency,
          rate?: { numerator, denominator },
          sellMinor, currency, markupBps,
          merchantOfRecord, expiresAt } }
    | { itemId, outcome: "failed", reason: "unknown_offer" | "no_rate" | "already_booked" }
  >
}
```

Semantics: load itinerary (tenant-scoped) → re-register supply state
(re-run searches derived from `trip_request`) → per bookable item:
`port.quote(offerId)` → convert (explicit rate, recorded) → markup (pure
domain) → persist `booking_quote` row. Per-item failures never abort
siblings. Expired earlier rows are ignored (re-quote replaces them).

## 4. `workspace.booking.book` (mutation)

Input: `{ itineraryId: uuid, quoteRowIds: uuid[] (min 1) }` — duplicate ids
are deduplicated (first-occurrence order): one hold, one outcome, one set of
rows, no matter how many times its id appears (FR-009).

Output:

```
{
  status: "confirmed" | "partially_confirmed" | "failed"
  bookingId?: uuid                 // absent when status = "failed" (nothing written)
  components: Array<
    | { quoteRowId, itemId, outcome: "confirmed", supplierBookingId,
        netMinor, netCurrency, sellMinor, currency, merchantOfRecord }
    | { quoteRowId, itemId, outcome: "failed",
        reason: "quote_expired" | "supplier_rejected" | "unknown_quote" | "already_consumed" }
  >
}
```

Semantics (reserve-then-book, research D12): validate rows (tenant,
itinerary match, unconsumed, `now < expires_at` server-side) → RESERVE: one
short transaction claims every still-unconsumed hold (locking read in id
order, then the atomic `consumed_at` flip) BEFORE any supplier call — the
losing side of a concurrent race never reaches the supplier and reports
`already_consumed` (FR-009) → `port.book(supplierQuoteId)` per CLAIMED
component (the port re-enforces expiry); a supplier failure RELEASES the
claim, returning the hold to bookable with zero net state → ONE recording
transaction writes booking + booking_component + markup_ledger +
`booking_confirmed` PMF event for the booked components (persisting any
re-established supplier quote id). If the recording transaction fails,
every supplier booking just made is compensated with `port.cancel` and the
claims are released — no supplier booking survives unrecorded (INV-011).
Failed components contribute zero rows; all-fail writes nothing (FR-011).
The markup ledger amount is pure domain math (`markupOf(sell, net)`,
INV-010); UNIQUE on `booking_component.quote_row_id` stays as the
write-time backstop.

Serverless hold re-establishment (INV-028, research D11): when the supplier
returns `unknown_quote` for a live persisted hold (quote and book ran in
different processes), the service re-registers supply state, takes a fresh
`port.quote(offerId)`, and books it only when the re-quoted net price,
currency, and merchant-of-record equal the persisted hold exactly; a
mismatch fails the component `quote_expired` (both prices logged) and the
caller re-quotes. The client-facing hold window is never extended: the
persisted `expires_at` continues to gate the book.

## 5. `LLMPort.draftItinerary` (packages/llm)

```
draftItinerary(req: {
  purpose: string                          // metering (INV-013)
  request: PlannerTripRequest              // destination/dates/party/style +
                                           //   per-category spendable budgets
  tools: PlannerToolDeps                   // injected executors (research D7)
}): Promise<
  | { status: "drafted"; draft: PlannerDraft; usage: LlmUsage }
  | { status: "failed"; reason: "malformed_output" | "no_proposals" }
>

PlannerToolDeps {
  searchHotelRates(c: HotelSearchCriteria):    Promise<HotelOffer[]>
  searchActivities(c: ActivitySearchCriteria): Promise<ActivityOffer[]>
  quoteTransfer(c: TransferSearchCriteria):    Promise<TransferOffer[]>
  quoteCarRental(c: CarRentalSearchCriteria):  Promise<CarRentalOffer[]>
}
```

- `AnthropicLLM`: `beta.messages.toolRunner` on `claude-haiku-4-5`,
  `max_iterations ≤ 6`, no `effort` param (unsupported on Haiku), the four
  lookup tools + `submit_itinerary_draft` (zod-validated structured output,
  research D2); every call metered (purpose, model, tokens).
- `FakeLLM`: deterministic — invokes the injected tools (hotel + activities
  + transfer for the trip), proposes cheapest-fit offers per day, returns a
  valid `PlannerDraft`; scriptable (`scriptedDrafts`) so tests can inject
  hallucinated offerIds / malformed output / fail-book offers.

## 6. Planner tool definitions (packages/llm/src/tools/, INV-013)

| Tool (file) | Input schema mirrors | Executor returns |
|---|---|---|
| `search_hotel_rates` (search-hotel-rates.ts) | `HotelSearchCriteria` | hotel offers (id, title, net amount+currency, features) |
| `search_activities` (search-activities.ts) | `ActivitySearchCriteria` | activity offers (+ durationMinutes) |
| `quote_transfer` (quote-transfer.ts) | `TransferSearchCriteria` | transfer offers (+ mode) |
| `quote_car_rental` (quote-car-rental.ts) | `CarRentalSearchCriteria` | car offers (+ vehicleClass) — price context only; produces NO itinerary item at v0 (D-006) |
| `submit_itinerary_draft` (submit-itinerary-draft.ts) | `PlannerDraft` zod schema | terminates the loop, captures the draft |

One file per tool; zod input schemas via `betaZodTool`; executors injected —
no ad-hoc tool JSON anywhere (INV-013).

## 7. RBAC contract (extends the pinned ladder)

Every procedure above: anonymous → UNAUTHORIZED; traveler (no agency) →
FORBIDDEN; agent of agency A touching agency B's itinerary/quotes →
NOT_FOUND (no existence oracle). Covered by caller tests alongside the
existing `rbac.test.ts` pattern.
