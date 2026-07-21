// /for-agents — the professional story (spec 032, GOAL.md Deliverable 1).
// Public marketing route under the root layout (product theme). Server
// component: static markup + links + the staged real demo video. The agent
// surface is the wedge (Constitution Principle II) that feeds the marketplace
// moat (Principle I).
import Link from "next/link";
import { MarketingNav } from "../components/marketing-nav.js";

export const metadata = {
  title: "TripForge for travel agents — build, book, and resell client-ready trips",
  description:
    "A budget-aware AI itinerary builder, inline net-rate booking with markup control, and a two-sided marketplace to resell and white-label finished trips.",
};

export default function ForAgentsPage() {
  return (
    <>
      <MarketingNav active="agents" />

      <main className="home lp">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="tf-eyebrow">For travel agents</p>
            <h1>Build client-ready trips in minutes — then trade them</h1>
            <p className="home-lede">
              A budget-aware AI builder priced against live net rates, inline
              quote-then-book with your own markup, and a two-sided marketplace
              where you resell and white-label finished itineraries — and earn a
              share on every trade.
            </p>
            <div className="home-cta">
              <Link href="/sign-up" className="tf-btn tf-btn--cta">
                Create an agency account →
              </Link>
              <Link href="/workspace" className="tf-btn tf-btn--ghost">
                Agency workspace →
              </Link>
            </div>
          </div>

          <figure className="lp-video">
            {/* Staged real demo. No autoplay; metadata-only preload + poster. */}
            <video
              className="lp-video-el"
              controls
              preload="metadata"
              poster="/shots/agent/01-dashboard.png"
              aria-label="TripForge agent demo: building, booking, and reselling a trip"
            >
              <source src="/demos/tripforge-agents.mp4" type="video/mp4" />
              Your browser cannot play this video.{" "}
              <a href="/demos/tripforge-agents.mp4">Download the agent demo</a>.
            </video>
            <figcaption>
              The agent workspace, end to end — build with AI, book at net rates,
              and list on the marketplace.
            </figcaption>
          </figure>
        </section>

        <section className="lp-story" aria-label="What agents get">
          <article className="lp-step">
            <span className="lp-step-n">1</span>
            <h2>Build with budget-aware AI</h2>
            <p>
              Give it a destination, dates, party, style, and a budget. The
              allocator splits the budget across categories and assembles a
              day-by-day plan on live, bookable prices — you stay the author of
              record and edit anything.
            </p>
          </article>
          <article className="lp-step">
            <span className="lp-step-n">2</span>
            <h2>Book at net rates, with your markup</h2>
            <p>
              Hold firm supplier prices, apply your markup, and confirm in one
              atomic transaction. Partial failures conserve money to the cent —
              if a leg fails, nothing is charged.
            </p>
          </article>
          <article className="lp-step">
            <span className="lp-step-n">3</span>
            <h2>Resell and white-label on the marketplace</h2>
            <p>
              List a finished itinerary, license it white-labeled to another
              vetted agency, add clients to a joinable departure, and share
              revenue automatically — provenance and revenue-share enforced by
              the platform.
            </p>
          </article>
        </section>

        <section className="lp-cta-band">
          <h2>Land with the tool. Grow with the network.</h2>
          <p>
            Start free, build your first client-ready trip today, and list it
            into a marketplace that compounds.
          </p>
          <Link href="/sign-up" className="tf-btn tf-btn--cta">
            Create an agency account →
          </Link>
        </section>

        <footer className="home-foot">
          <Link href="/">← Back to overview</Link>
          {"  ·  "}
          <Link href="/for-travelers">For travelers</Link>
        </footer>
      </main>
    </>
  );
}
