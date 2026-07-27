// Honest affordance for hopeful discovery URLs under /view (FRICTION-7,
// consumer-copy-honesty-interim). A traveler who types /view/marketplace or
// /view/discover used to fall through to the /view/[token] catch-all and see the
// neutral dead-token message ("This trip link isn't available..."). As STATIC
// segments these routes resolve here first (same non-collision reasoning as
// /view/sign-in — research D2), showing an honest "discovery is coming; your
// shared trips are under My Trips" placeholder instead of a dead-token error.
// Brand-neutral (INV-020) via data-plain; no agent/workspace affordance
// (INV-024). Server component: static markup + links.
import Link from "next/link";

export function DiscoveryComing({ heading }: { heading: string }) {
  return (
    <div data-plain className="tf-client-root" data-testid="discovery-coming">
      <main>
        <header className="tf-client-head">
          <p className="tf-eyebrow">Coming soon</p>
          <h1>{heading}</h1>
          <p>
            Browsing and booking trips on your own is coming to your traveler
            account. For now, the trips your travel agent shares with you live
            under My Trips.
          </p>
        </header>
        <section className="tf-card tf-home-welcome">
          <div className="tf-home-welcome-actions">
            <Link href="/view/my-trips" className="tf-btn tf-btn--cta">
              Go to My Trips
            </Link>
            <Link href="/view" className="tf-btn tf-btn--ghost">
              Back to your account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
