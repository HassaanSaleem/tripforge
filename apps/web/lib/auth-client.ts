// Better Auth BROWSER actions (spec 007 research D3) — drive the existing
// catch-all /api/auth/* endpoints from client components (sign-in, sign-up,
// sign-out, organization create/set-active). Same-origin base URL; the
// organization plugin mirrors the server's agency-as-organization setup.
// No new dependency: the client entry points ship inside better-auth.
//
// The raw client stays module-private behind explicitly-typed wrappers: its
// inferred type references better-auth's internal dist paths and is not
// portable across the pnpm workspace (TS2742), and the narrow wrappers are
// the whole surface the forms need.
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
  plugins: [organizationClient()],
});

/** null = success; string = human-readable failure message (FR-004). */
export type AuthActionError = string | null;

export async function signInWithEmail(email: string, password: string): Promise<AuthActionError> {
  const { error } = await authClient.signIn.email({ email, password });
  return error ? (error.message ?? "Sign-in failed.") : null;
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthActionError> {
  const { error } = await authClient.signUp.email({ name, email, password });
  return error ? (error.message ?? "Could not create the account.") : null;
}

/** Creates the agency (caller becomes owner) and makes it the session's active org. */
export async function createAndActivateAgency(
  name: string,
  slug: string,
): Promise<AuthActionError> {
  const org = await authClient.organization.create({ name, slug });
  if (org.error || !org.data) {
    return org.error?.message ?? "Could not create the agency.";
  }
  const setActive = await authClient.organization.setActive({ organizationId: org.data.id });
  return setActive.error ? (setActive.error.message ?? "Could not activate the agency.") : null;
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}
