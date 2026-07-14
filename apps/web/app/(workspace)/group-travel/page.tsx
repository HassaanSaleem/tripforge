// Agency GROUP TRAVEL surface (spec 021 contracts §1-4) — route group
// (workspace), INV-024. Server component: reads the real session context and
// only mounts the panel for a verified agent; everyone else sees the
// membership prompt and NO group-departure data is fetched (marketplace
// page.tsx precedent). Authorization for DATA still happens per tRPC
// procedure (INV-023) — this gate is UX, not the security boundary.
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { GroupTravelPanel } from "./group-travel-panel.js";

export const dynamic = "force-dynamic";

export default async function GroupTravelPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell
      identity={identity}
      activeNav="groupTravel"
      guardTitle="Group travel"
      guardVerb="post or join group departures"
    >
      <header>
        <p className="tf-eyebrow">Group travel</p>
        <h1>Post and join group departures</h1>
        <p>
          Post a finished itinerary as a group departure with a seat capacity and per-seat
          price — clients join a seat until it sells out, capacity conserved even under
          simultaneous joins. White-label a departure exactly like any marketplace listing to
          resell it under your own brand.
        </p>
      </header>
      <GroupTravelPanel />
    </WorkspacePageShell>
  );
}
