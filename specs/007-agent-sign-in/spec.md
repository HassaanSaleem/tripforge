# Feature Specification: Agent Sign-In / Session-Establishment UI

**Feature Branch**: `kitchen/fix-seed-0008-sign-in-ui`

**Created**: 2026-07-09

**Status**: Draft

**Ticket**: seed-0008 (folds in triage IMP-2: human names on the workspace greeting)

**Input**: User description: "Sign-in / session-establishment UI for agent authentication. Better Auth is wired (email+password, organization plugin — agency = org) but there is no /sign-in page or any session-establishment surface, so no agent can authenticate through the browser. This blocks every live authenticated agent journey. Acceptance: (1) a /sign-in surface lets an agent authenticate in the browser, with sign-up (account + agency) for the P0 self-serve onboarding path, and the session carries the active agency context so agent-gated procedures pass; (2) after sign-in an agent-gated screen is reachable while anonymous/traveler visitors still receive UNAUTHORIZED/FORBIDDEN (INV-023) and the membership prompt (INV-024); (3) a live browser journey signs in and reaches the workspace against the built compose image (INV-027). Folded in: workspace greeting shows human names, not raw IDs (IMP-2); sign-out."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Returning agent signs in and reaches the workspace (Priority: P1)

A travel agent who already has an account and an agency membership opens the platform in a browser, goes to the sign-in page, enters their email and password, and lands in the agency workspace as a recognized agent. The workspace greets them by their name and their agency's name — not by internal identifiers — and agent-only capabilities now work for them.

**Why this priority**: This is the single blocking gap for the agent-side MVP: the entire authenticated product exists behind a door with no handle. Every live agent journey (planning, booking, marketplace) starts here.

**Independent Test**: Seed an account with an agency membership, open the sign-in page in a fresh browser session, sign in, and verify the workspace shows the agent's name/agency and that an agent-gated capability responds successfully.

**Acceptance Scenarios**:

1. **Given** a registered user with an agency membership and no active browser session, **When** they submit correct email + password on the sign-in page, **Then** they are taken to the agency workspace which greets them as a signed-in agent.
2. **Given** that signed-in agent, **When** the workspace loads, **Then** the greeting shows the user's display name, the agency's name, and their role — and never raw internal IDs.
3. **Given** that signed-in agent, **When** an agent-gated capability is invoked from their session, **Then** it succeeds and is scoped to their agency (INV-004/023).
4. **Given** a registered user, **When** they submit a wrong password, **Then** they stay on the sign-in page, see a clear human-readable error, and no session is established.

---

### User Story 2 - New agency owner signs up self-serve (Priority: P2)

A travel professional without an account opens the sign-up flow, provides their name, email, password, and an agency name, and ends up signed in as the owner of a freshly created agency, looking at the workspace. This is the P0 self-serve onboarding path (per the iteration-2 report: self-serve agency creation is the only P0 onboarding path today).

**Why this priority**: Without it, sign-in only works for accounts seeded by scripts — no real user can ever reach User Story 1 on their own. It also gives the live-verification and UAT gates a way to establish sessions without out-of-band database seeding.

**Independent Test**: From a clean browser, complete sign-up with a fresh email + agency name; verify arrival at the workspace as the new agency's owner.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor on the sign-up flow, **When** they submit name, email, password, and agency name, **Then** an account and an agency are created, the visitor is signed in, and the workspace greets them by name as the agency's owner.
2. **Given** a sign-up attempt with an email that already has an account, **When** submitted, **Then** a clear error is shown and no duplicate account is created.

---

### User Story 3 - Signing out ends the session (Priority: P3)

A signed-in agent chooses to sign out; the session ends, and the workspace reverts to the membership prompt for them until they sign in again.

**Why this priority**: Completes the session lifecycle so shared machines and role-switching tests are possible; small compared to establishment.

**Acceptance Scenarios**:

1. **Given** a signed-in agent in the workspace, **When** they sign out, **Then** they are returned to a public surface, and revisiting the workspace shows the sign-in prompt instead of the agent greeting.

---

### Edge Cases

