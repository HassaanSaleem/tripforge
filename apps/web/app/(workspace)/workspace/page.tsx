// Agency WORKSPACE surface (agents) — route group (workspace), INV-024. Server
// component: it reads the real session context and only greets a verified agent;
// a non-agent sees a sign-in prompt. Authorization for DATA still happens per tRPC
// procedure (INV-023) — this page gate is UX, not the security boundary.
// Greeting shows HUMAN names (user, agency, role) — never raw IDs (spec 007
// FR-006 / triage IMP-2). Presentation rides the seed-0009s theme kit (.tf-*).
import Link from "next/link";
import { headers } from "next/headers";
import { getWorkspaceIdentity } from "../../../lib/auth.js";
import { SignOutButton } from "./sign-out-button.js";
import { WorkspacePanels } from "./workspace-panels.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const identity = await getWorkspaceIdentity(await headers());

  if (!identity) {
    return (
      <main>
        <section className="tf-card">
          <p className="tf-eyebrow">TripForge</p>
          <h1>Agency workspace</h1>
          <p>
            You need an agency membership to use the workspace.{" "}
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
          <Link href="/workspace" aria-current="page">
            Workspace
          </Link>
          <Link href="/marketplace">Marketplace</Link>
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
          <p className="tf-eyebrow">Agency workspace</p>
          <h1>Where to next?</h1>
          <p>
            Describe the trip and the budget — TripForge drafts a day-by-day,
            budget-fit itinerary priced from live inventory, ready to review,
            book, and share under your brand.
          </p>
        </header>
        <WorkspacePanels />
      </main>
    </>
  );
}
