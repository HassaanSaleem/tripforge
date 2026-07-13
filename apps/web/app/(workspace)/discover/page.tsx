// Discover PLACEHOLDER (spec 017 research D7) — route group (workspace),
// INV-024. The sidebar names Discover as a destination (operator ask), but
// the actual "What's Hot" feed is roadmap-gated at P2 (kitchenloop.yaml
// spec.blocked: whats-hot-feed) and separately ticketed (demo-08-discover).
// This page is a static, honestly-labeled coming-soon card — no data fetch,
// no feed logic. Server component: same verified-agent gate as every other
// destination.
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell identity={identity} activeNav="discover" guardTitle="Discover" guardVerb="use Discover">
      <header>
        <p className="tf-eyebrow">Discover</p>
        <h1>Coming soon</h1>
      </header>
      <section className="tf-card" data-testid="discover-placeholder">
        <p>
          A "What's Hot" inspiration feed — trending places and experiences by destination, one tap from a plannable,
          budget-priced itinerary — is on the roadmap. It isn't built yet.
        </p>
      </section>
    </WorkspacePageShell>
  );
}
