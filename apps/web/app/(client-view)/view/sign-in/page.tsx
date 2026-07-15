// /view/sign-in — OPTIONAL traveler sign-in (spec 030 FR-001, contracts §2).
// Static Next.js segment: resolved ahead of the sibling dynamic /view/[token]
// route, so no real share token (always a uuid) can ever collide with this
// path (research D2). Brand-neutral (INV-020) — carries no platform naming
// beyond the neutral "Your account" copy already used elsewhere in this route
// group, and NEVER offers or links to agency/organization creation (INV-024).
// An already-signed-in visitor (traveler OR agent — there's nothing to do on
// a sign-in page either way) is redirected straight back to where they came
// from.
import { headers } from "next/headers";
import Link from "next/link";
import { ClientSignInForm } from "./client-sign-in-form.js";
import { resolveClientAuthReturnTo } from "../resolve-client-auth-return-to.js";
import { ClientAuthShell } from "../client-auth-shell.js";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ClientSignInPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const returnTo = await resolveClientAuthReturnTo(token, await headers());

  return (
    <ClientAuthShell
      tagline="Sign in to have your name and email fill in automatically."
      footer={
        <>
          New here?{" "}
          <Link href={`/view/sign-up${token ? `?token=${token}` : ""}`}>Create an account</Link>
        </>
      }
    >
      <ClientSignInForm returnTo={returnTo} />
    </ClientAuthShell>
  );
}
