// Agency MARKETPLACE surface (spec 011 contract §1) — route group (workspace),
// INV-024. Server component: reads the real session context and only mounts
// the trading panel for a verified agent; everyone else sees the membership
// prompt and NO marketplace data is fetched (FR-001/SC-005). Authorization for
// DATA still happens per tRPC procedure (INV-023) — this gate is UX, not the
// security boundary. Presentation rides the seed-0009s theme kit (.tf-*).
import Link from "next/link";
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { SignOutButton } from "../workspace/sign-out-button.js";
import { MarketplacePanel } from "./marketplace-panel.js";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const identity = await getWorkspaceIdentity(await headers());

  if (!identity) {
    return (
      <main>
        <section className="tf-card">
          <p className="tf-eyebrow">TripForge</p>
          <h1>Agent marketplace</h1>
          <p>
            You need an agency membership to trade on the marketplace.{" "}
            <Link href="/sign-in">Sign in</Link> via the agency you belong to, or{" "}
            <Link href="/sign-up">create an account and agency</Link>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="tf-header tf-workspace-header">
        <span className="tf-brand">TripForge</span>
        <nav className="tf-nav" aria-label="Workspace">
          <Link href="/workspace">Workspace</Link>
          <Link href="/marketplace" aria-current="page">
            Marketplace
          </Link>
        </nav>
        <div className="tf-id">
          <b>{identity.userName}</b>
          <i className="sep" aria-hidden="true" />
          <span>{identity.agencyName}</span>
          <span>
            role <span className="tf-badge">{identity.role}</span>
          </span>
          <span className="tf-signout">
            <SignOutButton />
          </span>
        </div>
      </header>
      <main className="tf-workspace-main">
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
      </main>
    </>
  );
}
