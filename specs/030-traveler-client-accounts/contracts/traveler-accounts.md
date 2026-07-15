# Contract: `clientView.me` (tRPC) + client-view sign-in/sign-up (Better Auth)

Not a money path. `clientView.me` is `protectedProcedure`-gated (INV-023): anonymous →
401 UNAUTHORIZED. Both signed-in travelers and signed-in agents succeed (FR-005) — the
procedure returns only the caller's own identity, so there is nothing to authorize beyond
"is there a verified session at all." Sign-in/sign-up ride the existing Better Auth
`/api/auth/*` endpoints unchanged — no new server-side auth endpoint is added; the only
new server code is `clientView.me` and the `getUserIdentity`/`getSignedInIdentity` reads
behind it.

## §1 `clientView.me` (query) — FR-004/005

Input: `{}` (no parameters — identity comes exclusively from the verified session,
research D5).

Output:

```ts
{ name: string; email: string }
```

- Anonymous caller (no session): throws `UNAUTHORIZED`. The client-view page never calls
  this procedure without first confirming a session exists server-side (it fetches
  identity server-side via `getAuthenticatedCaller`, which already knows whether a
  session is present — see `apps/web/app/(client-view)/view/[token]/page.tsx`), so in
  practice this branch is defense-in-depth, not a path the UI drives into.
- Signed-in traveler or signed-in agent: returns `{ name, email }` from their own `user`
  row. There is no `status`/discriminated-union wrapper (unlike `resolveShareLink`'s
  `not_found` precedent) because there is no "not found" case — a valid session always
  has a corresponding `user` row (Better Auth guarantees this).

Server behavior: `getSignedInIdentity(container, ctx.session.userId)` — one primary-key
select on `user`, no join, no tenant scoping needed (there is nothing to scope; see
data-model.md).

## §2 Client-view sign-in — reuses Better Auth `signIn.email`, no new server endpoint

`apps/web/app/(client-view)/view/sign-in/page.tsx` (server component):

- Reads `?token=<uuid>` (optional) from the URL and the current session
  (`getSessionContext`).
- If a session already exists (traveler OR agent — either way there's nothing to do on a
  sign-in page), redirects immediately to `/view/${token}` if a token was given, else
  `/view`.
- Otherwise renders `<ClientSignInForm returnTo={token ? `/view/${token}` : "/view"} />`.

`client-sign-in-form.tsx` (client component): calls the EXISTING `signInWithEmail(email, password)`
(`apps/web/lib/auth-client.ts`, unchanged) and on success `router.push(returnTo)` +
`router.refresh()` — same two-call shape as the workspace's `sign-in-form.tsx`, just a
different redirect target.

## §3 Client-view sign-up — reuses Better Auth `signUp.email`, deliberately skips agency creation

`apps/web/app/(client-view)/view/sign-up/page.tsx` (server component): same
redirect-if-already-signed-in shape as §2.

`client-sign-up-form.tsx` (client component): calls ONLY `signUpWithEmail(name, email, password)`
(`apps/web/lib/auth-client.ts`, unchanged) — **never** `createAndActivateAgency`. This
single omission is the entire mechanism by which the created account remains a traveler
(FR-002) — no separate "account type" selector, flag, or server-side branch exists or is
needed.

## Client-view UI contract (INV-020/024, extends spec 010 §"Client-view UI contract" / spec 022 §"Client-view UI contract")

- Both new pages render inside `apps/web/app/(client-view)/`, inheriting the route
  group's brand-neutral `layout.tsx` (INV-020) — same constraint as every existing
  client-view page.
- Neither page imports, links to, or can reach agency/organization creation
  (`createAndActivateAgency`) or any `(workspace)/` route (INV-024). This is verified
  both structurally (no such import exists in the new files) and by an e2e negative
  assertion (no "create an agency" text/field anywhere in the sign-up DOM).
- `TripFork` (`trip-fork.tsx`) gains an `identity: TravelerIdentity | null` prop, used
  ONLY to set `defaultValue` on the two existing contact inputs and to render a small
  sign-in/sign-out affordance; it introduces no new network call beyond the one the
  parent page already makes for `clientView.me` — `TripFork` itself never calls
  `clientView.me`.
- Sign-out reuses the existing `signOut()` (`apps/web/lib/auth-client.ts`, unchanged),
  followed by `router.refresh()`, landing the visitor back on the same `/view/[token]`
  page with `identity: null` — never redirected into the workspace.
