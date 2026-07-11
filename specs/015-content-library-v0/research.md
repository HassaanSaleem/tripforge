# Research: Content Library v0

## D1: Where does `MediaStorePort` live, and what shape does it take?

**Decision**: A new, narrower port in `packages/supply-adapter/src/ports/media-store.ts`:

```ts
export interface MediaAsset {
  id: string;
  agencyId: string;
  source: MediaSource;       // reuse @tripforge/itinerary-schema's closed enum
  kind: "image" | "video" | "embed";
  url: string;
  alt: string;
  attribution?: string;
  createdAt: string;
}
export type RegisterMediaOutcome =
  | { status: "registered"; asset: MediaAsset }
  | { status: "refused"; reason: "invalid_source" };
export interface MediaStorePort {
  register(input: RegisterMediaInput): Promise<RegisterMediaOutcome>;
  list(agencyId: string): Promise<MediaAsset[]>;
  get(agencyId: string, mediaAssetId: string): Promise<MediaAsset | null>;
}
```

A sandbox/local implementation (`sandbox/media-store.ts`) backed directly by
the new `media_asset` Postgres table — no in-memory engine (unlike
`SandboxSupplyEngine`), since there is no quote-hold/expiry lifecycle to
simulate; a media asset is either registered or it isn't.

**Rationale**: The existing `SupplyPort<Criteria, Offer, Quote>` shape
(`search`/`quote`/`book`/`cancel`) models a bookable-component supplier with
a price-hold lifecycle (Constitution V, PRD §9.2). Media-asset storage has no
offer, no quote, no hold, nothing to cancel — it is a metadata repository.
Reusing the 4-verb shape would force fake `quote`/`cancel` methods with no
referent, which is worse than a small dedicated interface (documented as a
Complexity Tracking deviation in plan.md, since it still lives inside the
adapter-boundary package and the `Container`-injected DI pattern, preserving
the principle's *intent* — swappable implementation, no leaked shape).

**Alternatives considered**:
- *Force-fit `SupplyPort<Criteria, Offer, Quote>`*: rejected — `quote`/`book`/
  `cancel` would be unused no-ops, actively misleading about what the port
  does.
- *Put media storage directly in `packages/db` as a plain repository function
  (no port/adapter split at all)*: rejected — the ticket explicitly asks for
  an adapter-boundary port (so a later real object-storage/CDN adapter can
  swap in without touching callers), and every other storage-adjacent
  capability in this codebase (hotel/activity/transfer/car-rental) goes
  through the port pattern; a bare DB function would be the one exception.

## D2: v0 "upload" model — URL registration, not binary transfer

**Decision**: `register` accepts a caller-supplied `url` (already reachable,
e.g. an already-hosted licensed-stock image or an agent's already-hosted
upload) plus metadata. No file bytes cross the tRPC boundary in v0; no
object-storage (S3-class) integration is built.

**Rationale**: The spec's Assumptions section states this explicitly
(bring-your-own-link model), matching the ticket's own scope carve-out (a
real binary upload pipeline is a follow-up). This keeps the feature
buildable in one cycle and keeps INV-025 (binaries never in the itinerary
document) trivially true — nothing binary is stored anywhere, only URLs and
metadata rows.

**Alternatives considered**:
- *Full multipart upload + object storage now*: rejected — multiplies scope
  (storage provider choice, CDN, image processing) well beyond what this
  cycle can safely land and test; the previous execute attempt at this same
  ticket failed mid-implementation, so minimizing net-new infrastructure is
  the priority.

## D3: Attach/detach — how does a MediaRef get into the stored document?

**Decision**: New service functions `attachMedia`/`detachMedia` in
`packages/api/src/services/itineraries.ts`, each doing a tenant-scoped
read-modify-write on the `itinerary.document` JSONB column:

1. Load the itinerary row scoped by `(agencyId, itineraryId)` (`scopedWhere`,
   same as `createShareLink`/`booking.ts`); not-found and cross-tenant
   collapse to the same outcome (INV-004, no existence oracle).
2. `parseItinerary(row.document)` — boundary re-validation (INV-001).
3. For `target: { scope: "gallery" }`: push/filter `document.media`. For
   `target: { scope: "item"; itemId }`: locate the item across `document.days[].items[]`
   by `id` and push/filter its `media` array; item-not-found is a typed
   refusal.
4. `attachMedia` looks up the `MediaAsset` via `MediaStorePort.get(agencyId,
   mediaAssetId)` first (tenant-scoped — an asset from another agency is
   `not_found`, same collapse as step 1) and builds a `MediaRef` with
   `id = mediaAssetId` (stable — see D4), `kind`/`url`/`source`/`alt`/
   `attribution` copied from the asset.
5. Re-validate the mutated object with `ItinerarySchema.parse` (INV-001 — the
   document is canonical on write, not just on initial draft) before persisting.
6. `UPDATE itinerary SET document = $1 WHERE id = $2 AND agency_id = $3`.

