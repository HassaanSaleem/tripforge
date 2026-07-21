# Feature Specification: Traveler Home — the post-auth landing at `/view`

**Feature Branch**: `kitchen/fix-goal-traveler-account-home`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description (ticket `goal-traveler-account`, GOAL.md Deliverable 2.1): "Today
travelers only get a token-scoped identity for viewing a shared trip. Give travelers a real
self-serve account: sign-up/sign-in that stands on its own (not gated behind a share token), a
traveler home landing after auth, and My Trips reachable from it. Keep INV-018/INV-020/INV-023
(traveler role can never invoke a workspace procedure; client-view stays brand-neutral). Reuse
Better Auth; no schema fork."

Grounding context: traveler identity (org-less Better Auth `user`) shipped in spec 030 (#80) and
"My Trips" (spec 031, #82) already exist. The remaining gap the iter-7 triage recorded (report
FEAT-3 / FRICTION-2 / FRICTION-5): after a traveler signs up/in with **no** share token, the
post-auth redirect lands them on `/view`, which is a **static placeholder card** ("Your trip /
This is the traveler-facing view…") with **no navigation** — a brand-new traveler has nowhere to
go, even though `/for-travelers`' CTA is "Sign in to plan a trip." This feature makes `/view` a
real traveler home.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new traveler signs up and lands somewhere real (Priority: P1)

A traveler who creates an account from the consumer surface with **no share token** lands on a
personalized home that greets them and gives them somewhere to go — first and foremost, their
"My Trips." Before this feature they landed on a dead placeholder card.

**Why this priority**: This is the entire trigger of the ticket ("a brand-new traveler has nowhere
to go"). Without it, sign-up-without-a-token (spec 030) completes into a dead end and the
`/for-travelers` "Sign in to plan a trip" CTA leads nowhere usable.

**Independent Test**: From a signed-out browser, go to `/view/sign-up` (no `?token=`), create an
account, and verify the traveler lands on `/view` showing a personalized home with a working link
to "My Trips" — never the old static "This is the traveler-facing view…" placeholder.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor on `/view/sign-up` with no share token, **When** they create an
   account, **Then** they land on `/view` showing a home greeting them by their name and a clearly
   labeled way to reach "My Trips."
2. **Given** a signed-in traveler on the home, **When** they select "My Trips," **Then** they land
   on `/view/my-trips` (the existing spec-031 list).
3. **Given** a signed-in traveler on the home, **When** they read the home, **Then** the two
   consumer surfaces that are not built yet ("Plan a trip," "Discover what's hot") are shown as
   clearly-labeled **coming soon** — present as a signpost, but never as a working link that dead-ends
   or a promise the product cannot keep.

---

### User Story 2 - A returning traveler navigates their account and can sign out (Priority: P2)

A signed-in traveler treats `/view` as their account home: they can jump to My Trips and sign out
from it, returning to an anonymous state. Signing out never leaves them on a page that still shows
their private data.

**Why this priority**: A home is only a home if you can leave it cleanly; sign-out from the
traveler surface currently exists only inside a shared trip's fork panel (`trip-fork.tsx`), not on
a standalone home. P2 because User Story 1 already delivers the core landing value.

**Independent Test**: Sign in as a traveler, land on the home, click "Sign out," and verify the
session ends and the visitor is returned to the anonymous `/view` welcome (not a page still
greeting them by name).

**Acceptance Scenarios**:

1. **Given** a signed-in traveler on the home, **When** they click "Sign out," **Then** the session
   ends and they see the anonymous `/view` welcome, not their personalized home.
2. **Given** a traveler who signed out, **When** they revisit `/view`, **Then** they see the
   anonymous welcome (sign in / create an account), never a stale personalized greeting.

---

### User Story 3 - The home never becomes a workspace, and never shows another traveler's data (Priority: P1)

The traveler home is brand-neutral (no platform branding, INV-020) and carries no agent/workspace
affordances (INV-024); a traveler session still cannot reach any workspace procedure (INV-023). An
anonymous visitor to `/view` sees a brand-neutral welcome, never trip data computed for an
unauthenticated request.

**Why this priority**: This is the trust boundary the ticket and GOAL both pin ("Keep
INV-018/INV-020/INV-023"). It is P1 because a leak here is a security/brand defect, not a polish
issue. It must hold for both the anonymous welcome and the signed-in home.

**Independent Test**: (a) As an anonymous visitor, open `/view` and verify no "TripForge"/"Trellis"
text or tab title, no "Agency workspace" link, and no trip data — only a sign-in/sign-up welcome.
(b) As a signed-in traveler, verify the home shows no platform branding and no workspace link. (c)
Assert (existing L3) a traveler session is FORBIDDEN from every `workspace.*` procedure.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they open `/view`, **Then** the page shows a
   brand-neutral welcome with sign-in and create-account actions and **no** platform branding in
   body or tab title, and **no** agent/workspace affordance.
2. **Given** a signed-in traveler on the home, **When** the home renders, **Then** it contains no
   "TripForge"/"Trellis" text and no "Agency workspace" link.
3. **Given** a traveler session, **When** it calls any `workspace.*` procedure, **Then** it is
   rejected with FORBIDDEN (INV-023, unchanged — no new server capability is added by this feature).

---

### Edge Cases

- **Anonymous `/view`**: renders the brand-neutral welcome (sign-in / create-account), never a
  redirect that would strip the existing INV-020/INV-024 anonymous guarantees pinned on `/view`
  (smoke.spec.ts, trust-boundary.spec.ts) and never any trip data.
- **Signed-in traveler with zero trips**: the home still renders; the My Trips affordance points at
  `/view/my-trips`, whose own empty state (spec 031) explains what to do — the home does not
  duplicate that copy.
- **`me()` identity lookup returns null** (defense in depth; Better Auth guarantees a session has a
  user row): the home greets generically ("Welcome back") rather than failing.
- **A signed-in agent opens `/view`**: sees the same brand-neutral traveler home (no leak, no
  crash); the home is not an agent surface and makes no agent claims. Redirecting agents elsewhere
  is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A signed-in traveler visiting `/view` MUST see a personalized home that greets them
  by name (falling back to a generic greeting if the identity lookup is empty).
- **FR-002**: The home MUST provide a working link to "My Trips" (`/view/my-trips`) reachable in
  one action.
- **FR-003**: The home MUST surface the not-yet-built consumer surfaces ("Plan a trip," "Discover
  what's hot") as clearly-labeled **coming soon**, with no dead links and no claim the product
  cannot currently keep (consumer-copy honesty).
- **FR-004**: The home MUST provide a sign-out action that ends the session and returns the visitor
  to the anonymous `/view` welcome.
- **FR-005**: An anonymous visitor to `/view` MUST see a brand-neutral welcome offering sign-in and
  create-account, and MUST NOT be shown any trip data (no data is computed or fetched for an
  unauthenticated request).
- **FR-006**: The `/view` home (anonymous welcome AND signed-in home) MUST be brand-neutral
  (INV-020: no "TripForge"/"Trellis" in body or tab title) and MUST carry no agent/workspace
  affordance (INV-024: no "Agency workspace" link, no "agency membership" prompt).
- **FR-007**: This feature MUST NOT add any new server procedure or change identity/authorization:
  a traveler session remains unable to invoke any `workspace.*` procedure (INV-023). The home reads
  ONLY the existing session-aware `clientView.me` and `clientView.myTrips` procedures.
- **FR-008**: Sign-up/sign-in MUST continue to stand on their own with no share token required
  (already true, spec 030); the home is the destination that makes token-less sign-up land
  somewhere real.
- **FR-009**: The feature MUST NOT change the canonical itinerary schema, any money path, or the
  supply-adapter boundary, and MUST NOT introduce a database migration.

### Key Entities *(include if feature involves data)*

- **None new.** The home reads the existing `TravelerIdentity` (name/email, spec 030) and
  `TravelerTripSummary[]` (spec 031) projections. No new table, no schema change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A traveler can go from a signed-out browser to a personalized home and open My Trips
  in at most two clicks after submitting the sign-up form (sign-up submit → home → My Trips).
- **SC-002**: The old static placeholder copy ("This is the traveler-facing view…") no longer
  appears for a signed-in traveler on `/view`.
- **SC-003**: 100% of the pinned INV-020/INV-024 negative assertions on anonymous `/view`
  (no platform branding in body or title, no workspace affordance) continue to pass, plus the same
  negatives now hold on the signed-in home.
- **SC-004**: A traveler session invoking any `workspace.*` procedure is rejected FORBIDDEN in the
  existing L3 suite (INV-023), with zero new server capability introduced.

## Assumptions

- The org-less traveler identity model (spec 030, #80) and the `clientView.me` / `clientView.myTrips`
  procedures (spec 030/031) are reused unchanged; no new server capability is added.
- "Plan a trip" (goal-consumer-planner) and "Discover / What's Hot" (goal-consumer-whats-hot) are
  separate, not-yet-built backlog tickets. This feature only signposts them as coming soon — wiring
  them to real routes is those tickets' scope, not this one.
- The already-in-flight `my-trips-empty-state-nav` slice owns the My-Trips empty-state copy and
  in-list back-navigation; this feature owns the post-auth **home** and links to My Trips. It does
  not restyle the My Trips list itself.
- No production deploy (GOAL: deploy paused). Full INV-027 live validation + UAT gate apply.
