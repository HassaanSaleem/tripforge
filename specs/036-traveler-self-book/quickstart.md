# Quickstart: Validating Traveler Self-Drive Booking

How to prove the feature works end-to-end. See [contracts/self-book.md](./contracts/self-book.md)
and [data-model.md](./data-model.md) for shapes.

## 1. Fast gate — unit + L3 (Postgres)

```bash
# In the built image / with DATABASE_URL pointing at the compose Postgres:
pnpm run lint
pnpm test                       # includes l3-traveler-self-book.test.ts
```

`l3-traveler-self-book.test.ts` asserts (against real Postgres row deltas):

- **Happy path**: agent drafts + shares an **un-booked** itinerary; a traveler
  self-books → `booking` +1, `booking_component` +N, `markup_ledger` +N,
  `pmf_event(booking_confirmed)` +N, all with `agency_id` = the itinerary's
  agency and `actor_user_id` = the traveler; `markup_minor = sell − net` exactly.
- **Failure conservation**: force one leg's supplier to reject → that leg has
  **no** component/ledger/event row and is not in `totalChargedMinor`; the held
  row is released (`consumed_at` back to null); other legs booked once.
- **Total failure**: force all legs to fail → **zero** new rows for the itinerary
  (byte-for-byte unchanged).
- **Nothing-to-book**: a fully-agent-booked itinerary → `nothing_to_book`, no new
  rows.
- **Redaction**: the returned payload contains no `netMinor`/`markupBps`/
  `merchantOfRecord`/`supplierBookingId`/`offerId`.
- **Auth**: an anonymous caller → `UNAUTHORIZED`.

## 2. Live-stack witness — the standing scenario

```bash
docker compose down -v && docker compose up --build --wait
BASE_URL=http://localhost:3000 node scenarios/incubating/traveler-self-book-attempt/scenario.mjs
```

Now asserts the seam **works** (was: proves the gap): a signed-in traveler
self-books a shared un-booked proposal, `booking_component` count rises,
attributed to the owning agency; the request-an-agent handoff still works.
Coverage cell `booking × web × client` flips `fail → pass`.

## 3. Browser QA journey (Playwright MCP, INV-027 Live Test)

1. Boot the built stack (above).
2. As an agent: draft a trip, **share** it (do not book) → copy the `/view/{token}` link.
3. Open `/view/{token}` in a fresh browser, **sign in** as a traveler (create a
   consumer account).
4. Click **Book it myself** → a **review** screen lists the concrete items with
   prices (recommendations) + a sourced "Before you book" panel.
5. Click **Confirm booking** → result shows each leg **Booked** with its price and
   a trip total; reload the trip page → items now show the **Booked** badge.
6. Anonymous check: open the link without signing in, click **Book it myself** →
   prompted to **sign in first** (no booking fires).

Screenshot each step to `.kitchenloop/evidence/8/goal-consumer-selfbook/`.
Scan compose logs for non-allowlisted `ERROR|FATAL|Unhandled`.

## 4. Expected outcome

- A traveler completes a real self-drive booking without contacting the agent.
- Money attribution equals the agent path; the owning agency earns markup.
- No failed leg is charged; a fully-failed booking changes nothing.
- No confidential fields in any traveler-facing response.
- No fabricated recommendations/advisories.