This is the FIRST mutation to the stored `document` column after initial
`draft` — booking never rewrites it (booking state lives in
`booking_component`/`markup_ledger`, read separately). No optimistic locking
is added: attach/detach is a single agent editing their own trip through the
UI, not a money path or a multi-writer race (unlike quote/book), so
last-write-wins is an acceptable v0 simplicity default, consistent with the
Constitution's "simplicity default... YAGNI" guidance.

**Rationale**: Reuses every existing tenant-scoping and boundary-
revalidation pattern from `client-view.ts`/`booking.ts` rather than inventing
a new one; keeps the write path inside the same service module that already
owns itinerary reads (`itineraries.ts`), which the ticket's own file
pointers do not preclude and which avoids growing `booking.ts` (already
flagged past the split threshold by an open quality-sweep ticket).

**Alternatives considered**:
- *A generic "patch itinerary document" mutation*: rejected — far too broad
  a surface (would let a client rewrite pricing/provenance/days), violates
  the principle that the document's shape-changing writes should be narrow,
  named operations (draft, attach/detach media), not a generic patch.
- *Optimistic locking (version column + compare-and-swap)*: rejected for v0
  — no concurrent-writer scenario exists yet for itinerary editing (unlike
  booking's proven claim-gate race); adding it now is unjustified complexity
  the constitution's simplicity default advises against. Flagged as a
  follow-up if a future feature introduces concurrent itinerary editing.

## D4: MediaRef identity — reuse the library asset id

**Decision**: A `MediaRef` attached anywhere always carries
`id = <the MediaAsset's own id>`. Attaching the same asset to two different
targets (e.g. the gallery AND one item) is allowed and produces two
independent `MediaRef`s with the same `id` in two different arrays;
detaching from one target only removes it from that target's array, since
detach is always `(target, id)`-scoped, never global. Attaching the same
asset twice to the *same* target is a no-op (dedupe by id) rather than a
duplicate entry.

**Rationale**: `MediaRefSchema.id` (`packages/itinerary-schema/src/media.ts`)
has no uniqueness constraint scoped narrower than "unique enough for the
caller to reference it" — reusing the stable library id is the simplest
scheme that lets the client unambiguously say "detach *this* asset from
*this* target" without minting and tracking a second id space.

**Alternatives considered**:
- *A fresh UUID per attachment (attachment-instance id, distinct from the
  library asset id)*: rejected — adds a second id space with no present
  need (nothing in this spec requires telling apart two attachments of the
  same asset to the same target), and would need its own field since
  `MediaRefSchema.id` is the only id `MediaRef` carries.

## D5: Client-view allowlist amendment — exactly what crosses (FR-007)

**Decision**: `ClientItineraryView` gains `media: ClientViewMedia[]`
(gallery) and each `ClientViewItem` variant gains `media:
ClientViewMedia[]`, where:

```ts
export interface ClientViewMedia {
  kind: "image" | "video" | "embed";
  url: string;
  alt: string;
}
```

Only `kind`, `url`, `alt` cross the boundary — never the `MediaAsset`/
`MediaRef` id, `source`, or `attribution`. `toClientItineraryView` builds
this array by mapping `document.media` (and each item's `document...media`)
straight off the already-loaded canonical document — no new database call.

**Rationale**: Matches every other field on `ClientItineraryView`
(title/kind/booked/sellMinor/schedule fields) — copy only what a client
needs to see, nothing that identifies the internal record or its
provenance. `source`/`attribution` are agent-facing trust/compliance
metadata (which licensed-stock provider, whose upload), not client-facing
content; `id` is an internal reference with no meaning to a client and would
otherwise be the first internal-id leak in this projection.

**Alternatives considered**:
- *Pass through the full `MediaRef` (including `source`/`attribution`/
  `id`)*: rejected — violates FR-007/FR-010's "never expose internal library
  identifiers... or agent-only metadata"; `source` in particular reveals
  internal sourcing/compliance classification a client has no reason to see.

## D6: Rendering — image-first, minimal video/embed representation

**Decision**: The `/view` gallery and per-item media render `<img>` tags for
`kind: "image"`; `video`/`embed` kinds render a labeled link (e.g. "▶ Watch
video") rather than an inline player. The workspace library panel and
attach/detach controls work uniformly across all three kinds (a video/embed
asset can be registered and attached exactly like an image).

**Rationale**: Matches the spec's Assumptions ("video/embed kinds are
attachable... a representative link or thumbnail satisfies this spec") and
keeps the rendering surface small enough to land and Live-Test in this
cycle; a full video player is real scope with its own UX/perf/security
considerations (autoplay, embeds-as-iframes CSP) better handled as a
follow-up once the base attach/render path is proven.

**Alternatives considered**:
- *Full `<video>`/iframe-embed rendering now*: rejected as unnecessary scope
  growth for v0 — the spec explicitly carves this out.
