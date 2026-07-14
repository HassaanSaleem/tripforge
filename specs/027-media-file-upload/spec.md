# Feature Specification: Media library real file upload

**Feature Branch**: `kitchen/fix-seed-0022a-media-upload`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Real binary file upload for the content library (seed-0022a, follow-up to spec 015). Today workspace.media.register only accepts a caller-supplied URL — an agent with a photo on their own device has no way to add it unless they already host it somewhere external first. Add a genuine 'upload a file from your device' path so agent-upload and traveler-ugc media sources support real binary upload, not just URL registration. Scope: (1) a new MediaStorePort method that accepts raw file bytes plus kind/alt/attribution/source, stores the bytes in a new Postgres-backed derived table/column, and returns a MediaAsset whose url is an internal servable path; (2) a route that streams the stored bytes back by the asset's random UUID so the returned url actually renders in an <img> tag both in the agency workspace and in the public client-view share link; (3) a tenant-scoped workspace.media upload procedure (image kinds only for v0, reasonable size cap) alongside the existing register procedure; (4) wire the workspace media-library-panel with a real file-picker upload control alongside the existing URL-registration form. Out of scope: S3/CDN-class external object storage (a second datastore needing an ADR + operator gate), video/embed upload, and any canonical itinerary schema change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload a photo straight from my device (Priority: P1)

An agent building a client itinerary has a photo saved locally (e.g., a picture they took at a property, or a client-provided image) and wants to add it to the itinerary's media library without first uploading it to some external image host and pasting a URL.

**Why this priority**: This is the entire reason the ticket exists — seed-0022 (v0) shipped URL-registration only, and the recorded follow-up explicitly says agents "cannot actually upload a local file." Without this, the agent-upload/traveler-ugc sources are honest labels but not actually usable end-to-end for the most common real case (a photo taken on a phone or downloaded from a client email).

**Independent Test**: Sign in as an agent, open the media library panel, pick a local image file via a file input, submit — the asset appears in the library list with a working preview, with no URL ever typed in.

**Acceptance Scenarios**:

1. **Given** an agent on the media library panel, **When** they choose a local image file (JPEG/PNG/WebP) and submit the upload form with alt text, **Then** a new media asset appears in their library, its preview renders the uploaded image, and no external URL was required.
2. **Given** an agent uploads a file larger than the configured size cap (3 MB), **When** they submit, **Then** the upload is refused with a clear, specific error and no partial/corrupt asset is created.
3. **Given** an agent selects a non-image file (e.g., a `.pdf` or `.zip`), **When** they submit, **Then** the upload is refused before any bytes are persisted.

---

### User Story 2 - Uploaded photos attach to the itinerary exactly like registered ones (Priority: P1)

Once uploaded, a media asset must behave identically to a URL-registered asset everywhere it is already used: attachable to the itinerary gallery and to individual items, and visible to the agent in the workspace preview.

**Why this priority**: Upload is worthless if the resulting asset can't flow through the existing attach/detach and gallery rendering paths that seed-0022 already built — this story is what makes upload a real alternative input method rather than a second, incompatible system.

**Independent Test**: Upload an image, attach it to an itinerary's gallery from the existing attach picker, and confirm it renders in the workspace itinerary preview — using only the existing attach/detach UI, unmodified.

**Acceptance Scenarios**:

1. **Given** an uploaded media asset in the agent's library, **When** the agent attaches it to an itinerary's gallery (existing attach flow), **Then** it appears in the itinerary's gallery exactly as a URL-registered asset would.
2. **Given** an uploaded media asset attached to an itinerary, **When** the agent detaches it, **Then** the underlying asset remains in the library (detach never deletes), matching the existing URL-registered-asset behavior.

---

### User Story 3 - Uploaded photos render for the client, without leaking internal detail (Priority: P2)

A client viewing their branded, white-labeled itinerary via a public share link sees uploaded photos rendered normally, with the same trust-boundary guarantees as URL-registered media (no internal ids, no indication of which storage path served the bytes).

**Why this priority**: The client-view share link is the other place media already renders (seed-0022); an uploaded asset that only works in the workspace but breaks or leaks detail on the public view would be a regression of the existing trust boundary, not just an incomplete feature.

**Independent Test**: Attach an uploaded asset to an itinerary, open its public share link in a signed-out browser context, and confirm the photo renders with only allow-listed fields.

**Acceptance Scenarios**:

1. **Given** an uploaded photo attached to an itinerary's gallery, **When** a client opens the itinerary's public share link, **Then** the photo renders in the client-facing gallery.
2. **Given** the same public share link, **When** its HTML/network payload is inspected, **Then** no internal media-asset id, agency id, or storage-implementation detail is present beyond what the existing URL-registered path already exposes.

