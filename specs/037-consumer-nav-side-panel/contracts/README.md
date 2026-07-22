# API Contracts: Consumer-surface navigation side panel

**No new API contract.** This feature is UI-only:

- No new tRPC procedure, router, or input/output schema.
- The signed-in pages continue to use the existing session-scoped `clientView.me`
  and `clientView.myTrips` procedures. `my-trips/page.tsx` adds a call to the
  already-existing `clientView.me` (no new procedure) so the Account area can greet
  by name.
- INV-018 (web/mobile consume the same tRPC router) is unaffected — no client
  reaches the DB or an adapter except through existing `packages/api` procedures.
- INV-023 / INV-024 unchanged: `clientView.*` is the traveler router; workspace
  procedures remain unreachable from a traveler session. This feature adds no
  procedure that could widen that boundary.

The only new "contract" is the pure-data nav shape in
`apps/web/lib/client-nav.ts`, documented in `../data-model.md` and covered by
`apps/web/lib/__tests__/client-nav.test.ts`.
