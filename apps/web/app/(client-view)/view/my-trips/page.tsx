// /view/my-trips — "My Trips" (spec 031 FR-001/006, contracts §2). Static
// Next.js segment: resolved ahead of the sibling dynamic /view/[token] route,
// so no real share token (always a uuid) can ever collide with this path
// (research D2, same precedent as /view/sign-in and /view/sign-up). Brand-
// neutral (INV-020) — carries no single agency's branding; each listed trip
// carries its OWN owning agency's name, same as opening it directly would.
// Not signed in ⇒ redirect to sign-in (FR-006) — no trip data is ever
// computed or sent to an unauthenticated request.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../lib/trpc/server.js";
import { formatMinorAmount } from "../../../../lib/planner-form.js";
import { ClientSurfaceShell } from "../components/client-surface-shell.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Trips",
  description: "Trips that have been shared with you.",
};

export default async function MyTripsPage() {
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  // me() is the existing session-scoped traveler-identity read (no new
  // procedure) — used only to greet by name in the shell's Account area.
  const [identity, trips] = await Promise.all([
    caller.clientView.me(),
    caller.clientView.myTrips(),
  ]);
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="myTrips" travelerName={name}>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Your account</p>
        <h1>My Trips</h1>
        <p>Trips that have been shared with you.</p>
      </header>

      {trips.length === 0 ? (
        <section className="tf-card">
          <p className="tf-empty-day" data-testid="my-trips-empty">
            No trips yet — once your agent shares a trip link with you and you open it, it will
            show up here.
          </p>
        </section>
      ) : (
        <ul className="tf-items tf-client-items" data-testid="my-trips-list">
          {trips.map((trip) => (
            <li key={trip.token}>
              <span className="d" aria-hidden="true" />
              <Link href={`/view/${trip.token}`} className="tf-client-item" data-testid="my-trips-row">
                <span>
                  <span className="tf-item-kind">{trip.agencyName}</span>: {trip.title}
                </span>
              </Link>
              {trip.totalSellMinor !== null ? (
                <span className="tf-price">{formatMinorAmount(trip.totalSellMinor, trip.currency)}</span>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className="tf-client-foot">
        <small>Open a trip link from your agent to add it here.</small>
      </footer>
    </ClientSurfaceShell>
  );
}
