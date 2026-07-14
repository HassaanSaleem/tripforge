# Contract: `clientView.requestHandoff` + `workspace.tripHandoffs.*` (tRPC)

All money-free. `clientView.requestHandoff` is `publicProcedure` (link-bearer
access, INV-018 — same trust model as `clientView.itinerary`); the
`tripHandoffs.*` procedures are `agentProcedure`-gated (INV-023/024):
anonymous → 401 UNAUTHORIZED, traveler (no agency) → 403 FORBIDDEN. Business
refusals are typed VALUES in the response (marketplace-router / group-travel
precedent); TRPCErrors are reserved for auth/validation/not-found.

## §1 `clientView.requestHandoff` (mutation) — FR-002/003/004/010/011

Input (zod, strict):

```ts
{
  token: uuid,                 // the share token from /view/[token]
  contactName: string (1..200),
  contactEmail: string.email().optional(),
  notes: string (0..2000).optional(),
}
```

An empty/missing `contactName` fails at the input-schema boundary (zod parse
error) — no runtime "invalid" status needed, same precedent as
`postGroupDepartureInputSchema`'s capacity/price bounds.

Outcomes (discriminated on `status`, mirrors `resolveShareLink`'s existing
not_found precedent — client-view.ts:244/248):

- `{ status: "submitted", requestId: uuid }`
- `{ status: "not_found" }` — unknown/deleted token. Indistinguishable from
  "token was never valid" (same no-existence-oracle discipline as
  `clientView.itinerary` — FR-010).

Server behavior: resolves the itinerary via the SAME `itinerary_share_link`
lookup `resolveShareLink` already performs; on success, reads that itinerary's
CURRENT `agency_id` and inserts one `trip_handoff_request` row
(`status = "new"`) with it (research D4). No session is read or required.

## §2 `workspace.tripHandoffs.list` (query) — FR-006/007

Input: `{}` (no filters/pagination — matches `groupTravel.browse`'s v0 scope).
Tenant-scoped: `WHERE agency_id = session.agencyId`, newest-first
(`ORDER BY created_at DESC`).

```ts
{ requests: Array<{
    id, itineraryId, itineraryTitle,
    contactName, contactEmail: string | null, notes: string | null,
    status: "new" | "accepted",
    createdAt: string (ISO),
} > }
```

A different agency's requests never appear — enforced by the `WHERE` clause,
not a client-side filter (FR-007, INV-004).

## §3 `workspace.tripHandoffs.accept` (mutation) — FR-008

Input: `{ requestId: uuid }`. Tenant-scoped (own agency's requests only).

- `{ status: "accepted", requestId }` — whether this call performed the
  `new → accepted` transition or the row was already `accepted` (idempotent,
  research D3) — both cases return this same outcome shape.
- throws `NOT_FOUND` — request absent or belongs to a different agency
  (cross-tenant probe, same shape as `groupTravel.cancel`'s not-found).

## Client-view UI contract (INV-020/024)

The fork component (`trip-fork.tsx`) renders inside `apps/web/app/(client-view)/`
and therefore inherits the route group's brand-neutral `layout.tsx` — it MUST
NOT import or render anything from the workspace's agent-facing components,
and MUST NOT reveal net rate, markup, other travelers' requests, or any other
agency's identity. It calls exactly one new procedure
(`clientView.requestHandoff`) beyond the existing `clientView.itinerary` read.
