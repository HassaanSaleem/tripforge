# Feature Specification: Self-drive vs. request-an-agent fork on the client trip view

**Feature Branch**: `022-request-agent-fork`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "OPERATOR must-have: 'Clients should be able to request agents to host/arrange their itinerary for them if not available.' PRD §9.5 fork: self-drive (traveler books the assembled cart) vs request-agent (hand the plan to a marketplace agent who refines/executes; platform earns take-rate) — this keeps the consumer surface feeding the B2B marketplace. Nothing like it exists today (no consumer surface / handoff). BUILD a lightweight fork on the client-facing trip view (/view/[token]): two clear paths — 'Book it myself' (self-drive, links into the existing booking flow / or a request-quote) and 'Have an agent arrange this for me' (request-agent). The request-agent path captures the client's contact + notes and creates a handoff/request record visible to the agent (a simple agent-side 'Trip requests' inbox with status: new/accepted). Keep it demo-simple (no full consumer auth): the value is showing the fork + the agent receiving the request. INVARIANTS: tenant scoping (INV-004) — requests route to the owning agency; provenance/client-ownership respected. ACCEPTANCE: on a shared client trip, the client can choose self-drive or request-an-agent; a request appears in the agent's inbox. PRD refs: §9.5 agent-vs-self-drive fork, Pillar 4. Ticket: demo-09-request-agent"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client asks an agent to arrange the trip (Priority: P1)

A traveler viewing their shared trip (`/view/[token]`) decides they'd rather have a human agent take it from here. They choose "Have an agent arrange this for me," leave their name, optional email, and a short note, and submit. This creates a handoff record tied to the trip and its owning agency.

**Why this priority**: This is the entire point of the feature — it is the mechanism that routes consumer-surface demand into the B2B marketplace (Constitution I). Without it, the fork is cosmetic.

**Independent Test**: On a shared trip view, choose "Have an agent arrange this for me," submit a name and a note, and verify a trip request record now exists, associated with the correct owning agency, in `new` status.

**Acceptance Scenarios**:

1. **Given** a valid shared-trip link, **When** the traveler selects "Have an agent arrange this for me" and submits a name and a note, **Then** a trip request is created with `status = new`, linked to the itinerary and its owning agency.
2. **Given** the same shared-trip link, **When** the traveler submits the form without an email, **Then** the request is still created successfully (email is optional).
3. **Given** the same shared-trip link, **When** the traveler submits the form without a name, **Then** the submission is rejected with a validation message (name is required so the agent has someone to contact).
4. **Given** an invalid or unknown share token, **When** a request submission is attempted, **Then** it is refused and no record is created — identical to how the existing view page treats an invalid token.

---

### User Story 2 - Agent sees and accepts the request (Priority: P2)

An agent opens their workspace and sees a "Trip requests" inbox listing every incoming request for trips their agency owns — who asked, their note, which trip, and whether it's still new or already accepted. The agent marks a request "Accepted" once they've started working it.

**Why this priority**: Depends on User Story 1 producing a record, but is independently valuable and testable once a request exists (it can be seeded directly for testing purposes). This is the side of the handoff that actually lets the agent act.

**Independent Test**: Seed one trip request for an agency, sign in as that agency's agent, open the "Trip requests" inbox, confirm the request is visible with its contact/notes/trip, click Accept, and confirm its status becomes `accepted`.

**Acceptance Scenarios**:

1. **Given** a trip request exists for the signed-in agent's own agency, **When** the agent opens the "Trip requests" inbox, **Then** the request appears with the traveler's name, optional email, note, linked trip title, and status `new`.
2. **Given** a `new` trip request in the inbox, **When** the agent clicks Accept, **Then** its status becomes `accepted` and stays that way on reload.
3. **Given** a trip request belonging to a DIFFERENT agency, **When** any other agent opens their own "Trip requests" inbox, **Then** that request never appears (tenant scoping, INV-004).
4. **Given** no trip requests exist yet for an agency, **When** the agent opens the inbox, **Then** they see a clear empty state, not an error.

---

### User Story 3 - Client chooses to book it themselves (Priority: P3)

A traveler who's comfortable proceeding on their own selects "Book it myself" and sees a clear acknowledgement of that choice, distinct from the request-an-agent path.

**Why this priority**: Completes the fork visually and narratively, but carries no new backend capability at this scope — full self-serve booking is a later-roadmap (P2) capability, so this path is a lightweight, honest stub rather than a real checkout.

**Independent Test**: On a shared trip view, select "Book it myself" and confirm a clear confirmation/next-step message appears, with no dead links or errors, and that no trip request record is created for this path.

**Acceptance Scenarios**:

