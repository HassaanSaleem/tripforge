// Shared public marketing nav (spec 032). Rendered on the three public
// marketing routes — the global landing (/), /for-travelers, and /for-agents —
// so the link labels and targets stay identical across pages (FR-009) and can't
// drift page-to-page. Server component: pure links, no client JS.
//
// Accessible names are deliberately disjoint from the home-body affordances and
// from each other (research D6, memory e2e-nav-label-substring-collision):
// Playwright's getByRole name match is substring-based, so overlapping labels
// would break unrelated specs. "For travelers"/"For agents"/"Traveler sign in"/
// "Agent sign in" share no substring with the home body's "Agency workspace".
import Link from "next/link";

/** Which of the three pages is active, so its nav link is marked current. */
export type MarketingNavPage = "home" | "travelers" | "agents";

export function MarketingNav({ active }: { active: MarketingNavPage }) {
  return (
    <header className="home-nav">
      {/* Brand is a link home (not a heading) so it renders consistently on
          every page; the home page supplies the role=heading "TripForge" that
          the smoke pins (INV-027 smoke.spec.ts). */}
      <Link href="/" className="tf-brand" aria-label="TripForge home">
        TripForge
      </Link>
      <nav aria-label="Primary">
        <Link
          href="/for-travelers"
          className="lp-navlink"
          aria-current={active === "travelers" ? "page" : undefined}
        >
          For travelers
        </Link>
        <Link
          href="/for-agents"
          className="lp-navlink"
          aria-current={active === "agents" ? "page" : undefined}
        >
          For agents
        </Link>
        <Link href="/view/sign-in" className="tf-btn tf-btn--ghost">
          Traveler sign in
        </Link>
        <Link href="/sign-in" className="tf-btn tf-btn--ghost">
          Agent sign in
        </Link>
      </nav>
    </header>
  );
}
