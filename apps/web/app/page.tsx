// Root landing — the public sell surface, reworked into a true two-sided
// overview (spec 032, GOAL.md Deliverable 1). One product, two sides: it forks
// clearly to the traveler story (/for-travelers) and the agent story
// (/for-agents). Styling lives in globals.css (.home-*/.lp-*). The two real
// experiences live in the (workspace) and (client-view) route groups (INV-024).
//
// Smoke contract (INV-027 smoke.spec.ts): this page MUST keep a role=heading
// named "TripForge" (the hero <h1>) AND a link matching /Agency workspace/i
// (the agent panel's "Agency workspace" link) — both preserved below.
import Link from "next/link";
import { MarketingNav } from "./components/marketing-nav.js";
import { PitchVideo } from "./components/pitch-video.js";

export default function HomePage() {
  return (
    <>
      <MarketingNav active="home" />

      <main className="home">
        <section className="home-hero">
          <div>
            <p className="tf-eyebrow">One platform · two sides · AI-native</p>
            <h1>TripForge</h1>
            <p className="home-hero-tagline">
              <em>Build, book, and trade trips</em> — for travel agents and the
              travelers they serve.
            </p>
            <p className="home-lede">
              One shared engine turns a budget and a few words into a day-by-day
              itinerary priced against real net rates. Agents book it, mark it
              up, and trade it on a two-sided marketplace — travelers plan, join,
              and book the very same trips.
            </p>
            <div className="home-cta">
              <Link href="/for-travelers" className="tf-btn tf-btn--cta">
                Plan as a traveler →
              </Link>
              <Link href="/for-agents" className="tf-btn tf-btn--ghost">
                Sell as an agent →
              </Link>
            </div>
            <div className="home-trust">
              <span>
                <b>GBV</b> booked through the platform
              </span>
              <i />
              <span>
                Net-rate <b>quote-then-book</b>
              </span>
              <i />
              <span>
                White-label <b>resale</b>
              </span>
            </div>
          </div>

          <aside className="home-card" aria-hidden="true">
            <div className="cap">
              <span>Lisbon · 3 days</span>
              <span>€2,500 budget</span>
            </div>
            <div className="rows">
              <div className="row">
                <i className="d" />
                <div>
                  <b>Day 1 · Alfama &amp; the river</b>
                  <small>Hotel do Chiado · walking tour · fado</small>
                </div>
                <span className="tf-price">€610</span>
              </div>
              <div className="row">
                <i className="d" />
                <div>
                  <b>Day 2 · Sintra day trip</b>
                  <small>Transfer · Pena Palace · Regaleira</small>
                </div>
                <span className="tf-price">€430</span>
              </div>
              <div className="row">
                <i className="d" />
                <div>
                  <b>Day 3 · Belém &amp; departure</b>
                  <small>Pastéis · MAAT · airport transfer</small>
                </div>
                <span className="tf-price">€295</span>
              </div>
            </div>
          </aside>
        </section>

        <section className="home-demo" aria-label="What TripForge is — a two-minute overview">
          <div className="home-demo-copy">
            <p className="tf-eyebrow">Watch · 2 min</p>
            <h2>See what TripForge is, in two minutes</h2>
            <p>
              One engine — build with AI, book at your markup, trade on the
              marketplace, and let travelers plan, join, and book the very same trips.
            </p>
          </div>
          <PitchVideo variant="home" />
        </section>

        {/* The two-sided fork — a deliberate split into each audience's story. */}
        <section className="home-split" aria-label="Choose your side">
          <article className="home-side">
            <p className="tf-eyebrow">For travelers</p>
            <h2>Plan your trip — self-drive or hand it to an agent</h2>
            <p>
              Describe the trip and your budget and get a live-priced, bookable
              itinerary. Book it yourself, or have a vetted agent take it from
              here.
            </p>
            <Link href="/for-travelers" className="tf-btn tf-btn--cta">
              Explore the traveler story →
            </Link>
          </article>

          <article className="home-side">
            <p className="tf-eyebrow">For travel agents</p>
            <h2>Build, book, and resell client-ready trips</h2>
            <p>
              A budget-aware AI builder, inline net-rate booking with markup
              control, and a two-sided marketplace to resell and white-label
              finished itineraries.
            </p>
            <div className="home-side-actions">
              <Link href="/for-agents" className="tf-btn tf-btn--cta">
                Explore the agent story →
              </Link>
              <Link href="/workspace" className="tf-btn tf-btn--ghost">
                Agency workspace →
              </Link>
            </div>
          </article>
        </section>

        <section className="home-value">
          <article>
            <div className="ic" style={{ background: "linear-gradient(135deg,var(--sea),#12897d)" }}>
              ◐
            </div>
            <h3>Plan with AI, priced for real</h3>
            <p>
              Describe the trip and budget. The allocator splits it across hotel,
              transfers, and activities — every item on a live net rate, no
              fantasy pricing.
            </p>
          </article>
          <article>
            <div className="ic" style={{ background: "linear-gradient(135deg,var(--coral),#e59a5a)" }}>
              ◎
            </div>
            <h3>Quote-then-book, inline</h3>
            <p>
              Hold firm supplier prices, apply your markup, confirm — one atomic
              transaction. If any leg fails, nothing is charged. Money conserved
              to the cent.
            </p>
          </article>
          <article>
            <div className="ic" style={{ background: "linear-gradient(135deg,#7b4a86,#c95c72)" }}>
              ◈
            </div>
            <h3>Trade on the marketplace</h3>
            <p>
              List a finished itinerary, license it white-labeled to another
              vetted agency, and share revenue automatically — a network that
              compounds.
            </p>
          </article>
        </section>

        <footer className="home-foot">
          New to TripForge? <Link href="/sign-up">create an agency account</Link>
          {"  ·  "}
          Traveling? <Link href="/view/sign-in">sign in to view your trips</Link>
        </footer>
      </main>
    </>
  );
}
