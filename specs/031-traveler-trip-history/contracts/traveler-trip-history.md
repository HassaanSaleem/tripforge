# Contract: `clientView.attachTrip` + `clientView.myTrips` (tRPC)

Not a money path. Both procedures are `protectedProcedure`-gated (INV-023): anonymous → 401
UNAUTHORIZED. Both a signed-in traveler and a signed-in agent may call either (spec 030 FR-005
precedent: identity is session-tier-agnostic here — there is nothing agent-confidential in either
payload).

## §1 `clientView.attachTrip` (mutation) — FR-002

Input:

```ts
{ token: string } // uuid, reuses the existing getInputSchema shape (same as clientView.itinerary)
```

Output:

```ts
{ status: "not_found" } | { status: "linked" }
```

- Anonymous caller (no session): throws `UNAUTHORIZED`. The client-view page never calls this
  procedure without first confirming a session exists server-side (same guard shape as spec 030's
  `clientView.me` call site) — in practice this branch is defense-in-depth.
- Unknown/deleted-itinerary token: `{ status: "not_found" }` — same not_found surface
  `clientView.itinerary` already uses; reveals nothing about whether the token ever existed.
- Known token: upserts one `client_trip_link` row for `(ctx.session.userId, link.itineraryId)`
  with `source: "view"`, `ON CONFLICT (user_id, itinerary_id) DO NOTHING` — idempotent across
  repeat visits (a second call with the same caller+token is a no-op, not an error).

Server behavior: `attachTraveler(container, ctx.session, token)` — one `SELECT` on
`itinerary_share_link` (via the shared `findShareLinkByToken` helper, factored out of
`resolveShareLink`), then one `INSERT ... ON CONFLICT DO NOTHING` on `client_trip_link`. No
existing row is ever read or scoped by `agencyId` — the write is keyed entirely on the caller's own
`userId`, so there is no tenant-scoping predicate to get wrong.

**Failure isolation (spec.md US3 / plan.md Constraints)**: the page's server component calls this
in its OWN `try/catch`, separate from the `clientView.me()` call that produces the pre-fill
identity (spec 030). A thrown error here (e.g. a transient DB hiccup) is swallowed and never
surfaces to the visitor or affects the identity/pre-fill the page already renders — see
`apps/web/app/(client-view)/view/[token]/page.tsx`.

## §2 `clientView.myTrips` (query) — FR-001/003/005

Input: `{}` (no parameters — scope comes exclusively from the verified session, same convention as
`clientView.me`).

Output:

```ts
Array<{
  token: string;
  title: string;
  agencyName: string;
  currency: string;
  totalSellMinor: number | null;
  linkedAt: string; // ISO timestamp
}>
```

Ordered newest-linked-first (`ORDER BY client_trip_link.created_at DESC`).

- Anonymous caller: throws `UNAUTHORIZED`.
- Signed-in caller with no linked trips: `[]` (not an error — an empty list is a normal, valid
  state, same convention as an agency's empty trip-handoff inbox).
- Signed-in caller with N linked trips: exactly the caller's own N trips, in no case another
  visitor's (FR-005) — the query's only predicate is `client_trip_link.user_id = ctx.session.userId`,
  a value the session middleware derives server-side, never client input.

Server behavior: `listTravelerTrips(container, ctx.session.userId)` —
1. `SELECT client_trip_link.itinerary_id, itinerary_share_link.token FROM client_trip_link JOIN itinerary_share_link ON itinerary_share_link.itinerary_id = client_trip_link.itinerary_id WHERE client_trip_link.user_id = ? ORDER BY client_trip_link.created_at DESC`
2. For each row, call the EXISTING `resolveShareLink(container, token)` (unmodified) and, when
   `status === "found"`, project `{ token, title: view.title, agencyName: view.agencyName,
   currency: view.currency, totalSellMinor: view.totalSellMinor, linkedAt }`. A `not_found` result
   (itinerary/share-link deleted since the link was created — should be rare since the FK cascade
   already removes the `client_trip_link` row on itinerary delete, but defensive against any future
   share-link-only deletion path) is silently dropped, not surfaced as an error.

## Client-view UI contract (INV-020/024, extends spec 010/022/030 §"Client-view UI contract")

- `/view/my-trips/page.tsx` renders inside `apps/web/app/(client-view)/`, inheriting the route
  group's brand-neutral `layout.tsx` (INV-020) — same constraint as every existing client-view
  page. No agency's name or any single agency's branding is privileged — each row in the list
  carries its OWN owning agency's name (the trip's `agencyName`), same as opening that trip
  directly would show.
- Not signed in → `redirect("/view/sign-in")` (mirrors `/view/sign-in`'s existing
  redirect-if-already-signed-in shape, inverted) — no trip data is ever computed or sent to an
  unauthenticated request.
- Each row links to `/view/${token}` — the EXISTING, unmodified client-view page. "My Trips"
  introduces no second rendering of itinerary content (FR-004).
- `trip-fork.tsx`'s account strip gains a "My Trips" link, shown ONLY in the `identity ? (...)`
  branch (i.e., only when signed in) — the anonymous branch is byte-identical to spec 030's
  current output.
