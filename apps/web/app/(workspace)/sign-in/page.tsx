// /sign-in — session-establishment surface (spec 007 US1, INV-024 platform
// side). Server component: an already-signed-in AGENT is sent straight to
// the dashboard (research D7, spec 017 D1 — new post-sign-in default);
// anonymous visitors and travelers see the form.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "../../../lib/auth.js";
import { SignInForm } from "./sign-in-form.js";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getSessionContext(await headers());
  if (session?.agencyId) {
    redirect("/dashboard");
  }

  return (
    <main className="tf-auth-shell">
      <div className="tf-auth-card">
        <p className="tf-brand">TripForge</p>
        <p className="tf-auth-tagline">Sign in to your agency workspace.</p>
        <div className="tf-card">
          <SignInForm />
        </div>
        <p className="tf-auth-foot">
          New here? <Link href="/sign-up">Create an account and agency</Link>
        </p>
        <p className="tf-auth-foot">
          Traveler with a trip link? <Link href="/view/sign-in">Sign in to view your trips</Link>
        </p>
      </div>
    </main>
  );
}
