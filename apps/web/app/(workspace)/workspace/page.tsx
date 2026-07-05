// Agency WORKSPACE surface (agents) — route group (workspace), INV-024. Server
// component: it reads the real session context and only greets a verified agent;
// a non-agent sees a sign-in prompt. Authorization for DATA still happens per tRPC
// procedure (INV-023) — this page gate is UX, not the security boundary.
import { headers } from "next/headers";
import { getSessionContext } from "../../../lib/auth.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await getSessionContext(await headers());
  const isAgent = !!session?.agencyId;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>Agency workspace</h1>
      {isAgent ? (
        <p>
          Signed in as agent <code>{session!.userId}</code> · agency{" "}
          <code>{session!.agencyId}</code> · role <code>{session!.agencyRole}</code>.
        </p>
      ) : (
        <p>
          You need an agency membership to use the workspace. Please sign in via the
          agency you belong to.
        </p>
      )}
    </main>
  );
}