1. **Given** a valid shared-trip link, **When** the traveler selects "Book it myself," **Then** they see a confirmation message acknowledging their choice, with no broken navigation.
2. **Given** the same interaction, **When** checked against the database, **Then** no trip request record was created (this path is distinct from the request-agent path and does not enter the agent's inbox).

---

### Edge Cases

- What happens when the same traveler submits the request-agent form twice on the same trip (e.g., after adding more notes)? Each submission creates its own distinct trip request — no deduplication in this scope; the agent sees both.
- What happens if an agent clicks Accept on an already-accepted request? No-op — the request stays `accepted` (idempotent).
- What happens when the itinerary underlying a trip request is a licensed/white-labeled copy, not the original? The request routes to the copy's OWNING agency (the reseller currently holding that copy), never to the original author — consistent with how ownership, not authorship, drives visibility elsewhere in the product.
- What happens on an expired/unknown share token? Both fork choices are unavailable — the page shows the same not-found state the view page already shows today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The client-facing trip view MUST present two clearly distinguished choices: "Book it myself" and "Have an agent arrange this for me."
- **FR-002**: Selecting "Have an agent arrange this for me" MUST present a form capturing a contact name (required), an email (optional), and a note (optional).
- **FR-003**: Submitting the request-agent form MUST create a trip request record with status `new`, associated with the itinerary and the agency that currently owns it.
- **FR-004**: The system MUST reject a request-agent submission that omits the contact name, with a clear validation message, and MUST NOT create a record for it.
- **FR-005**: Selecting "Book it myself" MUST show a confirmation of that choice and MUST NOT create a trip request record.
- **FR-006**: The agent workspace MUST provide a "Trip requests" inbox listing every trip request belonging to the signed-in agent's own agency, showing the traveler's name, optional email, note, the linked trip, and current status.
- **FR-007**: The agent workspace MUST NEVER show a trip request belonging to a different agency (tenant scoping, INV-004), enforced server-side regardless of client input.
- **FR-008**: An agent MUST be able to change a trip request's status from `new` to `accepted`; re-accepting an already-`accepted` request MUST be a no-op, not an error.
- **FR-009**: The client-facing fork UI MUST carry zero platform branding (INV-020) and MUST NOT expose any agent-only data (net rate, markup, other travelers' requests, or the identity of other agencies).
- **FR-010**: Both fork choices MUST validate the share token exactly as the existing view page does, refusing the interaction on an invalid or unknown token.
- **FR-011**: A trip request's owning agency MUST be the itinerary's CURRENT owner at submission time (the licensed/white-labeled copy's own agency when the shared trip is a resold copy), never the original author.

### Key Entities

- **Trip Request**: Represents a traveler's ask for an agent to take over arranging their trip. Attributes: the linked itinerary, the owning agency (who will see it in their inbox), the traveler's contact name, optional email, an optional note, a status (`new` or `accepted`), and when it was created. Exists only for the request-an-agent path — "Book it myself" produces no such record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A traveler can go from viewing their shared trip to a submitted agent-request in under 30 seconds, filling in only a name and an optional note.
- **SC-002**: 100% of trip requests are visible only in their owning agency's inbox; 0% are ever visible to any other agency.
- **SC-003**: An agent can move a request from "new" to "accepted" in a single click from the inbox, with no page reload required to see the updated status.
- **SC-004**: Choosing either fork path always ends in a clear, non-dead-end acknowledgement — no blank pages, broken links, or unhandled errors on either path.

## Assumptions

- No anonymous consumer authentication is introduced by this feature — both fork choices work purely off the existing share-token trust boundary, matching the ticket's explicit "no full consumer auth" scope.
  > **Amended by spec 030 (2026-07-15, p2-consumer-accounts-identity):** consumer
  > authentication is introduced, but strictly as an *optional* layer — both fork choices
  > continue to work purely off the share-token trust boundary for anyone who does not sign
  > in, unchanged. Signing in only pre-fills the request-an-agent form's contact fields from
  > the account; it grants no new capability and is never required to use either fork. See
  > `specs/030-traveler-client-accounts/spec.md`.
- "Book it myself" is a confirmation-only stub in this scope, not a real self-serve checkout: there is no existing anonymous booking capability to link into today, and full self-serve consumer booking is an explicit later-roadmap (P2) item. This reading matches the ticket's own wording ("links into the existing booking flow / or a request-quote") and its "demo-simple" instruction.
- Contact name is required so an agent always has someone to reach; email is optional since a note may reference another contact channel.
- No outbound notification (email/SMS) to the agent is included in this scope — the inbox itself is the delivery mechanism, consistent with "demo-simple."
- This feature is the specific mechanism Constitution I names as keeping "the consumer surface feeding the marketplace" — it is scoped as the P0 carve-out the ticket describes, not the broader P2 consumer-planner surface.
