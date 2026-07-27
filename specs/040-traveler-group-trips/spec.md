# Feature Specification: Traveler group trips — create, post, join, chat, all-party finalize (identity-gated premium members)

**Feature Branch**: `kitchen/fix-goal-group-trips-traveler-groups`

**Created**: 2026-07-27

**Status**: Draft

**Input**: Ticket `goal-group-trips` (GOAL.md Deliverable 2.5/2.6). "Build traveler
group travel: create a group, post it so others can join, and finalize the trip
collectively — plus join group trips already running. Trust/safety is in-scope
(Constitution VI — enforce mechanically): in-group chat, explicit confirmation from
ALL parties before finalize, and gating so ONLY verified, identity-validated premium
members may post or join. Model group membership on the canonical itinerary entity
(Principle IV — no schema fork)."

## Scope note (v0) — what this feature is, and what it is NOT

This is the **traveler/consumer side** of group travel. It is distinct from the
already-shipped **agent-side** group *departures* (spec 021, `workspace.groupTravel.*`),
where an agency posts paid seat inventory over an agency-owned itinerary and agents
join seats on behalf of named clients. This feature is a **coordination layer for
signed-in travelers**: a traveler forms a group around a trip they can already see,
invites other verified members, they chat, everyone confirms, and the trip is
finalized collectively. It lives entirely on the traveler surface (`clientView.*` +
the `(client-view)` route group), never under `workspace.*` (INV-024).

**In v0 (this spec):** traveler-created groups; identity-gated premium membership;
invite-token join; in-group chat; per-member confirmation; organizer finalize gated
on all-party confirmation. **NOT a money path** — a group moves no money; each member
still books through the existing per-traveler self-book path (spec 036) once the
group is finalized.

**Deferred (follow-up ticket `goal-group-trips-join-departure`):** a traveler joining
a **paid agent-hosted `group_departure`** (spec 021) is a money path (per-seat price)
that requires an additive `traveler_user_id` on the seat sale record plus L3
state-conservation on the capacity claim, and is scoped as its own cycle. This spec
delivers the coordination core; the paid-departure bridge is called out where it
attaches.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A verified premium traveler creates and posts a group (Priority: P1)

A signed-in traveler who is a **verified, identity-validated premium member** takes a
trip they can already see (a shared itinerary in their "My Trips") and creates a
**group** around it: a group name, posted (joinable) so others can join by invite. The
creator is the **organizer** and is auto-confirmed.

**Why this priority**: Without a posted group, nothing else in this feature has
anything to act on. This is the smallest independently valuable slice.

**Independent Test**: A verified premium traveler with a linked trip creates a group;
the group exists with `status = forming`, `joinable = true`, an invite token, and the
organizer recorded as a `confirmed` member. A traveler who is NOT a verified premium
member is refused and no group is created.

**Acceptance Scenarios**:

1. **Given** a verified premium traveler and a trip in their My Trips, **When** they
   create a group with a name, **Then** a group is created (`status = forming`,
   `joinable = true`), with a shareable invite token and the organizer as a
   `confirmed` member.
2. **Given** a signed-in traveler who is NOT premium+verified, **When** they attempt
   to create a group, **Then** the attempt is refused with a typed `not_eligible`
   outcome and NO group, member, or message row is created (state conservation on the
   gate).
3. **Given** a traveler creating a group from a share token they cannot resolve (never
   viewed / unknown), **When** they submit, **Then** the attempt is refused
   (`not_found`) and nothing is created — no existence oracle.

---

### User Story 2 — Other verified members join by invite and chat (Priority: P2)

Another **verified premium** traveler opens the organizer's invite and **joins** the
group, becoming a `pending` member. Joining also links the trip into the joiner's own
"My Trips" so they can see it. Members exchange messages in an **in-group chat**.

**Why this priority**: The group is only collective once others can join and
coordinate. Depends on US1 but is independently testable.

**Independent Test**: With a posted group, a second verified premium traveler joins via
the invite token → a member row exists (`role = member`, `confirmation = pending`), the
trip is linked to the joiner, and both members can post and read chat messages. A
non-premium/unverified traveler is refused the join (no member row created); a
non-member cannot read or post to the group.

**Acceptance Scenarios**:

1. **Given** a posted, forming group and a verified premium traveler, **When** they
   join via the invite token, **Then** a member row is created (`member`/`pending`),
   the group's trip is linked into their My Trips, and a repeat join is idempotent (no
   duplicate member row).
2. **Given** a non-premium or unidentified traveler, **When** they attempt to join,
   **Then** the attempt is refused (`not_eligible`) and NO member row is created.
3. **Given** a member of a group, **When** they post a chat message, **Then** the
   message is stored and visible to every member in order; a **non-member** attempting
   to read or post is refused (`forbidden`) with no message created.
4. **Given** a cancelled group, **When** a join or a new message is attempted, **Then**
   it is refused and nothing is recorded.

---

### User Story 3 — Finalize requires all-party confirmation (Priority: P1)

