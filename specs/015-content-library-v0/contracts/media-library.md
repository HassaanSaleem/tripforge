# Contract: Content Library v0

## §1. `workspace.media.register` (mutation)

**Input**:
```ts
{ source: "licensed-stock" | "official-embed" | "agent-upload" | "traveler-ugc";
  kind: "image" | "video" | "embed";
  url: string;   // z.string().url()
  alt: string;   // min length 1
  attribution?: string; }
```

**Output**:
```ts
| { status: "registered"; asset: MediaAsset }
| { status: "refused"; reason: "invalid_source" }
```

**Contract**:
- Persists a row scoped to `session.agencyId` (the caller supplies no tenant id).
- A `source` outside the closed set is a Zod input-validation error at the
  tRPC boundary (TRPCError `BAD_REQUEST`), never reaches the service — belt
  and suspenders with the schema-level closed enum.
- Never accepts or stores binary bytes (v0 URL-registration model).

## §2. `workspace.media.list` (query, no input)

**Output**: `{ assets: MediaAsset[] }` — the caller's own agency's media only,
newest first.

**Contract**: Cross-tenant rows are unreachable by construction
(`scopedWhere(mediaAsset.agencyId, session.agencyId)`), same guarantee class
as `workspace.itinerary.list`.

## §3. `workspace.media.get` (query)

**Input**: `{ mediaAssetId: string }`

**Output**: `| { status: "found"; asset: MediaAsset } | { status: "not_found" }`

**Contract**: An id belonging to another agency returns `not_found` —
indistinguishable from an unknown id (no existence oracle, INV-004 pattern).

## §4. `workspace.itinerary.attachMedia` (mutation)

**Input**:
```ts
{ itineraryId: string;
  mediaAssetId: string;
  target: { scope: "gallery" } | { scope: "item"; itemId: string }; }
```

**Output**:
```ts
| { status: "attached"; media: MediaRef }
| { status: "not_found" }        // itinerary OR media asset not owned/found
| { status: "item_not_found" }   // target.scope === "item" and no such item id
```

**Contract**:
- Refuses (typed, `not_found`) for any itinerary or media asset not owned by
  `session.agencyId` — cross-tenant and unknown-id are the same outcome.
- Idempotent per `(itineraryId, target, mediaAssetId)`: attaching an already-
  attached asset to the same target is a no-op that still returns
  `"attached"` with the existing `MediaRef` (research D4 dedupe).
- The mutated document is re-validated against `ItinerarySchema` before
  persisting (INV-001); a validation failure is a thrown error (should be
  unreachable in practice since inputs are constrained, but boundary
  re-validation is non-negotiable per existing precedent).

## §5. `workspace.itinerary.detachMedia` (mutation)

**Input**:
```ts
{ itineraryId: string;
  mediaRefId: string;
  target: { scope: "gallery" } | { scope: "item"; itemId: string }; }
```

**Output**:
```ts
| { status: "detached" }
| { status: "not_found" }
| { status: "item_not_found" }
```

**Contract**: Removing an absent `mediaRefId` from the target is a no-op that
still returns `"detached"` (detach is idempotent — the caller's desired end
state, "not attached here," already holds).

## §6. `workspace.itinerary.get` (existing, unchanged procedure — output grows)

**New output fields**: the returned itinerary's `media` (gallery) and each
item's `media` arrays are populated when attachments exist (previously
always empty). No shape change — `MediaRefSchema` was already part of the
returned document.

## §7. Client-view (`resolveShareLink` → `ClientItineraryView`) — allowlist amendment

**New output fields**:
```ts
// ClientItineraryView
media: ClientViewMedia[];   // gallery
// each ClientViewItem variant (stay | activity | transfer)
media: ClientViewMedia[];   // per-item
// where
interface ClientViewMedia { kind: "image" | "video" | "embed"; url: string; alt: string; }
```

**Contract** (FR-007/FR-010, research D5):
- Only `kind`/`url`/`alt` cross the boundary — `MediaRef.id`, `source`,
  `attribution` MUST NOT appear anywhere in the client-view payload or the
  rendered page (asserted by an L3 test grepping the serialized response and
  an e2e test grepping the rendered page source).
- An itinerary with no attached media returns `media: []` everywhere
  (never `null`/`undefined`) — the client page renders identically to today
  (SC-005).

## Tenant scoping (all new/extended procedures)

Every new procedure runs under `agentProcedure` (`session.agencyId` derived
server-side, never client-supplied). `attachMedia`/`detachMedia` additionally
re-derive ownership of BOTH the itinerary and the media asset from
`session.agencyId` before any mutation — a caller cannot attach another
agency's media asset to their own itinerary, nor attach their own media to
another agency's itinerary.
