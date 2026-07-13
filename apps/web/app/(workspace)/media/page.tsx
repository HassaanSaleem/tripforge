// Agency MEDIA library surface (spec 017 research D1) — route group
// (workspace), INV-024. Split out of the old combined /workspace page: same
// underlying panel (MediaLibraryPanel), its own nav destination. Server
// component: reads the real session context and only mounts the panel for a
// verified agent.
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { MediaLibraryPanel } from "../workspace/media-library-panel.js";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell identity={identity} activeNav="media" guardTitle="Agency media library" guardVerb="manage media">
      <header>
        <p className="tf-eyebrow">Media</p>
        <h1>Your media library</h1>
        <p>Register licensed, real imagery and attach it to your trips.</p>
      </header>
      <MediaLibraryPanel />
    </WorkspacePageShell>
  );
}
