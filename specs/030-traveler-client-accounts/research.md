# Phase 0 Research: Traveler Client Accounts

No `[NEEDS CLARIFICATION]` markers were left in spec.md — the feature description
resolved the identity-model question explicitly. This file records the decisions and
alternatives considered, per the ticket's requirement that the identity model be stated
and the migration note be explicit (even when the note is "none needed").

## D1 — Identity model: reuse the org-less Better Auth user, add nothing

**Decision**: A "traveler" is a Better Auth `user` row with zero `member` rows. No new
column, table, role flag, or enum value.

**Rationale**: This state already exists and is already load-bearing. `getSessionContext`
(`apps/web/lib/auth.ts:53-67`) has returned `{ userId }` (no `agencyId`/`agencyRole`) for
exactly this case since spec 007, and `packages/api/src/context.ts:18-23`'s own doc
comment already names it: "A TRAVELER is a standalone user with neither [agencyId nor
agencyRole]." An L3 test already constructs this fixture directly:
`packages/api/src/__tests__/l3-client-view.test.ts:151`,
`const traveler: SessionContext = { userId: ... }`, and asserts it is `FORBIDDEN` from
`workspace.itinerary.share`. This feature does not invent traveler identity — it is the
first feature to give a traveler a reason to sign in.

**Alternatives considered**:
- *Explicit `role` column on `user`* — rejected: would duplicate information already
  derivable from membership absence, and would need a backfill decision for the ~90
  existing seeded users (all of whom are agents today). No behavioral gain over the
  membership-absence signal already used everywhere else.
- *A separate `traveler` table* — rejected: Better Auth's adapter owns the `user` table;
  splitting identity across two tables for the same underlying Better Auth account would
  fight the ORM/auth-library's own model for no benefit (a traveler may later become an
  agent, or vice versa is nonsensical, but the reverse — an agent visiting the client
  surface — must keep working uniformly, which a split table complicates for no reason).

