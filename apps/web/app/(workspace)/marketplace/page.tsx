// Agency MARKETPLACE surface (spec 011 contract §1) — route group (workspace),
// INV-024. Server component: reads the real session context and only mounts
// the trading panel for a verified agent; everyone else sees the membership
// prompt and NO marketplace data is fetched (FR-001/SC-005). Authorization for
// DATA still happens per tRPC procedure (INV-023) — this gate is UX, not the
// security boundary. Presentation rides the seed-0009s theme kit (.tf-*).
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { WorkspacePageShell } from "../components/workspace-page-shell.js";
import { MarketplacePanel } from "./marketplace-panel.js";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const identity = await getWorkspaceIdentity(await headers());

  return (
    <WorkspacePageShell
      identity={identity}
      activeNav="marketplace"
      guardTitle="Agent marketplace"
      guardVerb="trade on the marketplace"
    >
      <header>
        <p className="tf-eyebrow">Agent marketplace</p>
        <h1>Trade finished trips</h1>
        <p>
          License proven itineraries from other agencies as white-label copies under your
          brand — or list your own and earn a share on every resale. Provenance and
          revenue share are enforced by the platform on every trade.
        </p>
      </header>
      <MarketplacePanel />
    </WorkspacePageShell>
  );
}
