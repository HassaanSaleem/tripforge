# Feature Specification: Agency Member Roster

**Feature Branch**: `025-agency-member-roster`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Agency-admin surface consuming agencyAdminProcedure (member management). Ticket: seed-0009. Add a real agency-admin operation that consumes agencyAdminProcedure: a member roster query that returns the agency's members (name, email, role, joined date) to owner/admin callers only. Member and traveler callers are FORBIDDEN; anonymous callers are UNAUTHORIZED. The query must be tenant-scoped (INV-004): agency A must never see agency B's members. Billing admin and markup-policy admin are out of scope. Read-only roster (list only) — no invite/remove/role-change mutations in this iteration. No UI page required — API-only surface."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner/admin views the agency member roster (Priority: P1)

An agency owner (or an admin they've delegated to) wants to see who belongs to their agency — every teammate's name, email, and role, and when each joined — so they know who currently has access to the workspace.

**Why this priority**: This is the entire feature. Without it, the owner/admin authorization tier that already exists in the platform (agencyAdminProcedure) has no real operation to protect, and there's no way for anyone to answer "who's on my team?" short of a database query.

**Independent Test**: Can be fully tested by an owner (or admin) calling the roster operation on their own agency and verifying it returns every current member with correct name, email, role, and join date — delivers value on its own with no dependency on other stories.

**Acceptance Scenarios**:

1. **Given** an agency with three members (one owner, one admin, one member), **When** the owner requests the roster, **Then** all three members are returned with their correct name, email, role, and join date.
2. **Given** the same agency, **When** the admin requests the roster, **Then** the same full roster is returned (admin has equal read access to owner for this operation).
3. **Given** a brand-new agency with only its founding owner, **When** the owner requests the roster, **Then** exactly one member (themselves) is returned.

---

### User Story 2 - Non-admin callers are denied (Priority: P2)

A regular team member (not owner/admin), a traveler with no agency membership, or an unauthenticated caller must not be able to see the agency's member roster — membership/role data is administrative information, not something every teammate needs read access to.

**Why this priority**: Security boundary — without this, the "owner/admin only" claim of the feature is unenforced and the roster leaks internal agency composition to anyone with a session (or no session).

**Independent Test**: Can be fully tested by calling the roster operation as a plain member, as a traveler (no agency), and as an anonymous caller, and verifying each is rejected with the correct error before any roster data is returned.

**Acceptance Scenarios**:

1. **Given** an agency with a member-role teammate, **When** that teammate requests the roster, **Then** the request is rejected (forbidden) and no roster data is returned.
2. **Given** a traveler account with no agency membership, **When** they request the roster, **Then** the request is rejected (forbidden) and no roster data is returned.
3. **Given** no authenticated session at all, **When** the roster is requested, **Then** the request is rejected (unauthorized) and no roster data is returned.

---

### User Story 3 - Roster is strictly scoped to the caller's own agency (Priority: P1)

An owner at Agency A must never see member data belonging to Agency B, even though both agencies exist in the same platform — this is a multi-tenant trust boundary, not just a nice-to-have.

**Why this priority**: A cross-tenant data leak here is a trust/privacy violation (INV-004) — every other tenant-scoped surface in the platform treats this as non-negotiable, and the roster is no different since it exposes teammate names and emails.

**Independent Test**: Can be fully tested by creating two agencies with distinct members and confirming each agency's owner sees only their own agency's roster, never the other's.

**Acceptance Scenarios**:

1. **Given** Agency A and Agency B each with their own members, **When** Agency A's owner requests the roster, **Then** only Agency A's members appear — none of Agency B's.
2. **Given** the same setup, **When** Agency B's owner requests the roster, **Then** only Agency B's members appear — none of Agency A's.

---

### Edge Cases

- What happens when an agency has zero members somehow (should not occur in practice, since every agency has a founding owner)? The roster returns an empty list rather than erroring.
- How does the system handle a very large agency (many members)? The roster returns the full set; pagination is out of scope for this iteration (agencies are small at P0 scale).
- What happens if two members share the same display name? Each is still distinguished by their own identity/email — the roster does not deduplicate or merge same-named entries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an operation that returns the full member roster (name, email, role, join date) for the caller's own agency.
- **FR-002**: System MUST restrict the roster operation to callers with an owner or admin role in the agency (the existing owner/admin authorization tier).
- **FR-003**: System MUST reject a caller with a plain member role with a "forbidden" outcome and no roster data.
- **FR-004**: System MUST reject a caller with no agency membership (e.g., a traveler) with a "forbidden" outcome and no roster data.
- **FR-005**: System MUST reject a caller with no authenticated session at all with an "unauthorized" outcome and no roster data.
- **FR-006**: System MUST scope the roster strictly to the caller's own agency — members of any other agency MUST NOT appear, under any circumstance.
- **FR-007**: System MUST NOT provide invite, remove, or role-change mutations as part of this feature — the roster is read-only in this iteration.
- **FR-008**: System MUST NOT expose billing information or markup-policy administration as part of this feature — those remain out of scope (billing has no data model yet; markup policy is a separate, already-tracked effort).

### Key Entities

- **Agency Member**: A person's membership in one agency — carries the person's name, email, their role within that agency (owner, admin, or member), and when they joined. Exists only in the context of a single agency (no cross-agency membership in this model).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agency owner or admin can retrieve their agency's complete, correct member roster (name, email, role, join date for every member) in a single request.
- **SC-002**: 100% of roster requests from non-owner/admin callers (plain member, traveler, anonymous) are denied — zero roster data is ever returned to an unauthorized caller.
- **SC-003**: 100% of roster requests return only the requesting caller's own agency's members — zero cross-agency data leakage across any number of agencies in the system.

## Assumptions

- The existing owner/admin/member role tiers (already defined in the platform's agency authorization model) are sufficient for this feature — no new roles are introduced.
- "Joined date" is the date the membership record was created, not a separately tracked "invitation accepted" timestamp.
- Agencies at this stage of the product are small enough (per the platform's P0 single-agency-per-user scale) that returning the full roster in one response, with no pagination, is acceptable.
- A UI page for browsing the roster is explicitly out of scope for this iteration — this feature ships as an API-level operation only, consistent with the ticket's own scope note; a future iteration may add a UI.
- Billing-related member information (e.g., seat cost, payment role) does not exist as a concept yet and is not part of this roster.
