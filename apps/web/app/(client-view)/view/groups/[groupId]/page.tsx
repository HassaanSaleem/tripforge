// /view/groups/[groupId] — a single group's detail (spec 040): roster,
// confirmation state, in-group chat, and the organizer's finalize/cancel gate.
// Signed-in members only — a non-member (or an unknown group) gets the SAME
// "no access" card (no existence oracle, FR-005). Brand-neutral (INV-020).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "../../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "../../components/client-surface-shell.js";
import { GroupDetailPanel } from "./group-detail-panel.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Group trip",
  description: "Coordinate your group trip — chat, confirm, and finalize together.",
};

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  const [identity, detail] = await Promise.all([
    caller.clientView.me(),
    caller.clientView.groups.get({ groupId }),
  ]);
  const name = identity?.name?.trim() || null;

  if (detail.status !== "ok") {
    return (
      <ClientSurfaceShell activeNav="groupTrips" travelerName={name}>
        <header className="tf-client-head">
          <p className="tf-eyebrow">Group trips</p>
          <h1>This group isn&rsquo;t available</h1>
        </header>
        <section className="tf-card">
          <p className="tf-empty-day" data-testid="group-detail-forbidden">
            You don&rsquo;t have access to this group, or it no longer exists. Only members can open a group.
          </p>
          <p>
            <Link href="/view/groups" className="tf-link-btn">
              Back to my groups
            </Link>
          </p>
        </section>
      </ClientSurfaceShell>
    );
  }

  return (
    <ClientSurfaceShell activeNav="groupTrips" travelerName={name}>
      <GroupDetailPanel group={detail.group} />
    </ClientSurfaceShell>
  );
}
