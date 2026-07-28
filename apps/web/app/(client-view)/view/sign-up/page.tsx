// /view/sign-up — OPTIONAL traveler account creation (spec 030 FR-002,
// contracts §3). Static Next.js segment, same non-collision reasoning as
// /view/sign-in (research D2). Deliberately offers NO agency/organization
// step anywhere (INV-024) — the created account stays a traveler by
// construction (research D1). An already-signed-in visitor is redirected
// straight back to where they came from, same as /view/sign-in.
import { headers } from "next/headers";
import Link from "next/link";
import { ClientSignUpForm } from "./client-sign-up-form.js";
import { resolveClientAuthReturnTo } from "../resolve-client-auth-return-to.js";
import { ClientAuthShell } from "../client-auth-shell.js";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ClientSignUpPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const returnTo = await resolveClientAuthReturnTo(token, await headers());

  return (
    <ClientAuthShell
      tagline="Create an account to keep your trips in one place and fill in your name and email automatically."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/view/sign-in${token ? `?token=${token}` : ""}`}>Sign in</Link>
        </>
      }
    >
      <ClientSignUpForm returnTo={returnTo} />
    </ClientAuthShell>
  );
}
