// Agency WORKSPACE surface (agents) — route group (workspace), INV-024. Server
// component: it reads the real session context and only greets a verified agent;
// a non-agent sees a sign-in prompt. Authorization for DATA still happens per tRPC
// procedure (INV-023) — this page gate is UX, not the security boundary.
// Greeting shows HUMAN names (user, agency, role) — never raw IDs (spec 007
// FR-006 / triage IMP-2). Presentation rides the seed-0009s theme kit (.tf-*).
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { WorkspacePanels } from "./workspace-panels.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell
      identity={identity}
      activeNav="workspace"
      guardTitle="Agency workspace"
      guardVerb="use the workspace"
    >
      <header>
        <p className="tf-eyebrow">Agency workspace</p>
        <h1>Where to next?</h1>
        <p>
          Describe the trip and the budget — TripForge drafts a day-by-day,
          budget-fit itinerary priced from live inventory, ready to review,
          book, and share under your brand.
        </p>
      </header>
      <WorkspacePanels />
    </WorkspacePageShell>
  );
}