Each member **confirms** they are in. The organizer can **finalize** the trip
collectively, but finalize is **mechanically gated**: it succeeds only when **every**
member has confirmed. Otherwise it is refused with the list of members still pending,
and the group stays `forming` (no state change).

**Why this priority**: The all-party-confirmation gate is the trust invariant the
feature exists to prove (Constitution VI — enforced in the transaction path, not a
policy doc). It is the highest-value, highest-risk behavior.

**Independent Test**: A group with two members where only the organizer has confirmed:
a finalize attempt is refused (`awaiting_confirmations`) and the group remains
`forming` with no `finalizedAt`. After the second member confirms, the organizer's
finalize succeeds — `status = finalized`, `finalizedAt` set. A **non-organizer**
finalize attempt is always refused.

**Acceptance Scenarios**:

1. **Given** a group where at least one member is still `pending`, **When** the
   organizer finalizes, **Then** the attempt is refused (`awaiting_confirmations`, with
   the count/identities of pending members), `status` stays `forming`, and
   `finalizedAt` is null (state conservation on the failure path).
2. **Given** a group where **all** members are `confirmed`, **When** the organizer
   finalizes, **Then** `status = finalized` and `finalizedAt` is set, exactly once
   (idempotent/again → already finalized, no second transition).
3. **Given** a member who is not the organizer, **When** they attempt to finalize,
   **Then** the attempt is refused (`forbidden`) and no state changes.
4. **Given** a member confirming concurrently with the organizer finalizing, **When**
   both run, **Then** finalize either sees all-confirmed and finalizes, or sees a
   pending member and refuses — it NEVER finalizes a group with an unconfirmed member
   (the confirmation set is re-read inside the finalize transaction).

---

### Edge Cases

- **Eligibility is checked at every gate**, not just at sign-up: a member who was
  premium+verified when they joined but is later downgraded is re-checked on the next
  post/join/finalize action (the gate reads current membership state).
- **Organizer is always a confirmed member** from creation; they need not separately
  confirm. Finalize considers the organizer confirmed by construction.
- **Empty group** (organizer only): finalize succeeds immediately (the sole member —
  the organizer — is confirmed).
- **Identity/premium verification in v0** is a self-serve action that sets the
  premium + identity-verified flags (a stand-in for the real KYC/payment integration,
  which is deferred like flights-as-merchant-of-record). The mechanically-enforced
  invariant — an ineligible user is refused every gated action — is real and tested;
  the *acquisition* of eligibility is a v0 stub, clearly labelled.
- **Cancelled group**: the organizer may cancel a `forming` group; joins and messages
  are refused thereafter; already-recorded members/messages are untouched.
- **No group capacity limit in v0** (unlike agent seat departures): a traveler group is
  free coordination, so there is no seat/capacity race and no money — joins are
  idempotent inserts, not an atomic decrement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a signed-in traveler who is a verified premium member
  create a group around an itinerary they can resolve via a share token they have
  linked (My Trips), recording a group name, `status = forming`, `joinable = true`, an
  unguessable invite token, and the creator as a `confirmed` organizer member — in one
  atomic operation.
- **FR-002**: The system MUST refuse any create/post/join/confirm/finalize/message
  action from a user who is NOT a verified premium member, with a typed `not_eligible`
  outcome, creating no rows (state conservation on the eligibility gate).
- **FR-003**: The system MUST provide a v0 self-serve action for a signed-in traveler to
  become a verified premium member (sets premium tier + identity-verified), idempotent,
  and a query to read the caller's own membership state. This is an explicit v0 stand-in
  for real KYC/payment; the enforcement (FR-002) is the load-bearing part.
- **FR-004**: A verified premium traveler MUST be able to join a `forming`, `joinable`
  group via its invite token, creating a `member`/`pending` membership (idempotent per
  (group, user)) and linking the group's trip into the joiner's My Trips; a join against
  a cancelled/finalized or non-joinable group MUST be refused with no member row.
- **FR-005**: Group reads and writes MUST be scoped to membership: only a member may
  read a group's detail, roster, and messages or post a message; a non-member is refused
  (`forbidden`). Membership is derived from `traveler_group_member.user_id = session
  user id` (server-derived, never client input).
- **FR-006**: Members MUST be able to post and read in-group chat messages (traveler-
  authored, group-scoped, Postgres-backed — INV-003, no new datastore), returned in
  chronological order with the sender's display name.
- **FR-007**: Each member MUST be able to confirm their participation (`pending →
  confirmed`); the organizer is `confirmed` by construction at creation.
- **FR-008**: The organizer (and only the organizer) MUST be able to finalize a
  `forming` group; finalize MUST succeed only when EVERY member is `confirmed`,
  transitioning `status = finalized` and setting `finalizedAt`. If any member is
  `pending`, finalize MUST be refused (`awaiting_confirmations`) with the group left
  `forming` and `finalizedAt` null. The confirmation set MUST be re-read inside the
  finalize transaction so a group is never finalized with an unconfirmed member.
- **FR-009**: A traveler MUST be able to list their own groups (organizer or member),
  newest first, with each group's trip title, member count, confirmation summary, their
  role, and status.
