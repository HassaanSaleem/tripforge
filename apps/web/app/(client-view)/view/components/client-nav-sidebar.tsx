// Persistent left navigation for the SIGNED-IN traveler consumer surface
// (spec 037, ticket goal-client-side-panel). Mirrors the agent AppSidebar shape
// — reads the single nav source of truth (lib/client-nav.ts), a checkbox-driven
// CSS collapse (no "use client", no React state) reusing the shared
// `.tf-sidebar-*` theme kit — but is a DISTINCT consumer module (INV-024:
// navigation separated by user type). It is brand-neutral: it carries NO
// "TripForge"/"Trellis" wordmark (INV-020 negative, pinned by
// trust-boundary.spec.ts / traveler-home-journey.spec.ts) and NO agency/workspace
// affordance (INV-024). Not-yet-built sections render as non-link "coming soon"
// signposts (no dead ends, FR-003).
import Link from "next/link";
import {
  CLIENT_NAV_DESTINATIONS,
  type ClientNavDestinationId,
  type ClientNavIconKind,
} from "../../../../lib/client-nav.js";
import { TravelerSignOut } from "../traveler-home.js";

interface ClientNavSidebarProps {
  activeNav: ClientNavDestinationId;
  travelerName: string | null;
}

function NavIcon({ kind }: { kind: ClientNavIconKind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </svg>
      );
    case "suitcase":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5Z" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-2 6-6 2 2-6z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="17" cy="9" r="2.3" />
          <path d="M17.5 12c2.2.4 4 2.3 4 4.6" />
        </svg>
      );
  }
}

export function ClientNavSidebar({ activeNav, travelerName }: ClientNavSidebarProps) {
  return (
    <>
      {/* Distinct id from the agent toggle; the CSS collapse is keyed on the
          shared `.tf-sidebar-toggle-input` CLASS (sibling combinator), so reusing
          the theme kit needs only the classes, not the id. */}
      <input type="checkbox" id="tf-client-nav-toggle" className="tf-sidebar-toggle-input" />
      <label htmlFor="tf-client-nav-toggle" className="tf-sidebar-toggle-btn" aria-label="Toggle navigation">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </label>
      {/* Landmark labelled "Traveler navigation" (NOT the agent "Main navigation")
          so cross-surface Playwright selectors never collide (research R4). */}
      <nav className="tf-sidebar tf-client-nav" aria-label="Traveler navigation" data-testid="client-nav">
        {/* Brand-neutral wordmark — never "TripForge"/"Trellis" (INV-020). Under
            the shell's data-plain the `.tf-brand` diamond mark is suppressed. */}
        <p className="tf-brand tf-sidebar-brand tf-client-nav-brand">Your travel</p>
        <ul>
          {CLIENT_NAV_DESTINATIONS.map((dest) => (
            <li key={dest.id}>
              {dest.status === "live" && dest.href ? (
                <Link
                  href={dest.href}
                  aria-current={activeNav === dest.id ? "page" : undefined}
                  data-testid={`client-nav-${dest.id}`}
                >
                  <NavIcon kind={dest.icon} />
                  <span>{dest.label}</span>
                </Link>
              ) : (
                <span
                  className="tf-client-nav-soon"
                  aria-disabled="true"
                  data-testid={`client-nav-${dest.id}`}
                >
                  <NavIcon kind={dest.icon} />
                  <span>{dest.label}</span>
                  <span className="tf-client-nav-soon-badge">Soon</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="tf-client-nav-account" data-testid="client-nav-account">
          {travelerName ? <span className="tf-client-nav-name">{travelerName}</span> : null}
          <TravelerSignOut />
        </div>
      </nav>
    </>
  );
}
