// /sign-in — session-establishment surface (spec 007 US1, INV-024 platform
// side). Server component: an already-signed-in AGENT is sent straight to the
// workspace (research D7); anonymous visitors and travelers see the form.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "../../../lib/auth.js";
import { SignInForm } from "./sign-in-form.js";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getSessionContext(await headers());
  if (session?.agencyId) {
    redirect("/workspace");
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Sign in</h1>
      <p>Sign in to your agency workspace.</p>
      <SignInForm />
      <p>
        New here? <Link href="/sign-up">Create an account and agency</Link>
      </p>
    </main>
  );
}
