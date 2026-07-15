# Feature Specification: Traveler Client Accounts — Optional Sign-In on the Client View

**Feature Branch**: `kitchen/fix-p2-consumer-accounts-identity-traveler-signin`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "P2 consumer surface (identity slice): traveler accounts + client
sign-in on the client-view, prefill the request-an-agent form from the account. Ticket:
p2-consumer-accounts-identity. Operator-authorized 2026-07-15 (P2-IDENTITY-GATE, 'Build now,
ratify at merge'). Trigger: on the public client-view `/view/<token>` 'Have an agent arrange
this for me' form, the traveler types name/email by hand because there is no client account.
Scope: (1) a traveler/consumer account type distinct from agency membership, (2) optional
client sign-in/sign-up on the (client-view) route group, additive — anonymous token access
must keep working unchanged, (3) prefill the request-an-agent form's contact name/email from
the signed-in traveler, still editable, (4) preserve INV-020 (no markup/net-rate/platform
branding leak) and INV-024 (route-group separation — no workspace affordances on the client
surface)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A returning traveler's request form fills itself in (Priority: P1)

A traveler previously created a lightweight account (or is prompted to on their first visit).
The next time they open any shared trip link and choose "Have an agent arrange this for me,"
the form already shows their name and email — they only need to add or edit a note before
submitting. They can still change the pre-filled name/email if they're requesting on behalf of
someone else.

**Why this priority**: This is the entire product value of the feature — it removes the
friction the ticket names (retyping name/email on every request) and is the reason the P2
roadmap tier gets a bounded promotion at all. Without it, sign-in exists but delivers nothing.

**Independent Test**: Sign in as a traveler with a known name/email, open a shared trip link,
select "Have an agent arrange this for me," and verify the name and email fields render
pre-filled with the signed-in account's values while remaining editable, and that submitting
without changes creates a trip request carrying those values.

**Acceptance Scenarios**:

1. **Given** a traveler is signed in with name "Amina Yusuf" and email "amina@example.com",
   **When** they open a shared trip and select "Have an agent arrange this for me," **Then**
   the contact name field shows "Amina Yusuf" and the email field shows "amina@example.com",
   both editable.
2. **Given** the pre-filled form from Scenario 1, **When** the traveler edits the name field
   and submits, **Then** the trip request is created with the edited name, not the account
   name.
3. **Given** a traveler is signed in, **When** they open a **different** shared trip (a
   different itinerary/token) and select "Have an agent arrange this for me," **Then** the
   form is pre-filled the same way — pre-fill is per-account, not per-trip.

---

### User Story 2 - A traveler creates a lightweight account from the client view (Priority: P2)

A traveler on a shared trip page who does not yet have an account can create one in a couple
of fields (name, email, password) without ever being asked to create or join a travel agency.
Once created, they are signed in and see the same trip page, now with the sign-in-aware
behavior from User Story 1 available on this and future visits.

**Why this priority**: User Story 1 has no traveler to sign in without this. It is P2, not P1,
because the feature must degrade gracefully to full anonymous use (User Story 3) with zero
account — sign-up is the on-ramp, not the gate.

**Independent Test**: From a shared trip page, follow the sign-up affordance, create an
account with a name/email/password, and verify the traveler ends up signed in on the same
trip page with no agency-creation step anywhere in the flow, and no redirect into the agent
workspace.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor on a shared trip page, **When** they open the client-view
   sign-up form and submit a valid name, email, and password, **Then** they are signed in and
   remain on (or return to) the trip page they started from.
2. **Given** the sign-up flow in Scenario 1, **When** it completes, **Then** no step at any
   point offers to create or name an agency/organization, and the resulting account has no
   agency membership.
3. **Given** an email address that is already registered (by a traveler or an agent), **When**
   someone attempts to sign up again with it, **Then** sign-up is refused with a clear message
   and no duplicate account is created.

---

### User Story 3 - Anonymous access keeps working exactly as before (Priority: P1)

A traveler who never creates an account, or who is signed out, opens a shared trip link and
uses "Have an agent arrange this for me" exactly as they could before this feature existed:
typing their name and (optionally) email by hand, with no sign-in prompt blocking them.

**Why this priority**: This is a regression guard on an already-shipped trust boundary
(INV-018: possession of the token is the grant). It is P1 because breaking it — even
accidentally, even for a UI-only change — is a bigger failure than the new feature not
existing at all.

**Independent Test**: With no session cookie present, open a shared trip link, submit the
request-an-agent form with a hand-typed name and email, and verify the trip request is created
identically to the feature's pre-existing behavior, and that the trip view itself renders with
no sign-in requirement of any kind.

**Acceptance Scenarios**:

1. **Given** no session (a fresh, cookie-less browser), **When** a visitor opens a valid share
   link, **Then** the itinerary renders exactly as it does today — no sign-in wall, no
   degraded content.
2. **Given** the same anonymous state, **When** the visitor submits the request-an-agent form
   with a hand-typed name (email omitted), **Then** the trip request is created exactly as it
   is today, with `status: "new"`.
3. **Given** the same anonymous state, **When** the visitor chooses "Book it myself" instead,
   **Then** that path behaves exactly as it does today, unaffected by the existence of sign-in
   elsewhere on the page.

---

### Edge Cases

- **Signed-in agent opens a shared trip link**: a visitor who happens to hold an *agent*
  session (an active agency membership) sees the same client view as everyone else — no
  workspace affordances, no agency-only data (unchanged from spec 010's existing edge case,
  INV-024). If they open the request-an-agent form, pre-fill MAY use their own account's
  name/email like any other signed-in visitor; this reveals nothing they do not already know
  about their own account and grants no new capability.
- **Traveler signs in mid-session on an already-open trip page**: the pre-fill only needs to
  reflect the signed-in state at the moment the request-an-agent form is opened/submitted, not
  retroactively rewrite a form the visitor already filled in by hand.
- **Traveler clears the pre-filled fields entirely**: submission with a blank required name is
  rejected exactly as today (FR-004 of spec 022), regardless of sign-in state.
- **Account created with a name that looks like an agency name**: no special handling — traveler
  accounts are not validated against agency names; this is a display string only, not an
  authorization signal.
- **Traveler signs out**: reverts immediately to the fully anonymous experience (User Story 3);
  no residual pre-fill or account-linked state persists in the UI after sign-out.
- **Deleted/unknown token while signed in**: behaves exactly like the unknown-token case for an
  anonymous visitor (friendly unavailable state) — sign-in state has no bearing on token
  resolution (unchanged from spec 010 FR-003).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The client-view route group MUST offer an optional sign-in and sign-up
  affordance for travelers, visibly and functionally distinct from the agent workspace's
  sign-in (different entry point, different copy, no agency-creation step reachable from it).
- **FR-002**: A traveler account created from the client-view MUST NOT be offered, prompted,
  or defaulted into agency/organization creation or membership; such an account MUST start
  with, and remain in, an org-less ("traveler") identity state unless separately promoted
  through the existing agent sign-up flow.
- **FR-003**: Anonymous (no-session) access to a valid `/view/<token>` link, and anonymous
  submission of the request-an-agent form, MUST continue to work exactly as specified in spec
  010 (FR-005, as amended below) and spec 022 (FR-002–FR-004) with no new requirement, prompt,
  or friction introduced by this feature.
- **FR-004**: When a signed-in traveler (a session with no active agency/organization) opens
  the request-an-agent form, the contact-name and email fields MUST be pre-filled from that
  account's name and email, MUST remain fully editable, and submission MUST use whatever
  values are in the fields at submit time (edited or not).
- **FR-005**: A signed-in AGENT (a session with an active agency/organization) visiting the
  client-view MUST see the same experience as any other visitor per spec 010 FR-010 (INV-024)
  — no workspace affordances, no agent-only data. Pre-fill on the request-an-agent form MAY
  use that account's own name/email exactly as it would for a traveler account, since this
  discloses nothing beyond what that signed-in user already knows about their own identity.
- **FR-006**: The trip-request record created on submission MUST remain shape-identical to
  spec 022's existing `trip_handoff_request` record regardless of the submitter's sign-in
  state — this feature MUST NOT require a schema change to that table (associating a request
  with a durable traveler identity is out of scope; see Assumptions).
- **FR-007**: Traveler sign-in MUST use the same session mechanism already used by the agent
  workspace (one shared Better Auth session), so a signed-in state persists across shared trip
  pages visited in the same browser without re-authenticating per trip.
- **FR-008**: A signed-in traveler MUST be able to sign out from the client-view surface and
  land back on a client-view page (never redirected into the agent workspace).
- **FR-009**: The client-view sign-in/sign-up UI MUST carry zero platform branding beyond what
  spec 010 already permits on the neutral client shell (INV-020) and MUST NOT surface any
  agent-only navigation, data, or controls (extends spec 010 FR-010).

### Key Entities

- **Traveler identity**: a person who has created an account to be recognized across shared
  trips they view, without being a member of any travel agency. No new attributes beyond a
  display name and an email address (used purely for form pre-fill in this feature).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in traveler reaches a submitted request-an-agent request on any shared
  trip without typing their name or email by hand (pre-filled), needing to type at most an
  optional note.
- **SC-002**: 100% of existing anonymous client-view behaviors (view rendering, "Book it
  myself," hand-typed request-an-agent submission) continue to pass their existing acceptance
  criteria unchanged — zero regressions, verified by automated tests.
- **SC-003**: A new traveler can go from "no account" to "signed in on the trip page they
  started from" in under 60 seconds, with zero prompts related to agencies/organizations at
  any point in that flow.
- **SC-004**: Across all three visitor states (signed out, signed-in traveler, signed-in
  agent), platform branding and agent-confidential values (net rate, markup, budget
  allocation, other agencies'/travelers' data) appearing on the client surface or in its
  payload: **zero**, verified by automated negative checks (extends spec 010 SC-002/SC-003).

## Assumptions

- **Identity model**: this feature reuses the already-existing "org-less Better Auth user" as
  the traveler identity — the system already treats a user with zero agency memberships as a
  traveler session (`getSessionContext` returns an identity with no agency/role for such
  users). No new column or table is required to represent "this user is a traveler"; that
  state is simply the absence of agency membership. The plan documents this as the additive,
  backfill-free migration note this ticket's HALT requires.
- **No new trip-history association ships here**: linking a signed-in traveler's account to
  the specific trips they've viewed or the bookings made for them (a "My Trips" history) is
  explicitly out of scope and deferred to the separate, still-gated `p2-consumer-trip-history`
  ticket. This feature only reads the signed-in account's own name/email for form pre-fill; it
  does not persist any new traveler↔itinerary or traveler↔booking association.
- **Sign-up on the client-view intentionally omits agency creation**: unlike the workspace
  sign-up flow (which creates and activates an agency), a client-view sign-up produces a plain
  traveler account and nothing else.
- **Password-based email/password sign-in is reused, not a new auth method**: the feature
  does not introduce OAuth, magic links, or any auth mechanism beyond what the workspace
  already uses.
- **This is the bounded, operator-authorized P0 carve-out of the P2 consumer-surface roadmap
  tier** (system-architecture.md §1.4: "View/approve via share links or lightweight account;
  full self-serve planner is P2"; ticket authorization P2-IDENTITY-GATE, 2026-07-15). The full
  self-serve consumer AI planner and the PRD non-goal "generic consumer planner" remain out of
  scope; this feature funnels demand into the existing request-an-agent path (Constitution I)
  rather than building new planning surface.
- **Depends on, and amends in place**: `specs/010-client-view-share/spec.md` (FR-005, the
  Assumptions bullet on link-bearer access) and `specs/022-request-agent-fork/spec.md` (the
  Assumptions bullet on "no anonymous consumer authentication") — both amended below per this
  repo's inline-blockquote convention, clarifying that authentication becomes *optional*
  without changing anonymous access.
