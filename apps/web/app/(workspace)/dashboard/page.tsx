// Agent HOME dashboard (spec 017) — route group (workspace), INV-024. Server
// component: reads the real session context and only mounts the dashboard
// for a verified agent; everyone else sees the membership prompt (same gate
// as every other authenticated destination). This is the new post-sign-in
// default (see sign-in/sign-up redirects).
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { DashboardHome } from "./dashboard-home.js";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell identity={identity} activeNav="dashboard" guardTitle="Agent dashboard" guardVerb="use the dashboard">
      <header>
        <p className="tf-eyebrow">Agent Home</p>
        <h1>Welcome back</h1>
        <p>Your agency's trips, marketplace activity, and earnings — at a glance.</p>
      </header>
      <DashboardHome />
    </WorkspacePageShell>
  );
}
