// Agency WORKSPACE surface (agents) — route group (workspace), INV-024. Server
// component: it reads the real session context and only greets a verified agent;
// a non-agent sees a sign-in prompt. Authorization for DATA still happens per tRPC
// procedure (INV-023) — this page gate is UX, not the security boundary.
// Greeting shows HUMAN names (user, agency, role) — never raw IDs (spec 007
// FR-006 / triage IMP-2).
import Link from "next/link";
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { SignOutButton } from "./sign-out-button.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>Agency workspace</h1>
      {identity ? (
        <>
          <p>
            Signed in as <strong>{identity.userName}</strong> ·{" "}
            <strong>{identity.agencyName}</strong> · role <strong>{identity.role}</strong>.
          </p>
          <SignOutButton />
        </>
      ) : (
        <p>
          You need an agency membership to use the workspace.{" "}
          <Link href="/sign-in">Sign in</Link> via the agency you belong to, or{" "}
          <Link href="/sign-up">create an account and agency</Link>.
        </p>
      )}
    </main>
  );
}
