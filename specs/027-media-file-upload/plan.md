# Implementation Plan: Media library real file upload

**Branch**: `kitchen/fix-seed-0022a-media-upload` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-media-file-upload/spec.md`

## Summary

Close the seed-0022 follow-up (seed-0022a): let an agent upload a real image
file from their device into the media library, instead of only registering
an externally-hosted URL. Extend the existing `MediaStorePort` (not
duplicate it) with an `upload` method that stores bytes as base64 in two new
nullable columns on the existing `media_asset` Postgres table — Postgres
remains the single system of record (INV-003), so no ADR/architecture-doc
change is needed, unlike the S3-class object storage the ticket named only
as an *example* alternative (explicitly deferred to a future operator-gated
decision). A new unauthenticated route (`GET /api/media/[id]`), addressed
only by the asset's random uuid, serves the bytes back for `<img src>` —
mirroring the existing, already-reviewed "unguessable id is the read grant"
precedent the client-view share link already uses. From every existing
caller's perspective (attach/detach, gallery rendering, client-view
allowlist projection) an uploaded asset is indistinguishable from a
URL-registered one. No canonical schema change — `MediaRef` already supports
this at v0.1.0.

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm workspace, Next.js 15 app router + tRPC)

**Primary Dependencies**: `@tripforge/supply-adapter` (extend existing `MediaStorePort` + `SandboxMediaStoreAdapter`), `@tripforge/db` (Drizzle ORM over Postgres, additive columns), `@trpc/server`, existing `apps/web` client (`lib/trpc/client.ts`)

**Storage**: PostgreSQL — two new nullable columns (`data_base64`, `mime_type`) on the existing `media_asset` table (additive-only, `db:push` schema-sync, no migration file per this repo's existing drizzle-push workflow); no new datastore, no ADR (research D1)

**Testing**: vitest (L1/L2 — extend `packages/supply-adapter/src/__tests__/media-store.test.ts`), L3 integration against real Postgres (extend `packages/api/src/__tests__/l3-media.test.ts` — upload round-trip, cross-tenant refusal, size/type refusal; extend `l3-client-view.test.ts` if needed for the serving-route allowlist assertion), Playwright e2e (new upload-then-render spec), Live Test & Fix (INV-027)

**Target Platform**: Web (existing `apps/web` Next.js app), tRPC API surface + one new plain Route Handler

**Project Type**: Web application (monorepo: `packages/*` domain/adapters, `apps/web` UI)

**Performance Goals**: N/A beyond existing read-path expectations — upload is a single insert, serving is a single primary-key lookup; no fan-out

**Constraints**: Uploaded bytes stay inside Postgres (INV-003 — no second datastore without an ADR + operator gate; S3-class storage explicitly deferred); 3 MB raw file cap chosen for the base64-over-tRPC transport plus the Vercel P0 deploy target's serverless body-size ceiling (research D4); image kinds only for v0 (JPEG/PNG/WebP/GIF), matching spec 015's existing kind-scoping; every new/extended procedure is tenant-scoped (INV-004) EXCEPT the new serving route, which is deliberately public and scoped instead by unguessable-id possession (research D3, precedented by the existing client-view share-link resolution); canonical schema stays at v0.1.0, no migration note needed (Constitution IV); client-view trust boundary (spec 010 FR-007, spec 015 amendment) is reused unmodified — no new fields allow-listed

**Scale/Scope**: Two new port methods on the existing `MediaStorePort` (no new port/adapter class), two new nullable DB columns, one new tRPC mutation, one new Next.js Route Handler, one UI file-picker control added alongside the existing URL-registration form

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First**: PASS. Directly extends the sell-grade client-proposal capability seed-0022 shipped (Principle II) — no marketplace-liquidity claim is made or needed here; marketplace listing-card imagery stays out of scope exactly as spec 015 left it.
- **II. Agent Experience Is the Wedge**: PASS. Removes the one real friction point spec 015's own research flagged (agents cannot upload a local file) — directly serves time-to-client-ready-itinerary. White-label presentation is unaffected: uploaded media renders under the agency's own brand via the same client-view path.
- **III. Budget-Aware AI**: N/A — no planning/budget surface touched. Compliance & Content Sourcing's imagery rule (never present AI-generated visuals as real photos) continues to be enforced structurally: the closed `MediaSource` enum is untouched, and this feature adds no new source member.
- **IV. Canonical Itinerary Schema**: PASS. No change to `MediaRefSchema` or `SCHEMA_VERSION` ("0.1.0") — an uploaded asset's `MediaRef` still carries only `url` (the internal serving path), identical in shape to a URL-registered one.
- **V. Integrate Supply, Don't Contract It**: PASS by the same extension-of-intent reasoning spec 015's plan already established for `MediaStorePort` (not a bookable-component supplier port; no search/quote/book/cancel lifecycle applies). This feature adds no new port, just two methods on the existing one.
- **VI. Trust, Provenance & Revenue-Share Integrity**: N/A — no money path touched. The new public serving route (research D3) is a deliberate, reviewed narrowing of the trust boundary to "unguessable id is the grant," precedented by the already-shipped client-view share-link resolution (`resolveShareLink`) — it does not weaken tenant scoping anywhere else, and it goes through this speckit flow, not silently.

**Result: PASS. No blocking violations. One noted architectural boundary (INV-003) resolved in favor of Postgres-only storage — see research D1; this is a scope decision, not a Complexity Tracking deviation, since it keeps the design SIMPLER than the alternative (S3), not more complex.**

## Project Structure

### Documentation (this feature)

```text
specs/027-media-file-upload/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── media-upload.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/db/src/schema-itinerary.ts                        # media_asset: +dataBase64, +mimeType (nullable)

packages/supply-adapter/src/ports/media-store.ts            # +UploadMediaInput/UploadMediaOutcome/MediaBytes types, +upload/getBytesById on MediaStorePort
packages/supply-adapter/src/sandbox/media-store.ts           # SandboxMediaStoreAdapter: +upload (validates mime/size, base64-encodes, derives url), +getBytesById (NOT tenant-scoped), toAsset: url derivation for upload-backed rows
packages/supply-adapter/src/__tests__/media-store.test.ts    # +L1/L2: upload success, invalid_mime_type, file_too_large, getBytesById round-trip + unknown-id

packages/api/src/services/media.ts                          # +uploadMedia (tenant-scoped, mirrors registerMedia)
packages/api/src/routers/workspace-media.ts                  # +upload mutation (Zod: mimeType allowlist, base64 length ceiling)
packages/api/src/__tests__/l3-media.test.ts                  # +L3: upload round-trip on real Postgres, cross-tenant getBytesById still returns bytes (public by design) but list/get stay tenant-scoped, size/type refusal

apps/web/app/api/media/[id]/route.ts                         # NEW: GET route handler, streams bytes by id, 404 for unknown/URL-registered
apps/web/lib/media-library.ts                                # +uploadMediaErrorMessage (mirrors registerMediaErrorMessage)
apps/web/app/(workspace)/workspace/media-library-panel.tsx   # +file-picker upload control alongside the existing URL-registration form

tests/e2e/ (Playwright)                                      # +upload-then-attach-then-render spec (workspace + client-view)
```

**Structure Decision**: Extends the exact files spec 015 already established
(`MediaStorePort`/`SandboxMediaStoreAdapter`, `services/media.ts`,
`routers/workspace-media.ts`, `media-library-panel.tsx`) rather than adding
parallel ones — Pre-Write Discipline: **extend**, not new. The one genuinely
new file class is the Route Handler (`app/api/media/[id]/route.ts`), needed
because `<img src>` requires a plain fetchable URL that a tRPC JSON
procedure cannot serve; this follows the existing precedent of non-tRPC
routes already living alongside tRPC in `apps/web/app/api/` (`health`,
`auth`).

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

No violations — table intentionally omitted.
