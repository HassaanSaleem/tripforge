// AI Builder surface (agents) — route group (workspace), INV-024. Server
// component: it reads the real session context and only greets a verified agent;
// a non-agent sees a sign-in prompt. Authorization for DATA still happens per tRPC
// procedure (INV-023) — this page gate is UX, not the security boundary.
// Greeting shows HUMAN names (user, agency, role) — never raw IDs (spec 007
// FR-006 / triage IMP-2). Presentation rides the seed-0009s theme kit (.tf-*).
// Split out of the old combined workspace (spec 017 research D1/D2): this
// route now hosts only the planner — Trips and Media moved to their own nav
// destinations, so the same-page draft→list refresh signal is gone (a route
// change already gives Trips a fresh fetch on mount).
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { Planner } from "./planner.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell
      identity={identity}
      activeNav="builder"
      guardTitle="Agency workspace"
      guardVerb="use the AI Builder"
    >
      <header>
        <p className="tf-eyebrow">AI Builder</p>
        <h1>Where to next?</h1>
        <p>
          Describe the trip and the budget — TripForge drafts a day-by-day,
          budget-fit itinerary priced from live inventory, ready to review,
          book, and share under your brand.
        </p>
      </header>
      <Planner />
    </WorkspacePageShell>
  );
}