### Edge Cases

- What happens when an upload is interrupted mid-transfer (network drop)? The system MUST NOT create a partial/corrupt asset — either the full file is stored and a complete asset is created, or nothing is created.
- What happens when two agents in different agencies each upload a file with the same original filename? Each becomes its own independent asset scoped to its own agency; filenames never collide because assets are addressed by their own generated identifier, not by filename.
- What happens when an agent tries to fetch another agency's uploaded asset's serving URL directly? It must not reveal that asset's bytes (assets are addressed by an unguessable random identifier, and cross-tenant enumeration is not feasible in practice).
- What happens when the uploaded image is fetched by the serving route many times (e.g., a popular gallery photo)? It must consistently return the same bytes with a content type matching the original upload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an agent upload an image file from their local device as a new media asset, without requiring any externally-hosted URL.
- **FR-002**: The system MUST persist uploaded file bytes so they survive independently of the browser session that uploaded them (durable server-side storage).
- **FR-003**: The system MUST reject uploads whose content type is not an image type (JPEG, PNG, WebP, GIF) before persisting any bytes.
- **FR-004**: The system MUST reject uploads larger than a fixed size cap (3 MB) with a specific, distinguishable error, before persisting any bytes.
- **FR-005**: The system MUST scope every uploaded asset to the uploading agent's agency, identical to the existing URL-registration path — no upload is ever visible to another agency's library listing.
- **FR-006**: The system MUST produce, for every successful upload, a media asset that is indistinguishable in shape from a URL-registered asset to every existing consumer (attach/detach mutations, gallery rendering, client-view projection).
- **FR-007**: The system MUST serve an uploaded asset's bytes back at a stable URL that renders directly in an `<img>` element, in both the authenticated workspace and the public (signed-out) client-view share link.
- **FR-008**: The system MUST address each uploaded asset's serving URL by an unguessable, per-asset random identifier — never by a sequential id, filename, or agency-derived value.
- **FR-009**: The system MUST NOT expose any uploaded asset's internal storage identifier, agency id, or upload metadata beyond what the existing client-view allow-list already exposes for URL-registered media.
- **FR-010**: The system MUST let the agent attach/detach an uploaded asset to an itinerary's gallery or individual items using the exact same mutations already used for URL-registered assets (no parallel attach path).
- **FR-011**: The workspace media library panel MUST offer a file-picker upload control alongside (not replacing) the existing URL-registration form.

### Key Entities

- **Media asset** (existing, extended): the agency-owned media library row (seed-0022). Gains the ability to be backed by uploaded bytes rather than only an external URL, while keeping the exact same public shape (id, source, kind, url, alt, attribution) that every existing consumer already depends on.
- **Uploaded file bytes**: the durable, server-stored binary content of an uploaded image, associated one-to-one with a media asset, never exposed directly — only ever reached through the asset's stable serving URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can go from "photo on their device" to "photo visible in the media library" in a single upload action, with zero external hosting steps.
- **SC-002**: 100% of uploaded assets attach to an itinerary gallery/item and render in both the workspace and the public client-view share link, using the existing attach/detach and gallery UI unmodified.
- **SC-003**: 0 uploaded-asset bytes are ever reachable across an agency boundary, and 0 internal identifiers beyond the existing allow-listed fields are observable from the public client-view.
- **SC-004**: 100% of oversized or non-image upload attempts are refused before any bytes are persisted, with a specific reason surfaced to the agent.

## Assumptions

- Image kinds only for v0 (JPEG, PNG, WebP, GIF); video/embed upload stays out of scope, matching spec 015's existing kind-scoping decision.
- A 3 MB per-file size cap is a reasonable default for agency-uploaded travel photography (base64-over-tRPC transport plus the P0 Vercel serverless deploy target's request-body limits, ADR-0004, make a conservative cap the safer default; this is a configurable constant, not a hard product requirement). Agents with larger source files (e.g. uncompressed DSLR photos) are expected to use their device's normal photo-sharing compression, matching how virtually every consumer upload surface behaves.
- Uploaded bytes are stored in the existing Postgres system of record (a new derived-table column), not a third-party object store — introducing external object storage is a distinct, larger architectural decision (a second datastore) that requires its own ADR and operator gate, and is explicitly deferred.
- The existing `MediaRef` canonical schema (storageKey/url, v0.1.0) already accommodates this without any version bump — confirmed by the ticket and by `packages/itinerary-schema/src/media.ts`.
- The existing client-view trust-boundary projection (from spec 015) is reused unmodified; this feature does not change what fields are allow-listed, only adds a second way to produce a valid asset.
