# Feature Specification: Content Library v0

**Feature Branch**: `015-content-library-v0`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Content library v0 (seed-0022): Give agents a licensed media library and let them attach images to itineraries so client-facing proposals are no longer text-only. Scope: (1) a media storage port + tenant-scoped derived table for media asset metadata; (2) an agency media library API to register (agent-upload or licensed-stock), list, and get media, enforcing the closed MediaSource enum; (3) attach/detach mutations wiring MediaRefs onto the itinerary gallery and individual items, round-tripping through the existing canonical schema (no version bump — MediaRef already exists at v0.1.0); (4) a deliberate, reviewed amendment to the client-view trust-boundary allowlist (spec 010 FR-007) projecting only alt text, kind, and a servable reference — never internal ids or source-of-record detail; (5) rendering to the premium design kit: a workspace library panel and a client /view gallery. Out of scope: marketplace listing-card imagery (gated on seed-0023's media-rights decision), a real binary upload/object-storage pipeline (v0 registers a URL + metadata), and full video/embed player UX (image is the primary kind for v0)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a licensed media library (Priority: P1)

An agent wants to add real, licensed photos to their itineraries. They open a
media library in their workspace, register a photo by providing a source
(their own upload or a licensed-stock reference), a URL, and descriptive alt
text, and see it appear in their library list, ready to use on any of their
itineraries.

**Why this priority**: Without a library there is nothing to attach — this is
the foundation every other story depends on, and it alone proves the storage
port, tenant scoping, and the closed-source-enum boundary all work.

**Independent Test**: Can be fully tested by registering two media items
(one `agent-upload`, one `licensed-stock`) as one agency, confirming both
appear in that agency's library list, and confirming a second agency's
library list shows neither.

**Acceptance Scenarios**:

1. **Given** an agent is signed in, **When** they register a new media item
   with a valid source, URL, and alt text, **Then** it appears in their
   agency's media library list with the details they provided.
2. **Given** an agent tries to register a media item with a source outside
   the closed set (licensed-stock, official-embed, agent-upload,
   traveler-ugc), **When** they submit it, **Then** the system refuses the
   request with a clear, typed reason and nothing is stored.
3. **Given** two different agencies each have media in their library,
   **When** one agency lists their library, **Then** they see only their own
   media — never the other agency's.

---

### User Story 2 - Attach media to an itinerary (Priority: P1)

An agent building or editing an itinerary wants to add a cover photo to the
overall trip and photos to specific days or items (a hotel, an activity).
They pick items from their media library and attach them; removing an
attachment is just as easy.

**Why this priority**: This is the connective step between "I have a photo
library" and "my proposal has photos" — without it the library is inert.

**Independent Test**: Can be fully tested by attaching one media item to an
itinerary's gallery and one to a specific item, reloading the itinerary, and
confirming both attachments persisted; then detaching one and confirming it
is gone on reload.

**Acceptance Scenarios**:

1. **Given** an agent has a media item in their library and an itinerary they
   own, **When** they attach the media item to the itinerary's gallery,
   **Then** reloading the itinerary shows the media item in its gallery.
2. **Given** an itinerary has a stay, activity, or transfer item, **When** the
   agent attaches a media item to that specific item, **Then** reloading the
   itinerary shows the media item attached to that item only.
3. **Given** an itinerary has an attached media item, **When** the agent
   detaches it, **Then** reloading the itinerary no longer shows that
   attachment, on either the gallery or the item.
4. **Given** an itinerary belongs to a different agency, **When** an agent
   attempts to attach or detach media on it, **Then** the system refuses the
   request and no attachment changes.

---

### User Story 3 - Client sees a real proposal, not a wall of text (Priority: P2)

A client receives a shared link to their branded itinerary and sees photos
of their trip — a cover gallery and photos on the places and experiences
they're booking — instead of a text-only page.

**Why this priority**: This is the payoff the whole feature exists for (a
sell-grade, picture-led proposal) but it depends on Stories 1 and 2 already
working, and it is the most trust-sensitive step because it deliberately
widens what crosses the agent/client trust boundary.

**Independent Test**: Can be fully tested by attaching media to an itinerary,
sharing it, opening the client `/view` link, and confirming the gallery and
per-item photos render with their alt text — while confirming no internal
identifiers, source labels, or agent-only detail appear anywhere in the page.

**Acceptance Scenarios**:

1. **Given** an itinerary with gallery and per-item media is shared,
   **When** a client opens the share link, **Then** the page renders the
   gallery images and each item's photos with their alt text.
2. **Given** an itinerary has no attached media, **When** a client opens the
   share link, **Then** the page renders exactly as it does today (text-only,
   no broken image placeholders).
3. **Given** a media item carries internal library metadata (its library id,
   the registering agent, attribution beyond what is meant for the client),
   **When** it is rendered on the client view, **Then** none of that internal
   detail appears anywhere in the page source or visible content.

---

### Edge Cases

- Registering a media item with a source claimed as `licensed-stock` or
  `agent-upload` is a metadata/URL registration in v0 — the system does not
  verify licensing truthfulness (out of scope; see Assumptions), but it does
  enforce the closed set of source values so an unlisted source (e.g. a
  scraped or AI-generated label) can never be recorded.
- An itinerary item or gallery can end up with zero media (the common case
  today) — nothing MUST render as broken or placeholder imagery on either the
  workspace or client view.
- Detaching a media item from an itinerary MUST NOT delete it from the
  agency's library — it remains available to attach elsewhere.
- A `video` or `embed` kind media item MUST be attachable and MUST render
  *something* representative on the client view (e.g. a link or thumbnail),
  but does not need a full player experience in v0.
- Cross-tenant safety: an agency must never be able to read, attach, or
  detach another agency's media, and a client share link must never expose
  which agency registered a given media item beyond the agency's own public
  brand name (already shown today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an authenticated agent register a media
  item to their own agency's library with a source (one of the closed set:
  `licensed-stock`, `official-embed`, `agent-upload`, `traveler-ugc`), a kind
  (`image`, `video`, or `embed`), a URL, and alt text.
- **FR-002**: The system MUST refuse registration of a media item whose
  source is outside the closed set, with a typed, clear reason, and MUST NOT
  persist anything from a refused request.
- **FR-003**: The system MUST let an agent list their own agency's media
  library and MUST NOT include any other agency's media in that list.
- **FR-004**: The system MUST let an agent attach a registered media item to
  an itinerary's overall gallery and MUST let them attach a media item to a
  specific stay, activity, or transfer item within an itinerary they own.
- **FR-005**: The system MUST let an agent detach a previously attached media
  item from the gallery or from a specific item, without deleting the media
  item from the library.
- **FR-006**: Attach and detach operations MUST only succeed for itineraries
  and media belonging to the acting agent's own agency; a cross-agency
  attempt MUST be refused and MUST NOT change any state.
- **FR-007**: Attached media MUST persist and round-trip through the existing
  itinerary read path exactly as attached (gallery membership, per-item
  membership, and each media item's alt text and kind).
- **FR-008**: This feature MUST NOT require a canonical itinerary schema
  version change — it uses the existing media model already present in the
  schema.
- **FR-009**: The client-facing shared view MUST render an itinerary's
  gallery and per-item media (image kind at minimum; video/embed kinds MUST
  render at least a representative link or thumbnail) when present, and MUST
  render exactly as it does today when no media is attached.
- **FR-010**: The client-facing shared view MUST project only the fields a
  client is meant to see for each media item (a servable reference, its kind,
  and its alt text) and MUST NOT expose internal library identifiers, which
  agent registered it, or any other agent-only metadata.
- **FR-011**: The workspace itinerary editor MUST provide a way for an agent
  to browse their media library and attach/detach items to the gallery and to
  individual itinerary items, matching the product's existing premium visual
  standard.
- **FR-012**: This feature MUST NOT render media on marketplace listing
  cards; that surface is explicitly deferred to a separate, dependent
  decision.

### Key Entities

- **Media asset**: An agency-owned library entry — a source (from the closed
  set), kind, a servable reference (URL), alt text, and optional attribution.
  Owned by exactly one agency; independent of any itinerary until attached.
- **Media attachment**: A reference from an itinerary's gallery or from a
  specific itinerary item to a media asset. Many itineraries/items may
  reference the same media asset; detaching an attachment does not affect the
  underlying media asset or its other attachments.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can register a media item and see it available to
  attach to any of their itineraries within the same workspace session, with
  no page reload required to see a newly registered item.
- **SC-002**: An agent can go from an itinerary with zero photos to a shared
  client proposal showing a cover gallery and at least one per-item photo in
  under five interactions (register or pick media, attach, share).
- **SC-003**: In a test where one agency registers media and a second agency
  attempts to list, attach, or detach it, 100% of those cross-agency attempts
  are refused with zero data exposure.
- **SC-004**: In a test of the client shared view with attached media, zero
  internal identifiers or agent-only metadata appear anywhere in the
  rendered page or page source.
- **SC-005**: An itinerary with no attached media renders identically on the
  client view before and after this feature ships (no visual regression, no
  broken placeholders).

## Assumptions

- v0 registers media by URL + metadata (a "bring your own link" model); a
  real binary upload/object-storage pipeline (file picker uploading bytes to
  managed storage) is a follow-up and out of scope here — "register" and
  "upload" are used interchangeably in this spec to mean creating a library
  entry, not necessarily transferring binary bytes through the platform.
- The system does not verify that a claimed source label (e.g.
  `licensed-stock`) is truthful — it enforces the closed set of allowed
  values, matching the existing trust model where source is a declared,
  auditable field, not a verified one (consistent with how other declared
  fields work elsewhere in the product today).
- Marketplace listing-card imagery is out of scope pending a separate
  media-rights-on-resale decision (tracked separately); this feature does not
  change what marketplace listing cards display.
- Video/embed kinds are attachable in v0 but do not require full inline
  playback — a representative link or thumbnail satisfies this spec.
- This feature reuses the existing tenant-scoping guarantees already proven
  for workspace and itinerary surfaces; it does not introduce a new
  authorization mechanism.