**Migration note (satisfies the ticket's HALT requirement)**: none. `user`/`session`/
`member` are unmodified. This is the schema change that isn't one, and it is called out
explicitly (not silently) per SCHEMA-GATE-78 discipline.

## D2 — Where sign-in/sign-up live: nested static segments under `/view`

**Decision**: `/view/sign-in` and `/view/sign-up`, both static Next.js segments inside
the existing `(client-view)/view/` directory.

**Rationale**: Next.js App Router route groups (parenthesized directories) contribute no
URL segment, so `(workspace)` already owns the top-level paths `/sign-in` and `/sign-up`
— a second top-level page at either path from `(client-view)` would be a duplicate-route
build error. Nesting under `/view/` avoids the collision entirely and reads naturally as
"the client-view's own sign-in." Next.js resolves static segments (`/view/sign-in`)
ahead of the sibling dynamic segment (`/view/[token]`) at the same path depth — this is
standard route-resolution priority, not a new mechanism, so no existing `/view/<token>`
share link can ever collide with these paths (a real share token is a UUID, never the
literal string `sign-in` or `sign-up`).

**Alternatives considered**:
- *Query-param toggle on `/view/[token]` itself* (e.g. `?auth=sign-in`) — rejected: would
  make the dynamic page responsible for two unrelated concerns (itinerary rendering vs.
  auth forms) and complicate the token-resolution `cache()` dedupe already in place.
- *A new top-level route group* (e.g. `(client-auth)`) — rejected: unnecessary
  indirection for two pages; `(client-view)` already owns "traveler-facing, no agency
  affordances" as its defining property, which is exactly what these pages need.

## D3 — Server-side session read for `(client-view)`: extend `createTrpcContext`, don't duplicate it

**Decision**: `apps/web/lib/trpc/server.ts` gains `getAuthenticatedCaller(headers)` =
`createAppCaller(await createTrpcContext(headers))`. `createTrpcContext` already exists
(used by the mounted `/api/trpc` HTTP route) and already calls `getSessionContext(headers)`
— nothing new is added to the session-derivation path itself.

**Rationale**: `getAnonymousCaller()` (spec 010 research D3) is the zero-session
precedent for an in-process server-component caller; this is the same shape with a real
(possibly-null) session instead of a hardcoded `null`. Reusing `createTrpcContext` means
the traveler-vs-agent ladder logic lives in exactly one place (`apps/web/lib/auth.ts`),
never duplicated.

**Alternatives considered**:
- *Call `getSessionContext` directly in `page.tsx` and build a context inline* — rejected:
  would duplicate `createTrpcContext`'s container-wiring logic in a second place.
- *Always use `getAuthenticatedCaller` and delete `getAnonymousCaller`* — rejected: several
  other server components (see `grep -rn getAnonymousCaller apps/web`) intentionally want
  a guaranteed-null session (defense in depth for surfaces that must never accidentally
  branch on session state); only `view/[token]/page.tsx` needs the new capability.

## D4 — `clientView.me`: a new procedure on the existing router, first use of `protectedProcedure`

**Decision**: `me: protectedProcedure.query(({ ctx }) => getSignedInIdentity(ctx.container, ctx.session.userId))`
mounted on the existing `clientViewRouter`.

**Rationale**: `protectedProcedure` (`packages/api/src/trpc.ts:19-24`) is already defined
and documented ("Any authenticated user (agent or traveler)") but was, until this
feature, mounted nowhere — confirmed by `grep -rn protectedProcedure packages/api/src`
matching only its own definition and the barrel re-export. It is exactly the trust tier
this procedure needs: reject anonymous callers, accept both traveler and agent sessions
(FR-005 — an agent's own identity is not sensitive to that agent).

**Alternatives considered**:
- *A new `agentOrTraveler`-named middleware* — rejected: `protectedProcedure` already
  means exactly this; renaming or duplicating it would fragment the one obvious name.
- *Bake identity into `clientView.itinerary`'s response* — rejected: would couple two
  independent concerns (the itinerary payload, an allowlist-audited trust boundary per
  spec 010, and the caller's own account echo) into one response shape, and would force
  every itinerary fetch to also read the `user` table even when no form pre-fill is in
  play (e.g., the anonymous 99% case).

## D5 — Trust boundary for `clientView.me`: scoped to `ctx.session.userId`, never client input

**Decision**: The query takes no `userId` input parameter at all — it reads exclusively
`ctx.session.userId`, which the `protectedProcedure` middleware derives server-side from
the verified Better Auth session. There is no code path by which a caller can request
another user's identity through this procedure.

**Rationale**: This is the same "authorization is never a client-supplied parameter"
discipline every other tenant/identity-scoped procedure in this codebase already follows
(INV-004/023) — mirrors `workspace.whoami`'s shape exactly (`packages/api/src/routers/workspace.ts:14-25`),
substituting the traveler-or-agent tier for the agent-only tier.

## D6 — `TripFork` pre-fill: `defaultValue`, not a controlled input rewrite

**Decision**: `contactName`/`contactEmail` inputs gain `defaultValue={identity?.name ?? ""}`
/ `defaultValue={identity?.email ?? ""}`; the component's existing `FormData`-based
uncontrolled submit handler is untouched.

**Rationale**: The existing form (`apps/web/app/(client-view)/view/[token]/trip-fork.tsx`)
is deliberately uncontrolled (no `useState` per field, no `onChange`) — converting it to
controlled inputs just to add a default value would be a larger, riskier diff for no
behavioral gain, since `defaultValue` already gives the exact required semantics:
pre-filled, but freely editable, and the value present at submit time (edited or not) is
what `FormData` reads regardless of whether it came from the default or a keystroke.

**Alternatives considered**:
- *Controlled inputs + `useState` seeded from `identity`* — rejected: strictly more code
  for identical observable behavior; also risks a stale-closure bug if `identity` arrives
  after first render (it won't, here — it's server-fetched — but `defaultValue` sidesteps
  the question entirely).
