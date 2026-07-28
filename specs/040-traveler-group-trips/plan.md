# Implementation Plan: Traveler group trips (spec 040)

**Branch**: `kitchen/fix-goal-group-trips-traveler-groups` · **Spec**: `./spec.md`

## Summary

A traveler-side group coordination layer: verified premium travelers create groups
around trips they can see, invite other verified members, chat, confirm, and the
organizer finalizes only when all confirm. Agency-less, non-money, bolt-on over the
canonical itinerary (no schema fork). Lives on the `clientView.*` surface + the
`(client-view)` route group (INV-024).

## Technical Context

- **Language/stack**: TypeScript monorepo (Next.js app-router web, tRPC, Drizzle on
  Postgres, Better Auth). Same stack as spec 021/030/031/038.
- **Surface**: new `clientView.groups.*` nested router (`protectedProcedure`), a new
  `services/group-trips.ts`, a new `packages/db/src/schema-group-trips.ts` (additive
  tables), and a `(client-view)/view/groups/*` route group.
- **Reuse**: `resolveShareLinkTenant` + `attachTraveler` (link trip to joiner),
  `toClientItineraryView` / `getUserIdentity` (names, INV-020), `scopedWhere` idiom
  only where an agency scope applies (it does not here — user-id scoping instead),
  the `recordPmfEvent` pattern is intentionally NOT used (agency-less; see spec
  Assumptions).
- **No new dependency**, no new datastore (chat is Postgres — INV-003), no supplier
  API, no money math.

## Constitution Check (against `.specify/memory/constitution.md` v1.1.0)

| Principle | Verdict | Justification |
|-----------|---------|---------------|
| **I. Marketplace-First** | PASS | The consumer group surface funnels demand into the network: groups form around agent-shared/marketplace trips, and each member books through the existing platform path. It is a coordination layer over agent-owned inventory, not a standalone planner race — it does not drift into the generic-consumer-planner non-goal. |
| **II. Agent Experience Is the Wedge** | PASS (N/A) | Agent-facing workflows unchanged; the agent-side group *departures* (spec 021) are untouched. |
| **III. Budget-Aware AI** | PASS (N/A) | No planner output changes; the group references an already-built itinerary. |
| **IV. Canonical Itinerary Schema** | PASS | Group data is bolt-on in its own tables referencing `itinerary.id`; the canonical document and `SCHEMA_VERSION` are unchanged (same pattern as `group_departure`/`consumer_plan_request`). Client-planned, group, and forked trips remain the same itinerary entity. |
| **V. Integrate Supply, Don't Contract It** | PASS (N/A) | No supplier interaction; no booking added here (members use the existing self-book). |
| **VI. Trust, Provenance & Revenue-Share Integrity** | PASS | Trust is enforced **mechanically in the transaction path**: the premium+identity eligibility gate refuses ineligible users at every action (state-conserving), and finalize is gated on all-party confirmation re-read inside its transaction. No revenue-share/client-ownership semantics are touched (no money moves). |

**Non-goals / roadmap**: the consumer surface is roadmap P2, operator-authorized this
pass (GOAL.md). Group travel is a new capability, authorized this pass. No P3/never
item is touched. **Money-path testing**: N/A (no money moves in v0); the finalize
gate and the eligibility gate still get L3 state-conservation tests on their failure
paths.

**Constitution amendment note (proposal — NOT applied here; operator-gated).**
Traveler group trips are not named in the PRD/constitution. A future amendment should
add, under the consumer-surface pillar, a "group coordination" sub-surface: verified
travelers form groups around marketplace/agent trips, coordinate, and commit
collectively, feeding the network (Principle I). This plan does **not** edit
`.specify/memory/constitution.md` (DIRECTIVE §2 ALWAYS-HALT). The amendment is
proposed to the operator via `OPERATOR-DESK.md` row `GROUP-TRIPS-AMEND` and ratified
at merge; until then the operator's GOAL.md D2.5/2.6 scope decision authorizes the
build.

## Data Model (additive — `packages/db/src/schema-group-trips.ts`)

New file, Drizzle, applied by the compose `migrate` one-shot (`drizzle-kit push`) —
additive, backfill-free (all-new tables), no `SCHEMA_VERSION` bump, hence **no
canonical-itinerary schema gate** (spec 021 precedent). Registered in `schema.ts`
(re-export + `schema` object) and re-exported from `index.ts`.

### `traveler_membership` (FR-002/003) — the eligibility primitive (models `agency_vetting`, keyed to `user.id`)
| Column | Type | Notes |
|--------|------|-------|
| userId | text PK → user.id (cascade) | one row per traveler |
| tier | text NOT NULL | `standard` \| `premium` |
| identityVerified | boolean NOT NULL default false | KYC stand-in flag (v0) |
| verifiedAt | timestamp NULL | set when identity-verified |
| createdAt / updatedAt | timestamp NOT NULL defaultNow | |

Eligible ⇔ `tier == 'premium' && identityVerified`.

### `traveler_group` (FR-001/010/011) — agency-less bolt-on over an itinerary
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| itineraryId | uuid NOT NULL → itinerary.id (`itineraryFk`, cascade) | the trip the group forms around |
| organizerUserId | text NOT NULL → user.id (cascade) | the creating traveler |
| title | text NOT NULL | group name |
| status | text NOT NULL | `forming` \| `finalized` \| `cancelled` |
| joinable | boolean NOT NULL | posted/open for joins |
| inviteToken | uuid NOT NULL UNIQUE defaultRandom | the shareable join handle (unguessable, like `itinerary_share_link.token`) |
| createdAt | timestamp NOT NULL defaultNow | |
| finalizedAt | timestamp NULL | set on finalize |
| cancelledAt | timestamp NULL | set on cancel |

