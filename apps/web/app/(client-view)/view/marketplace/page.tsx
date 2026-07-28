// /view/marketplace — the traveler marketplace (spec 041; GOAL.md D2.7). A
// signed-in traveler browses agent-listed trips and forks one to plan & book it
// (or request an agent). Static Next.js segment, resolved ahead of the sibling
// dynamic /view/[token] route (research D2, same precedent as /view/my-trips),
// so a real share token can never collide with this path. Signed-in only
// (INV-023) — an anonymous request redirects to sign-in, the SAME gate as
// /view/discover and /view/my-trips. Brand-neutral (INV-020/INV-024) — carries
// no platform wordmark; each card carries its OWN selling agency's name and
// client-safe figures only. noindex: a traveler surface, not a public catalogue.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionContext } from "../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "../components/client-surface-shell.js";
import { MarketplaceBrowse } from "./marketplace-browse.js";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Trips published by travel agencies — plan and book one yourself, or ask an agent.",
  robots: { index: false, follow: false },
};

export default async function ClientMarketplacePage() {
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    // Signed-in only — same gate as /view/discover and /view/my-trips.
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  const [cards, identity] = await Promise.all([
    caller.clientView.marketplace.browse(),
    caller.clientView.me(),
  ]);
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="marketplace" travelerName={name}>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Discover</p>
        <h1>Marketplace</h1>
        <p>
          Trips published by travel agencies. Fork one to plan and book it yourself, or ask an
          agent to arrange it for you.
        </p>
      </header>

      <MarketplaceBrowse cards={cards} />

      <footer className="tf-client-foot">
        <small>Every trip is created and sold by the agency shown on its card.</small>
      </footer>
    </ClientSurfaceShell>
  );
}
