# Quickstart: Media library real file upload

## Prerequisites

- Built compose stack running (`docker compose up --build --wait`), same as
  every other Live Test cycle.
- A signed-in agent session (agency workspace).

## Validate the upload path (User Story 1)

1. Open the workspace media library panel.
2. Use the new file-picker upload control (alongside the existing
   URL-registration form) to pick a local JPEG/PNG image, fill in alt text,
   and submit.
3. **Expected**: the new asset appears in the library list immediately, its
   preview renders the picked image (no URL was ever typed).
4. Repeat with a file over 3 MB. **Expected**: refused with a specific
   "file too large" message, no new library entry appears.
5. Repeat with a non-image file. **Expected**: refused before submission
   completes (file-picker `accept` filter, reinforced server-side).

## Validate attach/render parity (User Story 2)

1. Attach the uploaded asset from Step 2 above to an itinerary's gallery,
   using the existing attach picker — unmodified.
2. **Expected**: it renders in the workspace itinerary preview exactly like
   a URL-registered photo.
3. Detach it. **Expected**: it remains in the library (detach never
   deletes), matching existing behavior.

## Validate the public client-view (User Story 3)

1. With the uploaded asset still attached, open the itinerary's public share
   link (`/view/{token}`) in a signed-out browser context (private window).
2. **Expected**: the photo renders in the client-facing gallery.
3. Inspect the page's network requests / HTML: confirm the image request
   goes to `/api/media/{id}` and that no `agencyId`, media asset internal
   id beyond the URL path, or `attribution` string appears in the rendered
   page (same allowlist assertion style as the existing client-view e2e
   specs from spec 015).

## Cross-tenant negative check

1. As a second agency, note the first agency's uploaded asset's serving URL
   (`/api/media/{id}`) from Step 3 above.
2. Fetch it directly with no session (e.g. `curl`). **Expected**: `200` with
   the same bytes — this route is intentionally public (unguessable-id
   grant, see research D3), matching the client-view share-link model. What
   MUST NOT be possible: discovering the id without already having it (no
   listing/enumeration endpoint exposes another agency's asset ids).

Reference: full request/response shapes in
[`contracts/media-upload.md`](contracts/media-upload.md); storage layout in
[`data-model.md`](data-model.md).
