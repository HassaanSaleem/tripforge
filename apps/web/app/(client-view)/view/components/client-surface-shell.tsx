// Shared shell for the SIGNED-IN traveler consumer surface (spec 037): a
// persistent brand-neutral nav sidebar + the page's <main> content. The traveler
// analog of the agent WorkspacePageShell, but DISTINCT (INV-024) and deliberately
// WITHOUT the agency identity header, role badge, membership guard, or "TripForge"
// wordmark that shell carries — all forbidden on the client surface (INV-020
// negatives / INV-024).
//
// The whole shell is wrapped in `data-plain` so the existing brand-neutral CSS
// treatment (e.g. suppressing the `.tf-brand` diamond) applies across the signed-in
// surface. Server component, no "use client" — only the reused TravelerSignOut
// control (inside the sidebar) is a client boundary.
//
// This shell is attached PER SIGNED-IN RENDER BRANCH (view/page.tsx signed-in
// branch, my-trips post-redirect), never as a route-group layout — a layout would
// wrap the anonymous /view welcome, the /view/[token] white-label proposal, and the
// auth screens, leaking the panel onto brand-neutral surfaces (FR-005).
import type { ReactNode } from "react";
import type { ClientNavDestinationId } from "../../../../lib/client-nav.js";
import { ClientNavSidebar } from "./client-nav-sidebar.js";

interface ClientSurfaceShellProps {
  activeNav: ClientNavDestinationId;
  travelerName: string | null;
  children: ReactNode;
}

export function ClientSurfaceShell({ activeNav, travelerName, children }: ClientSurfaceShellProps) {
  return (
    <div data-plain className="tf-app-shell tf-client-shell">
      <ClientNavSidebar activeNav={activeNav} travelerName={travelerName} />
      <div className="tf-app-shell-content">
        <main className="tf-client-main">{children}</main>
      </div>
    </div>
  );
}
