// /view/groups — traveler group trips (spec 040). Static Next.js segment,
// resolved ahead of the sibling dynamic /view/[token] route (same precedent as
// /view/my-trips). Signed-in only (redirect to sign-in otherwise — no group data
// is ever computed for an unauthenticated request). Brand-neutral (INV-020).
// Reads the caller's membership, their groups, and their linked trips (the create
// picker) via the in-process caller (INV-018), then hands them to the client panel.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "../components/client-surface-shell.js";
import { GroupsPanel } from "./groups-panel.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Group trips",
  description: "Plan a trip together — invite friends, confirm, and finalize as a group.",
};

export default async function GroupsPage() {
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  const [identity, membership, groups, trips] = await Promise.all([
    caller.clientView.me(),
    caller.clientView.groups.membership(),
    caller.clientView.groups.mine(),
    caller.clientView.myTrips(),
  ]);
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="groupTrips" travelerName={name}>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Travel together</p>
        <h1>Group trips</h1>
        <p>Plan a trip with others — invite verified members, chat it through, and finalize once everyone&rsquo;s in.</p>
      </header>

      <GroupsPanel
        eligible={membership.eligible}
        groups={groups}
        trips={trips.map((t) => ({ token: t.token, title: t.title, agencyName: t.agencyName }))}
      />
    </ClientSurfaceShell>
  );
}
