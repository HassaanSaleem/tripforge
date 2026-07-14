# Research: Media library real file upload

## D1: Where do uploaded bytes live?

**Decision**: Store uploaded file bytes as base64 text in two new NULLABLE
columns on the existing `media_asset` Postgres table (`data_base64`,
`mime_type`) — no new table, no new datastore.

**Rationale**: `packages/itinerary-schema/src/media.ts` already states the
real invariant: a `MediaRef` is "a REFERENCE to media, never the binary...
static content is materialized into Postgres derived tables / CDN by
packages/db." `media_asset` IS that Postgres derived table. INV-003 ("no
second datastore — cache, search, vector — without an ADR and operator
gate") governs introducing something like S3/CDN object storage; it says
nothing against storing bytes in the single existing system of record.
Keeping storage in Postgres means this feature needs no ADR, no
`system-architecture.md` change, and no operator gate — all of which the
S3-class alternative the ticket named as an *example* would trigger.

**Alternatives considered**:
- **S3-class object storage** (the ticket's own example): introduces a
  second datastore, a new external dependency, new secrets, and a new local
  dev docker-compose service. Explicitly deferred — this is a distinct,
  larger architectural decision belonging to an operator-gated ADR, not a
  low-priority follow-up ticket.
- **Postgres `bytea` column via a drizzle custom type**: functionally
  equivalent to base64-in-text, but drizzle-orm's pg-core has no first-class
  `bytea` helper in this codebase's version, so it would need a hand-rolled
  `customType`. Base64-in-`text()` reuses the exact column helper already
  used for every other field in this schema file — simpler, no new
  abstraction for a v0 feature.

## D2: How does the upload travel from browser to server?

**Decision**: A new `workspace.media.upload` tRPC mutation, input containing
`{ source, kind: "image", alt, attribution?, mimeType, dataBase64 }` — the
browser reads the picked `File` via `FileReader`/`arrayBuffer`, base64-encodes
it client-side, and calls the mutation like any other tRPC write.

**Rationale**: INV-018 ("web and mobile consume the same tRPC router; no
client reaches..."). A parallel multipart REST upload endpoint would be a
second, incompatible write path for the same domain object — the existing
`register` mutation is already the precedent shape (agentProcedure, Zod
input, tenant-derived agencyId). Reusing tRPC keeps the write side
consistent with every other mutation in the codebase.

**Alternatives considered**:
- **`multipart/form-data` to a Next.js Route Handler**: works, but forks the
  write path in two (tRPC for register, REST for upload) for what the spec
  requires to be indistinguishable downstream (FR-006). Rejected for
  consistency, not correctness.

## D3: How is an uploaded asset served back to `<img src>`?

**Decision**: A new, unauthenticated Next.js Route Handler,
`app/api/media/[id]/route.ts` (GET), addressed only by the media asset's
random UUID. It calls a new NOT-tenant-scoped port method
(`getBytesById(mediaAssetId)`) and streams the stored bytes back with the
stored `mime_type` as `Content-Type`.

**Rationale**: `<img src>` needs a plain fetchable URL, not a JSON RPC
response — tRPC isn't the right shape for binary bytes. The "unauthenticated,
addressed by an unguessable random id" design directly mirrors the existing,
already-reviewed precedent in `packages/api/src/services/client-view.ts`:
`resolveShareLink` reads a share by its bare `uuid` token with **no session
read at all** ("possession of the token is the grant" — the itinerary
share-link flow already renders media into that same signed-out page). A
media asset's `id` is exactly the same shape of unguessable identifier
(`gen_random_uuid`, 122 random bits, per `itineraryShareLink`'s own comment).
Cross-tenant enumeration is exactly as infeasible here as it already is for
the share-link token the client-view route depends on today.

**Alternatives considered**:
- **Tenant-scoped signed URL with short-lived tokens**: more correct for a
  production CDN, but overkill for v0 given the existing share-link precedent
  already accepts "unguessable id is the grant" for public media rendering,
  and this feature must render in that same signed-out client-view page.

## D4: Upload size/type cap

**Decision**: 3 MB raw file size cap; JPEG/PNG/WebP/GIF only (Content-Type
allowlist, checked before any bytes are persisted).

**Rationale**: The upload transport is base64-over-tRPC (D2), which inflates
payload size ~4/3×, and the P0 deploy target is Vercel serverless functions
(ADR-0004) — a platform with a real, historically documented request-body
ceiling in the low single-digit MB. Local docker-compose has no such limit,
so this cap must be chosen for the production target, not just what passes
local Live Test. 3 MB raw → ~4 MB base64 + trivial JSON overhead stays safely
under typical serverless body ceilings with headroom. Video/embed stay out of
scope (matches spec 015's existing v0 kind-scoping decision).

**Alternatives considered**:
- **10 MB** (an earlier draft default): risks silently failing in production
  after passing every local gate, since local Live Test never touches the
  Vercel runtime. Rejected once the deploy target's constraint was traced.

## D5: Port surface change

**Decision**: Extend `MediaStorePort` (not duplicate it) with two new
methods: `upload(input: UploadMediaInput): Promise<UploadMediaOutcome>`
(tenant-scoped, mirrors `register`) and `getBytesById(mediaAssetId): Promise<MediaBytes | null>`
(deliberately NOT tenant-scoped, per D3). `SandboxMediaStoreAdapter` gains
both method bodies; no new adapter class.

**Rationale**: Pre-Write Discipline (typescript-clean-architecture skill) —
reuse/extend over new. The existing port/adapter pair already owns exactly
this domain (agency media asset persistence); adding two methods that follow
the file's own established patterns (defense-in-depth enum/type checks,
`requireDb()`, `toAsset()` row mapper) is a strict extension, not a parallel
implementation.

## D6: The derived `url` must be absolute (found during implementation)

**Decision**: `SandboxMediaStoreAdapter` takes a `publicBaseUrl` constructor
parameter (default `http://localhost:3000`) and derives an upload-backed
asset's `url` as `${publicBaseUrl}/api/media/{id}` — a full absolute URL, not
the bare path originally planned in data-model.md. `buildContainer` gains a
matching `publicBaseUrl` option; the app wires it from `BETTER_AUTH_URL` (the
one already-established "my own public origin" env var), never a new one.

**Rationale**: `packages/itinerary-schema/src/media.ts`'s `MediaRefSchema.url`
is `z.string().url()` — the SAME canonical-schema field `register`'s
externally-hosted urls already satisfy. `attachMedia` builds a `MediaRef`
straight from `MediaAsset.url` and re-validates the whole document via
`ItinerarySchema.parse` (INV-001) before persisting; a bare path fails that
parse with `invalid_string` the moment an uploaded asset is attached to an
itinerary — caught by the L3 tests for US2/US3 (T005/T013/T015), not by the
earlier design review, since the plan didn't re-derive the canonical schema's
own field-level constraint before choosing the bare-path design in
data-model.md. Reusing `BETTER_AUTH_URL` (rather than inventing a second
origin env var) costs nothing: it's already required to equal the browser's
real origin for auth to work at all (a stale value already breaks sign-up
today), so it's already correct in every environment this app runs in.

**Alternatives considered**:
- **Route the ref through `storageKey` instead of `url`** (the schema's other
  half of its `storageKey`-or-`url` requirement): would have avoided the
  absolute-URL constraint, but `toClientViewMedia` and the workspace gallery
  (`itinerary-days.tsx`) both render directly off `ref.url` today and treat a
  `storageKey`-only ref as unrenderable (existing spec 015 comment: "nothing
  servable to render") — fixing that would touch two rendering call sites
  instead of one adapter constructor parameter. Rejected for a smaller diff
  with an equivalent result (FR-006's "indistinguishable in shape" holds
  either way).
