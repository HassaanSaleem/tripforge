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
      <main className="tf-auth-shell">
        <div className="tf-auth-card">
          <p className="tf-auth-tagline">{tagline}</p>
          <div className="tf-card">{children}</div>
          <p className="tf-auth-foot">{footer}</p>
        </div>
      </main>
    </div>
  );
}
