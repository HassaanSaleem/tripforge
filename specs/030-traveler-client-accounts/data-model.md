# Data Model: Traveler Client Accounts

**No new table, no new column, no schema version bump.** This feature's entire data
footprint is one new read shape over the existing `user` table (research D1). This file
documents that read shape and confirms exactly which existing tables/columns are touched
(read-only) vs. untouched.

## New read shape: TravelerIdentity (not a table)

Defined in `packages/api/src/services/client-view.ts`, exported from `packages/api/src/index.ts`
(TS4023 convention, mirrors `ClientItineraryView`):

| Field | Type | Source |
|-------|------|--------|
| name | string | `user.name` (existing column, `packages/db/src/schema-auth.ts:12`) |
| email | string | `user.email` (existing column, `packages/db/src/schema-auth.ts:13`) |

Produced by `getSignedInIdentity(container, userId)`, which reads the ONE `user` row
matching `ctx.session.userId` — a value the `protectedProcedure` middleware derives
server-side from the verified Better Auth session, never from client input (research D5).
There is no filtering/scoping logic beyond the primary-key lookup because there is
nothing to scope: a user's own name/email is, by construction, exactly the row a
`protectedProcedure` caller is allowed to see (contrast with `workspace.*` procedures,
which additionally scope by `agencyId` because they read OTHER rows besides the caller's
own).

## Existing tables touched

- **`user`** (`packages/db/src/schema-auth.ts:10-18`): **read-only**. No new column. A
  "traveler" is simply a `user` row with zero `member` rows — that state already exists
  for every account created without going through `createAndActivateAgency`, including
  every account this feature's new client-view sign-up creates.
- **`member`** (`packages/db/src/schema-auth.ts:73-84`): **untouched, and deliberately
  never written by the new client-view sign-up flow** — this absence-of-a-row IS the
  traveler/agent distinction (research D1). The client-view sign-up form calls
  `signUpWithEmail` only, never `createAndActivateAgency`.
- **`session`** (`packages/db/src/schema-auth.ts:20-36`): **read-only, standard Better
  Auth flow**. No new column; `activeOrganizationId` stays `NULL` for a traveler exactly
  as it does today for any org-less user (the `databaseHooks.session.create.before` hook
  in `apps/web/lib/auth.ts` already handles this — no change to that hook).
- **`trip_handoff_request`** (spec 022, `packages/db/src/schema-trip-handoffs.ts`):
  **untouched shape**. The record created on submission is identical whether or not the
  submitter is signed in (spec 030 FR-006) — this feature explicitly does NOT add a
  `traveler_user_id` or any other identity-linking column to this table. That association
  (a durable link from a submitted/accepted request back to the signed-in account) is
  exactly the kind of work the separate, still-gated `p2-consumer-trip-history` ticket
  covers — deliberately deferred, not silently dropped.
- **`itinerary_share_link`** (spec 010): **untouched**, read via the same existing
  token-resolution path.

## Canonical itinerary schema

**NO change** — this feature never touches the `Itinerary` document, its
`SCHEMA_VERSION`, or any canonical-schema package export. It is entirely an
auth/read-projection feature layered on top of the existing client-view and trip-handoff
surfaces.

## Why this satisfies the ticket's HALT/migration-note requirement

The ticket (and DIRECTIVE §2) require an explicit, versioned migration note whenever a
plan touches auth or schema. The note here is explicit rather than silent: **zero
columns, zero tables, zero enum values added anywhere**. The traveler identity this
feature exposes was already fully representable — and already exercised by an existing
L3 test fixture (`l3-client-view.test.ts:151`) — before this feature existed. What's new
is a UI/API surface that *lets a traveler reach that already-representable state on
purpose* (sign up without an agency) and *read it back* (`clientView.me`), not the
underlying data model.
