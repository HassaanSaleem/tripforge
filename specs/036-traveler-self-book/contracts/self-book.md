# Contract: `clientView.selfBook`

The one new procedure. A signed-in traveler self-books a shared itinerary.

## Procedure

- **Name**: `clientView.selfBook`
- **Kind**: `protectedProcedure` mutation (any authenticated user; anonymous →
  `UNAUTHORIZED`). A traveler never touches a workspace procedure (INV-024).
- **Input** (Zod `strictObject`):
  ```
  { token: string (uuid) }
  ```
  The token is the grant; the itinerary and owning agency are resolved
  server-side from the share link. The traveler supplies **no** markup, no
  itinerary id, no quote ids, no prices — all derived server-side (FR-004).

- **Output** (`SelfBookOutcome`, redacted — see data-model.md):
  ```
  { status: "not_found" }                                   // unknown/deleted token
  | { status: "nothing_to_book" }                           // no bookable un-booked items
  | { status: "confirmed" | "partially_confirmed" | "failed",
      legs: SelfBookLeg[],
      totalChargedMinor: number,
      currency: string }
  ```

## Behavior

1. Reject anonymous callers (`protectedProcedure`).
2. Resolve `token → { agencyId, itineraryId }`. Unknown/deleted → `not_found`
   (same neutral surface as `resolveShareLink`; no existence oracle).
3. Build `actor = { agencyId, userId: session.userId }` (owning agency, traveler
   as booking actor).
4. Derive `markupBps` = most-recent `booking_quote.markup_bps` for the itinerary,
   else `1500` (platform default).
5. `quoteItinerary(actor, { itineraryId, markupBps })` → collect `held` quote-row
   ids. If none → `nothing_to_book`.
6. `bookItinerary(actor, { itineraryId, quoteRowIds })`.
7. Project the `BookOutcome` into the redacted `SelfBookOutcome`, joining each
   component's `itemId` back to the document `title`/`kind`; map internal failure
   reasons to the client-safe enum.

## Guarantees

- **Money attribution** identical to the agent path: all rows carry the owning
  `agencyId`; `pmf_event.actor_user_id` = the traveler (FR-003, FR-014).
- **State conservation** (FR-006, INV-011): a failed leg is never charged and
  leaves no `booking_component`/`markup_ledger`/`pmf_event` row; a fully-failed
  self-book writes nothing; failed holds released.
- **At-most-once per item** across concurrent self-book/agent-book (FR-007).
- **Redaction** (FR-008): no confidential field crosses the boundary.
- **No schema change, no new revenue-share/client-ownership row** (FR-005).

## Errors

| Condition | Result |
|-----------|--------|
| Anonymous caller | `UNAUTHORIZED` (thrown) |
| Malformed input (non-uuid token) | `BAD_REQUEST` (Zod) |
| Unknown / deleted token or itinerary | `{ status: "not_found" }` (value, not error) |
| No bookable un-booked items | `{ status: "nothing_to_book" }` (value) |
| Some/all legs fail at supplier | `partially_confirmed` / `failed` with per-leg reasons (value; state conserved) |

## Non-goals for this contract

- No traveler-set markup, no per-leg selection (v0 books all bookable un-booked
  items). No hold-then-confirm-later two-phase UX. No cross-leg all-or-nothing
  atomicity (partial-failure semantics preserved, per constitution V).
