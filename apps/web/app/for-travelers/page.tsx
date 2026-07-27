// /for-travelers — the consumer story (spec 032, GOAL.md Deliverable 1/2).
// Public marketing route under the root layout (product theme, NOT the
// white-label (client-view) group). Server component: static markup + links +
// the staged real demo video. Framed per Constitution Principle I — the
// consumer surface funnels demand into the agent network (plan it, or request
// an agent), it is NOT a standalone-planner pitch.
import Link from "next/link";
import { MarketingNav } from "../components/marketing-nav.js";

export const metadata = {
  title: "TripForge for travelers — see your trip, book it yourself or hand it to an agent",
  description:
    "Sign in to see the itinerary your travel agent built for you, priced against real net rates. Book it yourself, or hand it to a vetted agent to arrange.",
};

export default function ForTravelersPage() {
  return (
    <>
      <MarketingNav active="travelers" />

      <main className="home lp">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="tf-eyebrow">For travelers</p>
            <h1>Your trip, priced for real — and yours to run</h1>
            <p className="home-lede">
              Sign in to see the day-by-day itinerary your travel agent built for
              you, priced against real net rates. When you&apos;re ready, book it
              yourself — or hand it back to a vetted agent to arrange and book for
              you. Planning your own trip with AI is coming to your traveler
              account.
            </p>
            <div className="home-cta">
              <Link href="/view/sign-in" className="tf-btn tf-btn--cta">
                Sign in to see your trips →
              </Link>
              <Link href="/for-agents" className="tf-btn tf-btn--ghost">
                Are you a travel agent?
              </Link>
            </div>
          </div>

          <figure className="lp-video">
            {/* Staged real demo (Compliance &amp; Content Sourcing). No autoplay,
                metadata-only preload + poster so the file downloads on play. */}
            <video
              className="lp-video-el"
              controls
              preload="metadata"
              poster="/shots/clients/01-shared-trip.png"
              aria-label="TripForge traveler demo: reviewing and booking a shared trip"
            >
              <source src="/demos/tripforge-clients.mp4" type="video/mp4" />
              Your browser cannot play this video.{" "}
              <a href="/demos/tripforge-clients.mp4">Download the traveler demo</a>.
            </video>
            <figcaption>
              A shared trip, end to end — review the priced itinerary and choose
              how to book.
            </figcaption>
          </figure>
        </section>

        <section className="lp-story" aria-label="How it works for travelers">
          <article className="lp-step">
            <span className="lp-step-n">1</span>
            <h2>Get a plan built around your budget</h2>
            <p>
              Tell a vetted TripForge agent where you want to go and what you want
              to spend. They build a budget-aware, day-by-day itinerary across
              flights, stays, transfers, and activities — and share it with you.
            </p>
          </article>
          <article className="lp-step">
            <span className="lp-step-n">2</span>
            <h2>See it priced for real</h2>
            <p>
              Every item sits on a live net rate — a real, bookable price, not a
              guess. You see the whole trip totalled, day by day.
            </p>
          </article>
          <article className="lp-step">
            <span className="lp-step-n">3</span>
            <h2>Book it yourself, or ask an agent</h2>
            <p>
              Confident? Take the plan and book each part yourself. Want a human
              on it? Hand the same trip back to a vetted agent who arranges and
              books it for you.
            </p>
          </article>
        </section>

        <section className="lp-cta-band">
          <h2>Ready when you are</h2>
          <p>
            Sign in to open a shared trip and keep all your trips in one place.
          </p>
          <Link href="/view/sign-in" className="tf-btn tf-btn--cta">
            Sign in to view your trips →
          </Link>
        </section>

        <footer className="home-foot">
          <Link href="/">← Back to overview</Link>
          {"  ·  "}
          <Link href="/for-agents">For travel agents</Link>
        </footer>
      </main>
    </>
  );
}
