// /view/plan — the consumer chat-first, budget-aware AI planner (spec 038,
// ticket goal-consumer-planner / GOAL.md D2.3). Static Next.js segment, resolved
// ahead of the sibling dynamic /view/[token] route (same precedent as
// /view/my-trips). Brand-neutral (INV-020/INV-024): the traveler surface never
// carries a single agency's branding and never mounts a workspace procedure —
// the planner rides new clientView protectedProcedures that REUSE the agent
// engine. Signed-in only (INV-023): an anonymous request is redirected to
// sign-in and no planner surface is rendered.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "../../../../lib/auth.js";
import { getAuthenticatedCaller } from "../../../../lib/trpc/server.js";
import { ClientSurfaceShell } from "../components/client-surface-shell.js";
import { ConsumerPlanner } from "./consumer-planner.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan a trip",
  description: "Describe your trip and budget — our AI builds a live-priced, bookable itinerary.",
};

export default async function ConsumerPlannerPage() {
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  if (!session) {
    // Signed-in only. The existing client-auth return-to supports a share token
    // only, so we land the traveler back on /view after auth — the now-live
    // "Plan a trip" tile/nav is one click away.
    redirect("/view/sign-in");
  }

  const caller = await getAuthenticatedCaller(requestHeaders);
  // me() is the existing session-scoped traveler identity — used to greet by
  // name in the shell and to pre-fill the request-an-agent form.
  const identity = await caller.clientView.me();
  const name = identity?.name?.trim() || null;

  return (
    <ClientSurfaceShell activeNav="plan" travelerName={name}>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Plan a trip</p>
        <h1>Plan a trip with our AI</h1>
        <p>
          Tell us where you want to go and your budget — our budget-aware AI drafts a
          live-priced, bookable itinerary, then hands it to an agent or lets you take it from
          there.
        </p>
      </header>

      <ConsumerPlanner
        contactName={name}
        contactEmail={identity?.email?.trim() || null}
      />
    </ClientSurfaceShell>
  );
}
