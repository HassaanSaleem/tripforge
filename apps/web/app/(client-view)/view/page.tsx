// The traveler home at `/view` (spec 033) — the post-auth landing when a
// traveler signs up/in with no share token (resolve-client-auth-return-to.ts
// returns "/view"). Brand-neutral (INV-020) via `data-plain`; no agent/workspace
// affordance (INV-024). Server component, force-dynamic: the session is read per
// request and must never be cached (same as my-trips/page.tsx).
//
// Anonymous ⇒ a brand-neutral welcome (sign in / create an account) that computes
// NO trip data (FR-005) and keeps the exact heading + INV-020/024 negatives the
// existing anonymous-/view guards pin (smoke.spec.ts, trust-boundary.spec.ts).
// Signed in ⇒ a personalized home that greets by name and links to My Trips,
// signposting the not-yet-built consumer surfaces as coming soon, wrapped in the
// persistent consumer navigation shell (spec 037). It reads ONLY the existing
// session-aware clientView.me / clientView.myTrips — no new server capability, so
// INV-023 (traveler → workspace = FORBIDDEN) is unchanged. The shell (and its nav
// panel) render ONLY on this signed-in branch — the AnonymousWelcome below stays
// brand-neutral and nav-free (INV-020 / INV-018, FR-005).
import { headers } from "next/headers";
import Link from "next/link";
import { getSessionContext } from "../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "./components/client-surface-shell.js";

export const dynamic = "force-dynamic";

export default async function ClientViewHomePage() {
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);

  if (!session) {
    return <AnonymousWelcome />;
  }

  // Signed in: read the caller's OWN identity + trips (both keyed on the
  // server-derived session userId — no cross-visitor read is expressible).
  const caller = await getAuthenticatedCaller(requestHeaders);
  const [identity, trips] = await Promise.all([
    caller.clientView.me(),
    caller.clientView.myTrips(),
  ]);
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="home" travelerName={name}>
      <TravelerHome name={name} tripCount={trips.length} />
    </ClientSurfaceShell>
  );
}

/** Anonymous /view: a brand-neutral welcome. Heading contains "Your trip" so the
 * pinned INV-020/024 anonymous guards stay green; NO clientView call is made. */
function AnonymousWelcome() {
  return (
    <div data-plain className="tf-client-root">
      <main>
        <header className="tf-client-head">
          <p className="tf-eyebrow">Your account</p>
          <h1>Your trips</h1>
          <p>Sign in to see the trips your travel agent has shared with you — or create an account to get started.</p>
        </header>
        <section className="tf-card tf-home-welcome" data-testid="traveler-welcome">
          <div className="tf-home-welcome-actions">
            <Link href="/view/sign-in" className="tf-btn tf-btn--cta" data-testid="welcome-sign-in">
              Sign in
            </Link>
            <Link href="/view/sign-up" className="tf-btn tf-btn--ghost" data-testid="welcome-sign-up">
              Create an account
            </Link>
          </div>
        </section>
        <footer className="tf-client-foot">
          <small>Your travel proposals and itineraries, shared by your travel agent.</small>
        </footer>
      </main>
    </div>
  );
}

/** Signed-in traveler home CONTENT (greeting + My Trips + coming-soon tiles).
 *  Rendered inside <ClientSurfaceShell>, which supplies the data-plain wrapper,
 *  the <main>, and the persistent nav (with sign-out in its Account area) — so this
 *  is just the page body, no outer chrome. */
function TravelerHome({ name, tripCount }: { name: string | null; tripCount: number }) {
  return (
    <>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Your account</p>
        <h1 data-testid="traveler-home-greeting">{name ? `Welcome, ${name}` : "Welcome back"}</h1>
        <p>Pick up a trip your agent shared with you, or explore what&apos;s coming next.</p>
      </header>

      <section className="tf-quick-actions" aria-label="Your account" data-testid="traveler-home-actions">
        <Link href="/view/my-trips" className="tf-card tf-quick-action" data-testid="home-my-trips">
          <b>My Trips</b>
          <span>
            {tripCount > 0
              ? `${tripCount} ${tripCount === 1 ? "trip" : "trips"} shared with you`
              : "Trips your agent shares with you show up here"}
          </span>
        </Link>

        <Link href="/view/plan" className="tf-card tf-quick-action" data-testid="home-plan">
          <b>Plan a trip</b>
          <span>Describe your trip and budget — our AI builds a live-priced, bookable itinerary.</span>
        </Link>

        <div className="tf-card tf-quick-action tf-home-soon" data-testid="home-discover" aria-disabled="true">
          <p className="tf-eyebrow">Coming soon</p>
          <b>Discover what&apos;s hot</b>
          <span>A feed of trending, bookable trips — arriving soon.</span>
        </div>
      </section>
    </>
  );
}
