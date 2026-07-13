// /sign-up — self-serve agency onboarding (spec 007 US2, INV-024 platform
// side). Server component: an already-signed-in AGENT is sent to the workspace
// (research D7); everyone else sees the form.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "../../../lib/auth.js";
import { SignUpForm } from "./sign-up-form.js";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const session = await getSessionContext(await headers());
  if (session?.agencyId) {
    redirect("/workspace");
  }

  return (
    <main className="tf-auth-shell">
      <div className="tf-auth-card">
        <p className="tf-brand">TripForge</p>
        <p className="tf-auth-tagline">Set up your agency workspace — you will be its owner.</p>
        <div className="tf-card">
          <SignUpForm />
        </div>
        <p className="tf-auth-foot">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