Indexes: `index(organizerUserId)`, `index(inviteToken)` (join lookups). No agency
column by design (agency-less; attributing one would be an ownership decision —
ALWAYS-HALT, `consumer_plan_request` precedent).

### `traveler_group_member` (FR-004/005/007) — membership + confirmation
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| groupId | uuid NOT NULL → traveler_group.id (cascade) | |
| userId | text NOT NULL → user.id (cascade) | |
| role | text NOT NULL | `organizer` \| `member` |
| confirmationStatus | text NOT NULL | `pending` \| `confirmed` |
| joinedAt | timestamp NOT NULL defaultNow | |
| confirmedAt | timestamp NULL | set on confirm |

Indexes: `UNIQUE(groupId, userId)` (idempotent join + the membership predicate),
`index(userId)` ("my groups"), `index(groupId)` (roster).

### `traveler_group_message` (FR-006) — in-group chat (Postgres, INV-003)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| groupId | uuid NOT NULL → traveler_group.id (cascade) | |
| senderUserId | text NOT NULL → user.id (cascade) | |
| body | text NOT NULL | |
| createdAt | timestamp NOT NULL defaultNow | |

Index: `index(groupId, createdAt)` (chronological read).

### Existing tables touched
- **`client_trip_link`**: reused unchanged — a join links the group's trip to the
  joiner (`source = 'group'`) via the existing `attachTraveler` idempotent insert.
- **Canonical itinerary schema**: NO change. **`pmf_event`**: NO event emitted
  (agency-less; spec Assumptions).

## Services (`packages/api/src/services/group-trips.ts`)

Pure-ish application layer (drizzle stays in packages/db query helpers where a
predicate is non-trivial; simple reads inline like the other services). Business
refusals are typed VALUES (`not_eligible` / `not_found` / `forbidden` /
`awaiting_confirmations` / `not_joinable`); `TRPCError` is reserved for
auth/validation. All zod input schemas defined here, imported by the thin router.

- `getMembership(container, userId)` → `{ tier, identityVerified, eligible }`
- `verifyMembership(container, userId)` → upsert premium+verified (v0 stub), idempotent
- `requireEligible(db, userId)` → boolean gate used by every mutation
- `createGroup(container, session, { token, title })` — eligibility → resolve token →
  attach organizer → insert group + organizer member (confirmed) in one tx
- `joinGroup(container, session, { inviteToken })` — eligibility → resolve group →
  joinable+forming check → idempotent member insert + attach trip
- `listMyGroups(container, userId)` — groups where user is a member, newest first
- `getGroup(container, session, groupId)` — membership check → detail (trip view,
  roster with names + confirmation, my role, allConfirmed, messages)
- `postMessage(container, session, { groupId, body })` — membership + not-cancelled
- `confirmMembership(container, session, { groupId })` — set my confirmation=confirmed
- `finalizeGroup(container, session, { groupId })` — organizer-only; tx re-reads all
  members → all confirmed ⇒ finalized, else `awaiting_confirmations` (no change)
- `cancelGroup(container, session, { groupId })` — organizer-only; forming → cancelled

## Router (`packages/api/src/routers/group-trips.ts`)

`groupTripsRouter` = `router({ membership, verify, create, join, mine, get, message,
confirm, finalize, cancel })`, every procedure `protectedProcedure`. Mounted as
`clientView.groups` in `routers/client-view.ts` (INV-024 — traveler surface, never
`workspace.*`). Thin adapter: zod parse → service call → map `not_found`/`forbidden`
to TRPCError only where a value is not the right shape; keep business outcomes as
values for the UI.

## Web (`apps/web/app/(client-view)/view/groups/`)

- `/view/groups` — "My groups" list + "Create a group" (pick a My-Trip + name) +
  membership panel (become verified premium — v0) when not eligible.
- `/view/groups/[groupId]` — detail: trip summary, roster with confirmation state,
  in-group chat, confirm button, organizer finalize/cancel with the all-party gate
  surfaced.
- `/view/groups/join/[token]` — invite landing → join → redirect to the group.
- Add a "Groups" entry to the consumer side-nav (spec 037).

## Testing (unbeatable-tests L1–L4)

- **L1/L2** (`packages/api/src/__tests__/group-trips-*.test.ts` or service tests):
  eligibility gate logic; all-confirmed finalize logic; typed refusals.
- **L3** (`packages/api/src/__tests__/l3-group-trips.test.ts`, real Postgres via the
  compose DB, same harness as `l3-group-travel.test.ts`): full journey + the mandatory
  negatives — ineligible user refused create AND join with zero rows (SC-002);
  finalize refused while a member is pending, group unchanged (SC-003); non-member
  read/post refused (SC-004); non-organizer finalize refused; concurrent confirm-vs-
  finalize never finalizes with a pending member.
- **L4/Live** (INV-027): browser journey against the built compose stack — verify →
  create → invite → join (2nd account) → chat → confirm → finalize — with per-step
  screenshots + compose-log scan; UAT card + zero-context evaluator.

## Rollout / risk

- Additive, backfill-free; no existing behavior changes (existing suites stay green).
- No money path → no conservation-of-money risk; the two failure-path invariants
  (eligibility gate, all-party finalize) are L3-tested for state conservation.
- Operator gates: constitution amendment (proposal only, desk row) + the new
  agency-less traveler data-model are ratified at merge; the PR stays operator-gated
  (no auto-merge).
