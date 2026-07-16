// Root landing — the public sell surface. Built to the approved premium
// direction; styling lives in globals.css (.home-*). The two real experiences
// live in the (workspace) and (client-view) route groups (INV-024).
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <header className="home-nav">
        {/* Brand as an accessible heading — smoke.spec.ts pins role=heading "TripForge" */}
        <h1 className="tf-brand">TripForge</h1>
        <nav>
          <Link href="/view/sign-in" className="tf-btn tf-btn--ghost">Travelers</Link>
          <Link href="/sign-in" className="tf-btn tf-btn--ghost">Agent sign in</Link>
          <Link href="/sign-up" className="tf-btn tf-btn--cta">Start free</Link>
        </nav>
      </header>

      <main className="home">
        <section className="home-hero">
          <div>
            <p className="tf-eyebrow">For travel agents · AI-native</p>
            <h1>
              Plan a trip in a sentence.
              <br />
              <em>Book it</em> in a click.
            </h1>
            <p className="home-lede">
              TripForge turns a budget and a few words into a day-by-day itinerary priced
              against real net rates — then your agency books it, marks it up, and trades it
              on a two-sided marketplace.
            </p>
            <div className="home-cta">
              <Link href="/sign-up" className="tf-btn tf-btn--cta">Start planning free</Link>
              <Link href="/workspace" className="tf-btn tf-btn--ghost">Agency workspace →</Link>
            </div>
            <div className="home-trust">
              <span><b>GBV</b> booked through the platform</span><i />
              <span>Net-rate <b>quote-then-book</b></span><i />
              <span>White-label <b>resale</b></span>
            </div>
          </div>

          <aside className="home-card" aria-hidden="true">
            <div className="cap">
              <span>Lisbon · 3 days</span>
              <span>€2,500 budget</span>
            </div>
            <div className="rows">
              <div className="row"><i className="d" /><div><b>Day 1 · Alfama &amp; the river</b><small>Hotel do Chiado · walking tour · fado</small></div><span className="tf-price">€610</span></div>
              <div className="row"><i className="d" /><div><b>Day 2 · Sintra day trip</b><small>Transfer · Pena Palace · Regaleira</small></div><span className="tf-price">€430</span></div>
              <div className="row"><i className="d" /><div><b>Day 3 · Belém &amp; departure</b><small>Pastéis · MAAT · airport transfer</small></div><span className="tf-price">€295</span></div>
            </div>
          </aside>
        </section>

        <section className="home-value">
          <article>
            <div className="ic" style={{ background: "linear-gradient(135deg,var(--sea),#12897d)" }}>◐</div>
            <h3>Plan with AI, priced for real</h3>
            <p>Describe the trip and budget. The allocator splits it across hotel, transfers, and activities — every item on a live net rate, no fantasy pricing.</p>
          </article>
          <article>
            <div className="ic" style={{ background: "linear-gradient(135deg,var(--coral),#e59a5a)" }}>◎</div>
            <h3>Quote-then-book, inline</h3>
            <p>Hold firm supplier prices, apply your markup, confirm — one atomic transaction. If any leg fails, nothing is charged. Money conserved to the cent.</p>
          </article>
          <article>
            <div className="ic" style={{ background: "linear-gradient(135deg,#7b4a86,#c95c72)" }}>◈</div>
            <h3>Trade on the marketplace</h3>
            <p>List a finished itinerary, license it white-labeled to another vetted agency, and share revenue automatically — a network that compounds.</p>
          </article>
        </section>

        <footer className="home-foot">
          New to TripForge? <Link href="/sign-up">create an account and agency</Link>
          {"  ·  "}
          Traveling? <Link href="/view/sign-in">Sign in to view your trips</Link>
        </footer>
      </main>
    </>
  );
}
