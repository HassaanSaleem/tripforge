// Persistent left sidebar for the authenticated shell (spec 017 research
// D3/D4/D8). Reads the single nav source of truth (lib/nav.ts) — adding a
// destination there is the only change needed to add it here. The narrow-
// viewport collapse is a checkbox-driven CSS toggle (research D4): no
// "use client" boundary, no React state, so this stays a plain server-
// renderable component like the rest of the authenticated shell.
import Link from "next/link";
import { NAV_DESTINATIONS, type NavDestinationId, type NavIconKind } from "../../../lib/nav.js";

interface AppSidebarProps {
  activeNav: NavDestinationId;
}

function NavIcon({ kind }: { kind: NavIconKind }) {
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
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5Z" />
        </svg>
      );
    case "suitcase":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "storefront":
      return (
        <svg {...common}>
          <path d="M3 9l1-5h16l1 5" />
          <path d="M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9" />
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
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="M21 15l-5-5-4 4-2-2-6 6" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-2 6-6 2 2-6z" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M3 12h4.5l1.5 3h6l1.5-3H21" />
          <path d="M5.5 5h13l2.5 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
        </svg>
      );
  }
}

export function AppSidebar({ activeNav }: AppSidebarProps) {
  return (
    <>
      <input type="checkbox" id="tf-sidebar-toggle" className="tf-sidebar-toggle-input" />
      <label htmlFor="tf-sidebar-toggle" className="tf-sidebar-toggle-btn" aria-label="Toggle navigation">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </label>
      <nav className="tf-sidebar" aria-label="Main navigation">
        <p className="tf-brand tf-sidebar-brand">TripForge</p>
        <ul>
          {NAV_DESTINATIONS.map((dest) => (
            <li key={dest.id}>
              <Link href={dest.href} aria-current={activeNav === dest.id ? "page" : undefined}>
                <NavIcon kind={dest.icon} />
                <span>{dest.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