- **FR-010**: The organizer MUST be able to cancel a `forming` group (`status =
  cancelled`); cancellation prevents further joins/messages and does not delete existing
  members/messages.
- **FR-011**: The group is a **bolt-on** over the canonical itinerary (Principle IV) —
  it references an existing itinerary by id and NEVER modifies the itinerary document or
  its `SCHEMA_VERSION`. The group is **agency-less** and **NOT a money path**: it carries
  no net rate / markup / take-rate / revenue-share / sell total, and attributes no
  agency ownership (following the `consumer_plan_request` precedent).
- **FR-012**: All traveler-facing figures shown for a group's trip MUST remain
  client-facing only (INV-020) — reuse the existing `toClientItineraryView` projection;
  no net rate, markup, or agency-confidential value is ever exposed.

### Key Entities

- **Traveler membership**: a per-user eligibility record (`tier` standard|premium,
  `identityVerified` boolean, `verifiedAt`). Keyed to `user.id`. The existence-gated
  trust primitive, modeled on `agency_vetting` but for travelers. Eligible ⇔ premium
  AND identity-verified.
- **Traveler group**: agency-less bolt-on over one itinerary — organizer (`user.id`),
  title, `status` (forming|finalized|cancelled), `joinable`, invite token,
  timestamps. Not a canonical schema change (own table, FK reference), the same
  bolt-on pattern as `group_departure`/`consumer_plan_request`.
- **Group member**: one participant — `user.id`, `role` (organizer|member),
  `confirmationStatus` (pending|confirmed), timestamps. UNIQUE(group, user).
- **Group message**: one chat message — sender `user.id`, body, timestamp;
  group-scoped, chronological.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A verified premium traveler can create a posted group and see it in "My
  groups" within one action, with themselves as the confirmed organizer.
- **SC-002**: 100% of gated actions (create/post/join/confirm/finalize/message)
  attempted by an ineligible (non-premium or unverified) user are refused and leave zero
  new rows (state conservation), verified in an integration test against real Postgres.
- **SC-003**: 100% of finalize attempts on a group with any pending member are refused
  and leave the group `forming` with `finalizedAt` null; a finalize on an all-confirmed
  group transitions exactly once — verified including the concurrent confirm-vs-finalize
  branch.
- **SC-004**: A non-member can never read or post to a group (100% refused), and a
  non-organizer can never finalize.
- **SC-005**: The end-to-end journey — verify → create → invite → join → chat → confirm
  → finalize — completes against a real running compose stack with real persisted state
  (L3) and a live browser journey (INV-027).

## Assumptions

- **Groups form around an already-visible trip**: v0 requires the organizer to have a
  linked trip (My Trips), referenced by its share token. Collaboratively *building* a new
  trip from scratch inside a group (group-authored AI planning) is out of v0 scope — the
  group coordinates around an existing itinerary. This keeps the itinerary ownership
  model unchanged (still agency-owned; the group changes nothing about ownership).
- **Eligibility acquisition is a v0 stub**: real identity validation (KYC) and premium
  billing are deferred integrations (like flights merchant-of-record). The enforced
  invariant is the negative — an ineligible user is mechanically refused.
- **No group capacity / no money**: unlike agent seat departures, a traveler group has
  no seat price and no capacity cap, so there is no oversell race and no conservation-of-
  money path; the money still flows through each member's existing self-book.
- **PMF events**: a traveler group is agency-less and books nothing, so it emits no
  `pmf_event` (that table is agency-scoped by construction, INV-004) — matching the
  `consumer_plan_request` precedent. GBV/plan→book are still captured when members book
  via the existing `booking_confirmed` path.

### Decisions surfaced for operator review

- **D-0040.a — PRD/Constitution amendment for traveler group travel**: traveler group
  trips are a **new capability not in the PRD** (operator-authorized this pass per
  GOAL.md D2.5/2.6). The constitution's product surface should be amended to name the
  consumer group-travel coordination surface. Per DIRECTIVE §2, a constitution amendment
  ALWAYS HALTS — this spec carries the amendment as a **proposal note** (plan.md
  "Constitution amendment note"); the amendment itself is ratified by the operator at
  merge (build-now-ratify-at-merge, matching P2-IDENTITY-GATE / P2-HISTORY-GATE /
  SCHEMA-GATE-78). See `OPERATOR-DESK.md` row `GROUP-TRIPS-AMEND`.
- **D-0040.b — Paid agent-hosted departure join deferred**: a traveler joining a paid
  spec-021 `group_departure` is a money path (per-seat price) needing an additive
  `traveler_user_id` on the immutable seat record + L3 conservation. RECOMMENDED: defer
  to a dedicated cycle (`goal-group-trips-join-departure`), reusing the existing atomic
  capacity claim gate. v0 ships the free coordination core.
- **D-0040.c — Traveler eligibility acquisition**: v0 makes verification a self-serve
  stub. RECOMMENDED: keep the mechanical enforcement now; wire a real KYC/premium-billing
  provider behind the same `traveler_membership` gate in a later cycle (an integration,
  not a semantics change).