- A signed-in user with NO agency membership (traveler) visits the workspace: they still see the membership prompt (INV-024) and agent-gated capabilities still refuse them (FORBIDDEN, INV-023). Sign-in must not weaken the ladder.
- An anonymous visitor invokes an agent-gated capability directly: still UNAUTHORIZED (INV-023) — unchanged.
- An already-signed-in agent visits the sign-in page: they can proceed to the workspace without re-entering credentials (no broken loop).
- Empty or malformed form input (missing email, short password): the form refuses with a clear message; no request storm, no session.
- A user belonging to an agency whose membership was created outside this flow (seeded/scripted): signing in still yields agent context — session establishment must work for memberships however they were created, with the user's single agency becoming the active one without a manual selection step (P0 single-agency assumption).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST provide a browser sign-in surface at a stable, linkable route where a registered user establishes a session with email + password.
- **FR-002**: After sign-in, a user with an agency membership MUST have their agency context active on the session — agent-gated capabilities pass without any additional manual "select agency" step (P0 single-agency assumption; INV-004 tenant scope).
- **FR-003**: The platform MUST provide a self-serve sign-up flow that creates the account AND the agency in one journey, leaving the new user signed in as that agency's owner.
- **FR-004**: Failed credential submission MUST leave the visitor without a session and show a clear human-readable error (no raw error codes/stack traces).
- **FR-005**: The authorization ladder MUST be unchanged: anonymous callers of agent-gated capabilities still receive UNAUTHORIZED; authenticated users without agency membership still receive FORBIDDEN (INV-023); the workspace surface still shows the membership prompt to non-agents (INV-024). No existing negative assertion may be weakened.
- **FR-006**: The workspace greeting MUST show the signed-in user's display name, agency name, and role in human-readable form and MUST NOT show raw internal identifiers (IMP-2).
- **FR-007**: A signed-in user MUST be able to sign out from the workspace surface; afterwards the session no longer grants agent (or authenticated) access.
- **FR-008**: Sign-in/sign-up/sign-out surfaces live on the platform-branded side of the house (workspace/root surfaces, INV-024); the white-labeled client view remains free of platform sign-in chrome and platform branding (INV-020 untouched).
- **FR-009**: The sign-in → workspace journey MUST be verifiable end-to-end in a real browser against the built compose stack (INV-027), with evidence archived.

### Key Entities

- **Session**: the browser-held proof of who the user is; may carry an active agency context (agent) or none (traveler).
- **Account (user)**: a person with email + password credentials and a display name.
- **Agency (organization)**: the tenant; a user's membership in it (owner/admin/member) is what makes them an agent (INV-023).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A registered agent can go from the sign-in page to a personalized workspace greeting in under 60 seconds, in a real browser against the built stack.
- **SC-002**: A brand-new visitor can complete self-serve sign-up (account + agency) and reach the workspace in under 2 minutes without any out-of-band steps.
- **SC-003**: 100% of agent-gated capabilities that refuse an anonymous/traveler caller before this feature still refuse them after it (no ladder regression).
- **SC-004**: The workspace greeting contains zero raw internal identifiers for signed-in agents (name + agency name + role only).
- **SC-005**: Wrong-password attempts never yield a session and always yield a visible, human-readable error.

## Assumptions

- **Email verification is NOT required to establish a session at P0** — this matches the platform's current behavior (iteration-2 report IMP-1: sign-up returns a live session immediately; accepted as the P0 onboarding path). Marketplace listing eligibility remains governed by the separate vetting gate (spec 006) and is NOT granted by mere sign-up.
- **Single-agency assumption (P0)**: users belong to at most one agency; the sign-in flow activates that one membership automatically. Multi-agency selection UI is out of scope until a real multi-membership need appears.
- **Password reset / email change are out of scope** for this ticket (no such backlog demand yet; the credential store supports adding them later).
- **Inviting members to an existing agency is out of scope** (a later agency-admin surface, seed-0009 territory); sign-up creates a NEW agency.
- The existing authentication backend (credential + organization support) is reused as-is; this feature adds the missing browser surface, not a new auth system.
- No money paths, no canonical itinerary schema changes, no supplier surfaces are touched.
