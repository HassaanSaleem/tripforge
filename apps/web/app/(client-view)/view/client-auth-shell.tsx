// Shared page shell for /view/sign-in and /view/sign-up (spec 030) — the two
// pages render the identical `tf-auth-*` card structure around different
// copy/form/footer content (quality sweep, specs 028-031).
import type { ReactNode } from "react";

export function ClientAuthShell({
  tagline,
  children,
  footer,
}: {
  tagline: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div data-plain className="tf-client-root">
      <main className="tf-auth-split">
        {/* Brand-neutral story panel (INV-020): no platform name, no ◇ mark,
            no product shot — gradient only, so /view stays white-label. */}
        <aside className="tf-auth-aside tf-auth-aside--plain" aria-hidden="true">
          <span />
          <div style={{ display: "grid", gap: 14 }}>
            <p className="tf-eyebrow">Your trips, saved</p>
            <h2>Sign in to keep every trip in one place.</h2>
            <p className="tf-auth-aside-lede">
              See the itineraries your travel planner shared with you, and pick up right where you
              left off.
            </p>
          </div>
          <span />
        </aside>
        <div className="tf-auth-panel">
          <div className="tf-auth-card">
            <p className="tf-auth-tagline">{tagline}</p>
            <div className="tf-card">{children}</div>
            <p className="tf-auth-foot">{footer}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
