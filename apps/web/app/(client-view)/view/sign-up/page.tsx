// /view/sign-up — OPTIONAL traveler account creation (spec 030 FR-002,
// contracts §3). Static Next.js segment, same non-collision reasoning as
// /view/sign-in (research D2). Deliberately offers NO agency/organization
// step anywhere (INV-024) — the created account stays a traveler by
// construction (research D1). An already-signed-in visitor is redirected
// straight back to where they came from, same as /view/sign-in.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "../../../../lib/auth.js";
import { ClientSignUpForm } from "./client-sign-up-form.js";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ClientSignUpPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const returnTo = token ? `/view/${token}` : "/view";

  const session = await getSessionContext(await headers());
  if (session) {
    redirect(returnTo);
  }

  return (
    <div data-plain className="tf-client-root">
      <main className="tf-auth-shell">
        <div className="tf-auth-card">
          <p className="tf-auth-tagline">Create an account to have your name and email fill in automatically.</p>
          <div className="tf-card">
            <ClientSignUpForm returnTo={returnTo} />
          </div>
          <p className="tf-auth-foot">
            Already have an account?{" "}
            <Link href={`/view/sign-in${token ? `?token=${token}` : ""}`}>Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
