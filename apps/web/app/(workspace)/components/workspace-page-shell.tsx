// Shared shell for the two workspace-route-group pages (workspace, marketplace):
// the membership-gate card shown to a non-member, and — for a verified agent —
// the branded header (nav + identity) wrapping the page-specific <main> content.
// Extracted per the clean-architecture extraction threshold (2+ callsites share
// a shape) — quality-sweep iter-3 QS3-7.
import type { ReactNode } from "react";
import Link from "next/link";
import type { WorkspaceIdentity } from "../../../lib/auth.js";
import { SignOutButton } from "../workspace/sign-out-button.js";

interface WorkspacePageShellProps {
  identity: WorkspaceIdentity | null;
  activeNav: "workspace" | "marketplace";
  guardTitle: string;
  guardVerb: string;
  children: ReactNode;
}

export function WorkspacePageShell({ identity, activeNav, guardTitle, guardVerb, children }: WorkspacePageShellProps) {
  if (!identity) {
    return (
      <main>
        <section className="tf-card">
          <p className="tf-eyebrow">TripForge</p>
          <h1>{guardTitle}</h1>
          <p>
            You need an agency membership to {guardVerb}.{" "}
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
          <Link href="/workspace" aria-current={activeNav === "workspace" ? "page" : undefined}>
            Workspace
          </Link>
          <Link href="/marketplace" aria-current={activeNav === "marketplace" ? "page" : undefined}>
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
      <main className="tf-workspace-main">{children}</main>
    </>
  );
}
