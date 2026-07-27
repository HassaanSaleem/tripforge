// Shared shell for every authenticated page (dashboard, workspace, trips,
// marketplace, media, discover): the membership-gate card shown to a
// non-member, and — for a verified agent — the persistent sidebar (spec 017
// research D3) + branded top header (identity, unchanged) wrapping the
// page-specific <main> content. Extracted per the clean-architecture
// extraction threshold (2+ callsites share a shape) — quality-sweep iter-3
// QS3-7; extended (not duplicated) for the dashboard app shell.
import type { ReactNode } from "react";
import Link from "next/link";
import type { WorkspaceIdentity } from "../../../lib/auth.js";
import type { NavDestinationId } from "../../../lib/nav.js";
import { SignOutButton } from "../workspace/sign-out-button.js";
import { AppSidebar } from "./app-sidebar.js";

interface WorkspacePageShellProps {
  identity: WorkspaceIdentity | null;
  activeNav: NavDestinationId;
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
          <p className="tf-guard-traveler">
            Not an agent? If a travel agent shared a trip with you,{" "}
            <Link href="/view">go to your trips</Link>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="tf-app-shell">
      <AppSidebar activeNav={activeNav} />
      <div className="tf-app-shell-content">
        <header className="tf-header tf-workspace-header">
          <span className="tf-brand">TripForge</span>
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
      </div>
    </div>
  );
}
