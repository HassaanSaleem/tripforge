// /view/discover — the traveler's "What's Hot" discovery feed (spec 039, ticket
// goal-consumer-whats-hot / GOAL.md D2.2, PRD §9.7). Replaced the prior honest
// "coming soon" placeholder with the real curated feed, now that the consumer
// surface is operator-pulled-forward (GOAL.md, roadmap P2). Static
// Next.js segment, resolved ahead of the sibling dynamic /view/[token] route (same
// precedent as /view/plan and /view/my-trips), so an anonymous redirect never falls
// through to the dead-token message. Signed-in only (INV-023): an anonymous request
// is redirected to sign-in. Brand-neutral (INV-020/INV-024): the traveler surface
// carries no agency branding and no "TripForge"/"Trellis" wordmark, and it mounts
// the SHARED, user-type-agnostic feed component (app/components/discover-feed-view)
// — never a workspace-grouped component (INV-024). Each card's "Plan this" hands off
// to the CONSUMER planner (/view/plan) via planPath, seeding the destination.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionContext } from "../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "../components/client-surface-shell.js";
import { DiscoverFeedView } from "../../../components/discover-feed-view.js";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover what's hot",
  description: "Trending places and experiences — pick a destination and start planning it.",
  robots: { index: false, follow: false },
};

export default async function ClientDiscoverPage() {
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    // Signed-in only — same gate as /view/plan. The client-auth return-to supports
    // a share token only, so we land the traveler back on /view after auth; Discover
    // is one nav click away.
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  const identity = await caller.clientView.me();
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="discover" travelerName={name}>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Discover</p>
        <h1>What&apos;s hot</h1>
        <p>
          Pick a destination for trending places and experiences — tap any card to start
          planning a live-priced, bookable trip.
        </p>
      </header>
      <DiscoverFeedView planPath="/view/plan" />
    </ClientSurfaceShell>
  );
}
