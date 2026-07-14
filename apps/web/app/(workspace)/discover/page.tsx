// Discover / "What's Hot" feed (spec 023, ticket demo-08-discover) — route
// group (workspace), INV-024. Replaces the prior "coming soon" placeholder
// (spec 017 research D7) with the real curated feed; the operator-authorized
// P2 scope decision for this build is recorded in spec 023's plan.md
// Constitution Check. Server component: same verified-agent gate as every
// other destination — only the body changed.
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { DiscoverFeedView } from "./discover-feed-view.js";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell identity={identity} activeNav="discover" guardTitle="Discover" guardVerb="use Discover">
      <header>
        <p className="tf-eyebrow">Discover</p>
        <h1>What&apos;s hot</h1>
        <p>Pick a destination for trending places and experiences — tap any card to start planning it.</p>
      </header>
      <DiscoverFeedView />
    </WorkspacePageShell>
  );
}
