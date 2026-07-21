// Shared story/visual panel for the agent auth split (spec 034,
// goal-ui-depoliteform). Presentation-only server component rendered beside the
// credentials card on /sign-in and /sign-up so agent auth reads as a premium
// product rather than a bare form. Platform-branded — the AGENT surface only;
// never used on the white-label client (/view) surface (INV-020). Decorative:
// aria-hidden keeps the form the sole actionable/announced content.
//
// Pre-Write: NEW. No existing shared auth-panel exists; the aside is shared by
// exactly two pages (sign-in, sign-up), so extracting it mirrors the
// auth-form.tsx precedent of hoisting shared auth markup rather than
// duplicating it per page.
export function AuthBrandPanel() {
  return (
    <aside className="tf-auth-aside" aria-hidden="true">
      <p className="tf-brand">TripForge</p>
      <div style={{ display: "grid", gap: 18 }}>
        <p className="tf-eyebrow">The agent workspace</p>
        <h2>Build, price, and book client-ready trips — at your markup.</h2>
        <p className="tf-auth-aside-lede">
          Budget-aware AI itineraries, live net-rate booking, and a two-sided marketplace to
          resell and white-label — one workspace.
        </p>
        <ul className="tf-auth-points">
          <li>Draft a priced, bookable itinerary in minutes</li>
          <li>Book net-rate inventory inline with full markup control</li>
          <li>List, license, and white-label finished trips</li>
        </ul>
      </div>
      <figure className="tf-auth-shot">
        {/* First-party product screenshot (Compliance & Content Sourcing) —
            never a third-party or fabricated place photo. */}
        <img src="/shots/agent/03-ai-builder-compare-options.png" alt="" />
      </figure>
    </aside>
  );
}
