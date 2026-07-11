# UI Contract: Workspace Itinerary List (spec 012)

The feature exposes no new server interface. This contract fixes (a) which
existing procedures the panel may call and how, and (b) the user-observable
panel behavior the e2e suite asserts.

## §1 Procedure usage (existing, unchanged)

| Procedure | Call site | When | Notes |
|-----------|-----------|------|-------|
| `workspace.itinerary.list` (query) | `itinerary-list.tsx` | Panel mount + every `refreshToken` bump | Output rendered verbatim, order preserved (server is newest-first) |
| `workspace.itinerary.get` (query) | `itinerary-list.tsx` | Agent opens a row | `NOT_FOUND` and transport failures → typed message in-panel |
| `workspace.booking.quote/book` (mutations) | reused `BookingFlow` | Inside the opened view | UNCHANGED component; no new call patterns |
| `workspace.itinerary.share` (mutation) | reused `ShareControl` | Inside the opened view | UNCHANGED component |

Forbidden: any other procedure; any client-side money arithmetic; any
client-side reordering/filtering of list rows (v0).

## §2 Panel states (list)

| State | Trigger | Observable behavior |
|-------|---------|---------------------|
| loading | mount / refresh | Panel shell renders; no rows yet |
| loaded (n>0) | query resolves | n rows newest-first; each row: title, currency badge, created date (`d MMM yyyy`, UTC), Open affordance |
| loaded (n=0) | query resolves empty | Empty state: copy guiding to the planner and the marketplace (both named); never blank |
| failed | query rejects | Wording from `listErrorMessage` (transport helper); `role="alert"`; never a crash/blank |

## §3 Open view (continue work)

| State | Trigger | Observable behavior |
|-------|---------|---------------------|
| loading | Open clicked | Row/panel indicates loading |
| opened | `get` resolves found | Trip title; day-by-day items via shared `ItineraryDays` (same rendering as a fresh draft, minus the budget-fit table); booking-status line when `bookings[]` non-empty (status strings verbatim); `BookingFlow` + `ShareControl` composed beneath, keyed by itinerary id; "Back to trips" affordance |
| failed | `get` rejects / NOT_FOUND | Wording from `openErrorMessage`; list stays usable |

## §4 Freshness contract

- Draft succeeds in `Planner` → `onDrafted` fires → list reloads (no page
  reload). e2e-asserted.
- Marketplace license → navigate to `/workspace` → fresh mount lists the
  white-label copy. e2e-asserted; DB-level truth pinned by L3
  (`l3-itinerary-list.test.ts`: buyer's list contains the receipt's copy id).

## §5 Access

- The panel renders only inside the workspace page's verified-agent branch
  (INV-024 UX gate; authorization stays per-procedure, INV-023 — anon
  UNAUTHORIZED / traveler FORBIDDEN, already L3-pinned).
- No change to anonymous/traveler behavior of `/workspace` (existing
  membership prompt, no panels).

## §6 Test obligations

| Level | File | Asserts |
|-------|------|---------|
| L1 | `apps/web/lib/__tests__/itinerary-list.test.ts` | `formatCreatedDate` determinism (UTC, en-GB, e.g. `9 Jul 2026`); failure-wording mapping |
| L3 | `packages/api/src/__tests__/l3-itinerary-list.test.ts` (EXTENDED) | license → buyer's list contains the copy id; seller's list unchanged by the trade (count + ids) |
| L4 | `tests/e2e/workspace-list-journey.spec.ts` | empty state → draft → row appears WITHOUT reload → open → days + booking + share controls visible → back; cross-agency license → buyer's workspace lists the copy |

No existing assertion may be weakened or retitled.
