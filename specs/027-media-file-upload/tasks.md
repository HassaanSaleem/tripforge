# Tasks: Media library real file upload

**Input**: Design documents from `/specs/027-media-file-upload/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/media-upload.md, quickstart.md

**Tests**: Included — this feature touches an integration point (new tRPC mutation, new DB columns, new public route), so per `.kitchenloop/unbeatable-tests.md` an L3 integration test is mandatory in addition to L1/L2.

**Organization**: Tasks are grouped by user story (US1/US2/US3, from spec.md) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm the pnpm workspace resolves (no new package needed — this feature extends existing `packages/supply-adapter`, `packages/db`, `packages/api`, `apps/web`); no setup task beyond the existing repo bootstrap.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared storage + type surface every user story builds on.

**⚠️ CRITICAL**: No user story task can begin until this phase is complete.

- [X] T002 Add nullable `data_base64` and `mime_type` text columns to the `mediaAsset` table in `packages/db/src/schema-itinerary.ts` (additive-only per data-model.md; run `pnpm --filter @tripforge/db db:push` against the local compose Postgres to sync).
- [X] T003 [P] Add `UploadMediaInput`, `UploadMediaOutcome`, `MediaBytes` types and the `upload`/`getBytesById` method signatures to `MediaStorePort` in `packages/supply-adapter/src/ports/media-store.ts` (per data-model.md).

**Checkpoint**: Schema + port types exist — user story implementation can begin.

---

## Phase 3: User Story 1 - Upload a photo straight from my device (Priority: P1) 🎯 MVP

**Goal**: An agent can pick a local image file and have it appear, previewable, in their media library — no external URL required.

**Independent Test**: Sign in as an agent, open the media library panel, upload a local JPEG via the new file-picker control, and see it appear with a working preview.

### Tests for User Story 1

- [X] T004 [P] [US1] L1/L2 unit tests in `packages/supply-adapter/src/__tests__/media-store.test.ts`: `upload()` success (base64 round-trips to the original bytes), `refused: invalid_mime_type` for a non-image mime type, `refused: file_too_large` for a payload over 3 MB decoded, `getBytesById()` returns the stored bytes+mimeType for an upload-backed asset and `null` for a URL-registered asset or unknown id.
- [X] T005 [P] [US1] L3 integration test in `packages/api/src/__tests__/l3-media.test.ts` (real Postgres): `workspace.media.upload` persists a row scoped to `session.agencyId`, the returned `asset.url` is `/api/media/{id}`, an oversized/non-image payload is refused before any row is written (assert row count unchanged), and a second agency's session cannot see the upload via `list`/`get` (existing tenant-scoping pattern).

### Implementation for User Story 1

- [X] T006 [US1] Implement `upload()` and `getBytesById()` in `SandboxMediaStoreAdapter` (`packages/supply-adapter/src/sandbox/media-store.ts`): validate the closed `MediaSource` enum (reuse existing `VALID_SOURCES`) and a closed image-mime allowlist, reject a decoded byte length over 3 MB before any DB write, base64-encode into `data_base64`/`mime_type`, and update `toAsset()` so an upload-backed row's `url` is derived as `` `/api/media/${row.id}` `` instead of read from the `url` column (depends on T002, T003).
- [X] T007 [US1] Export the new types from `packages/supply-adapter/src/index.ts` (depends on T003).
- [X] T008 [US1] Add `uploadMedia` service function in `packages/api/src/services/media.ts`, mirroring `registerMedia` (tenant-derived `agencyId`, depends on T006).
- [X] T009 [US1] Add the `upload` mutation to `workspaceMediaRouter` in `packages/api/src/routers/workspace-media.ts`: Zod input `{ source, kind: "image", mimeType: <closed allowlist>, dataBase64: z.string(), alt, attribution? }` with a base64-length ceiling as a first-line defense before decoding (depends on T008).
- [X] T010 [US1] Create `apps/web/app/api/media/[id]/route.ts` — GET handler that validates the `id` path param is a uuid, calls `container.mediaStore.getBytesById`, and returns the bytes with the stored `Content-Type` (404 for unknown id or a URL-registered asset with no stored bytes) (depends on T006).
- [X] T011 [P] [US1] Add `uploadMediaErrorMessage` to `apps/web/lib/media-library.ts`, mirroring `registerMediaErrorMessage` (badRequest copy distinguishes oversized vs wrong-type where the transport surfaces it).
- [X] T012 [US1] Add a file-picker upload control to `apps/web/app/(workspace)/workspace/media-library-panel.tsx` alongside the existing URL-registration form: reads the picked `File` via `arrayBuffer()`, base64-encodes client-side, calls the new `upload` mutation, refreshes the library list on success, surfaces `uploadMediaErrorMessage` on failure (depends on T009, T011).

**Checkpoint**: User Story 1 fully functional and independently testable — an agent can upload and see a working preview.

---

## Phase 4: User Story 2 - Uploaded photos attach to the itinerary exactly like registered ones (Priority: P1)

**Goal**: An uploaded asset flows through the existing attach/detach and gallery-rendering paths with zero changes to those paths.

**Independent Test**: Upload an image (US1), attach it to an itinerary's gallery via the existing attach picker, confirm it renders in the workspace preview — using only pre-existing, unmodified attach/detach UI.

### Tests for User Story 2

- [X] T013 [P] [US2] Extend `packages/api/src/__tests__/l3-media.test.ts` (or the existing itinerary attach/detach L3 test) with: attach an upload-backed `MediaAsset.id` via the existing `workspace.itinerary.attachMedia` mutation and assert the resulting `MediaRef.url` matches the upload's serving path; detach it and assert the underlying media asset row still exists (depends on Phase 3).

### Implementation for User Story 2

- [X] T014 [US2] Verify (and adjust only if needed) that `attachMedia`/`detachMedia` in `packages/api/src/services/itineraries.ts` require no changes — they operate on `MediaAsset`/`MediaRef` shape alone, which is unchanged (FR-006). If T013 reveals a gap, fix it here; otherwise this task is a confirmation, not new code.

**Checkpoint**: User Stories 1 AND 2 both independently verified.

---

## Phase 5: User Story 3 - Uploaded photos render for the client, without leaking internal detail (Priority: P2)

**Goal**: An uploaded photo attached to a shared itinerary renders on the public, signed-out client-view page, through the exact same trust boundary as a URL-registered photo.

**Independent Test**: Attach an uploaded asset, open the itinerary's public share link in a signed-out context, confirm the photo renders and no internal id/agencyId/attribution is present in the page or response headers.

### Tests for User Story 3

- [X] T015 [P] [US3] Extend `packages/api/src/__tests__/l3-client-view.test.ts`: an uploaded asset attached to a shared itinerary's gallery appears in `ClientItineraryView.media` with only `kind`/`url`/`alt` (existing allowlist assertion, now exercised with an upload-backed asset).
- [X] T016 [P] [US3] Add a Playwright e2e spec asserting the `/view/[token]` page renders an `<img>` whose `src` is `/api/media/{id}` for an uploaded asset, and that the response from `GET /api/media/{id}` carries no `agencyId`/attribution header or body field (only bytes + `Content-Type`).

### Implementation for User Story 3

- [X] T017 [US3] Confirm (fix only if a gap is found by T015/T016) that no changes are needed to `toClientItineraryView`/`toClientViewMedia` in `packages/api/src/services/client-view.ts` — the existing allowlist projection already reads only `kind`/`url`/`alt` off any `MediaRef`, upload-backed or not.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 Run `quickstart.md` end-to-end against the built compose stack (Live Test & Fix, INV-027) — upload, attach/render parity, public client-view, and the cross-tenant negative check.
- [X] T019 `pnpm run lint` and `pnpm test` (full L1/L2/L3 suite) clean.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)**: T002/T003 block everything else.
- **US1 (Phase 3)**: depends only on Phase 2. This is the MVP — nothing else is usable without it (US2/US3 both need an uploaded asset to test against).
- **US2 (Phase 4)**: depends on US1 (needs an uploaded asset to attach) but touches no US1 files — no risk of breaking US1.
- **US3 (Phase 5)**: depends on US1 (needs an uploaded asset attached to a shared itinerary); independent of US2's attach/detach-specific assertions.
- **Polish (Phase 6)**: after all three stories.

## Parallel Opportunities

- T004 and T005 (US1 tests) can run in parallel — different files.
- T011 (error-message helper) can run in parallel with T006–T010 (different file, no dependency until T012 wires them together).
- T013 (US2) and T015/T016 (US3) can run in parallel once US1 is complete — independent test files.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → Phase 3 (US1) → stop and validate (an agent can upload and preview a photo) before proceeding to US2/US3, which are thinner verification-only phases confirming no regression to the existing attach/detach and client-view paths.
