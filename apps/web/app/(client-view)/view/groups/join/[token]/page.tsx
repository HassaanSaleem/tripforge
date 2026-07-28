// /view/groups/join/[token] — invite landing (spec 040). A verified premium
// traveler opens an invite and joins the group. Signed-in only (redirect to
// sign-in otherwise — the invite is re-openable after signing in). Brand-neutral
// (INV-020). The join itself, and the eligibility gate, run server-side through
// clientView.groups.* (INV-018/024); this page just reads the caller's
// eligibility so the panel can prompt to verify first if needed.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "../../../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "../../../components/client-surface-shell.js";
import { JoinGroupPanel } from "./join-group-panel.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Join a group trip",
  description: "You’ve been invited to plan a trip together.",
};

export default async function JoinGroupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  const [identity, membership] = await Promise.all([
    caller.clientView.me(),
    caller.clientView.groups.membership(),
  ]);
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="groupTrips" travelerName={name}>
      <header className="tf-client-head">
        <p className="tf-eyebrow">You&rsquo;re invited</p>
        <h1>Join a group trip</h1>
        <p>A friend invited you to plan a trip together.</p>
      </header>
      <JoinGroupPanel inviteToken={token} eligible={membership.eligible} />
    </ClientSurfaceShell>
  );
}
