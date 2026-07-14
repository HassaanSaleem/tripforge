// Agency TRIP REQUESTS surface (spec 022 contracts §2/§3) — route group
// (workspace), INV-024. Server component: reads the real session context and
// only mounts the panel for a verified agent; everyone else sees the
// membership prompt and NO request data is fetched (group-travel/page.tsx
// precedent). Authorization for DATA still happens per tRPC procedure
// (INV-023) — this gate is UX, not the security boundary.
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { TripHandoffsPanel } from "../workspace/trip-handoffs-panel.js";

export const dynamic = "force-dynamic";

export default async function TripRequestsPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell
      identity={identity}
      activeNav="tripHandoffs"
      guardTitle="Trip requests"
      guardVerb="view incoming trip requests"
    >
      <header>
        <p className="tf-eyebrow">Trip requests</p>
        <h1>Clients asking for your help</h1>
        <p>
          When a traveler views their shared trip and chooses &quot;Have an agent arrange
          this for me,&quot; it lands here with their contact and notes.
        </p>
      </header>
      <TripHandoffsPanel />
    </WorkspacePageShell>
  );
}
