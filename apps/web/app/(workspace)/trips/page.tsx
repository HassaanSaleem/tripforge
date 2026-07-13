// Agency TRIPS surface (spec 017 research D1) — route group (workspace),
// INV-024. Split out of the old combined /workspace page: same underlying
// panel (ItineraryList), its own nav destination. Server component: reads
// the real session context and only mounts the panel for a verified agent.
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { ItineraryList } from "../workspace/itinerary-list.js";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell identity={identity} activeNav="trips" guardTitle="Agency trips" guardVerb="view your trips">
      <header>
        <p className="tf-eyebrow">Trips</p>
        <h1>Your agency's trips</h1>
        <p>Every trip you've drafted, booked, or licensed — newest first.</p>
      </header>
      <ItineraryList />
    </WorkspacePageShell>
  );
}
