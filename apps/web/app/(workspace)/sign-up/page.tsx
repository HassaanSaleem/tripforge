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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Create your account and agency</h1>
      <p>Set up your agency workspace — you will be its owner.</p>
      <SignUpForm />
      <p>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
