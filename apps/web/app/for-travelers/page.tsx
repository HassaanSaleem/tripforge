// /for-travelers — the consumer story (spec 032, GOAL.md Deliverable 1/2).
// Public marketing route under the root layout (product theme, NOT the
// white-label (client-view) group). Server component: static markup + links +
// the staged real demo video. Framed per Constitution Principle I — the
// consumer surface funnels demand into the agent network (plan it, or request
// an agent), it is NOT a standalone-planner pitch.
import Link from "next/link";
import { MarketingNav } from "../components/marketing-nav.js";

export const metadata = {
  title: "TripForge for travelers — plan a trip, then book it or hand it to an agent",
  description:
    "Describe your trip and budget and get a live-priced, bookable itinerary. Book it yourself, or hand it to a vetted travel agent.",
};

export default function ForTravelersPage() {
  return (
    <>
      <MarketingNav active="travelers" />

      <main className="home lp">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="tf-eyebrow">For travelers</p>
            <h1>Your trip, planned in a sentence — and actually bookable</h1>
            <p className="home-lede">
              Describe where you want to go and what you want to spend. Our AI
              assembles a day-by-day itinerary priced against real net rates —
              then you book it yourself, or hand it to a vetted travel agent to
              arrange for you.
            </p>
            <div className="home-cta">
              <Link href="/view/sign-in" className="tf-btn tf-btn--cta">
                Sign in to plan a trip →
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
              aria-label="TripForge traveler demo: planning and booking a shared trip"
            >
              <source src="/demos/tripforge-clients.mp4" type="video/mp4" />
              Your browser cannot play this video.{" "}
              <a href="/demos/tripforge-clients.mp4">Download the traveler demo</a>.
            </video>
            <figcaption>
              A shared trip, end to end — plan, review the priced itinerary, and
              choose how to book.
            </figcaption>
          </figure>
        </section>

        <section className="lp-story" aria-label="How it works for travelers">
          <article className="lp-step">
            <span className="lp-step-n">1</span>
            <h2>Describe the trip and the budget</h2>
            <p>
              A destination, some dates, who is going, and a number. The
              budget-aware planner allocates it across flights, stays, transfers,
              and activities and fills it in.
            </p>
          </article>
          <article className="lp-step">
            <span className="lp-step-n">2</span>
            <h2>See it priced for real</h2>
            <p>
              Every item sits on a live net rate — a real, bookable price, not a
              guess. Adjust the plan and the numbers move with it, day by day.
            </p>
          </article>
          <article className="lp-step">
            <span className="lp-step-n">3</span>
            <h2>Book it yourself, or ask an agent</h2>
            <p>
              Confident? Book it through the platform. Want a human on it? Hand
              the same trip to a vetted marketplace agent who arranges and books
              it for you.
            </p>
          </article>
        </section>

        <section className="lp-cta-band">
          <h2>Ready when you are</h2>
          <p>
            Sign in to open a shared trip, plan a new one, and see your trips in
            one place.
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
