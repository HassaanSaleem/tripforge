// The self-drive vs. request-an-agent fork (spec 022, contracts/request-
// agent-fork.md §1). Client component: possession of the share token is the
// only grant needed (INV-018, matches clientView.itinerary's trust model) —
// no session, no workspace affordance. "Book it myself" is a confirmation-
// only stub (research D1): no server call, no persisted state. Renders
// inside the (client-view) route group only — inherits the brand-neutral
// layout.tsx (INV-020) and imports nothing agent-facing.
//
// Sign-in is OPTIONAL (spec 030 FR-004/FR-009): `identity`, when present,
// only sets defaultValue on the existing uncontrolled contactName/
// contactEmail inputs — still fully editable, still submitted via the same
// FormData-based handler below (research D6). No `identity` ⇒ byte-identical
// to the pre-spec-030 form.
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TravelerIdentity } from "@tripforge/api";
import { trpc } from "../../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../../lib/transport-error.js";
import { signOut } from "../../../../lib/auth-client.js";

type ForkChoice = "self_drive" | "handoff";

type HandoffState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "submitted" }
  | { phase: "refused"; message: string };

export function TripFork({ token, identity }: { token: string; identity: TravelerIdentity | null }) {
  const router = useRouter();
  const [choice, setChoice] = useState<ForkChoice | null>(null);
  const [handoff, setHandoff] = useState<HandoffState>({ phase: "idle" });

  async function handleSignOut() {
    await signOut();
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (handoff.phase === "submitting") return;
    const form = new FormData(event.currentTarget);
    const contactName = String(form.get("contactName") ?? "").trim();
    if (contactName === "") {
      setHandoff({ phase: "refused", message: "Enter your name so the agent can reach you." });
      return;
    }
    const contactEmail = String(form.get("contactEmail") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    setHandoff({ phase: "submitting" });
    try {
      const outcome = await trpc.clientView.requestHandoff.mutate({
        token,
        contactName,
        ...(contactEmail === "" ? {} : { contactEmail }),
        ...(notes === "" ? {} : { notes }),
      });
      if (outcome.status === "submitted") {
        setHandoff({ phase: "submitted" });
      } else {
        setHandoff({ phase: "refused", message: "This trip link isn't available anymore." });
      }
    } catch (error) {
      setHandoff({
        phase: "refused",
        message: transportErrorMessage(error, {
          forbidden: "This trip link can't take requests right now.",
          badRequest: "Enter your name so the agent can reach you.",
        }),
      });
    }
  }

  if (choice === null) {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork">
        <p className="tf-client-account-strip" data-testid="trip-fork-account-strip">
          {identity ? (
            <>
              Signed in as {identity.name} ·{" "}
              <button type="button" className="tf-link-btn" onClick={handleSignOut} data-testid="account-sign-out">
                Sign out
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <a href={`/view/sign-in?token=${token}`} data-testid="account-sign-in-link">
                Sign in
              </a>{" "}
              to fill in your details automatically.
            </>
          )}
        </p>
        <p className="tf-eyebrow">What next?</p>
        <h2>Ready to move forward?</h2>
        <div className="tf-client-fork-choices">
          <button
            type="button"
            className="tf-btn"
            onClick={() => setChoice("self_drive")}
            data-testid="fork-self-drive"
          >
            Book it myself
          </button>
          <button
            type="button"
            className="tf-btn tf-btn--cta"
            onClick={() => setChoice("handoff")}
            data-testid="fork-handoff"
          >
            Have an agent arrange this for me
          </button>
        </div>
      </section>
    );
  }

  if (choice === "self_drive") {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive">
        <p className="tf-eyebrow">You&apos;re set</p>
        <h2>Great — you&apos;re booking this trip yourself</h2>
        <p>Reach out to your travel agent when you&apos;re ready to confirm and pay for each part of the trip.</p>
      </section>
    );
  }

  if (handoff.phase === "submitted") {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork-handoff-submitted">
        <p className="tf-eyebrow">Request sent</p>
        <h2>Your agent has been notified</h2>
        <p>They&apos;ll be in touch to take it from here.</p>
      </section>
    );
  }

  return (
    <section className="tf-card tf-client-fork" data-testid="trip-fork-handoff-form">
      <p className="tf-eyebrow">Have an agent arrange this for me</p>
      <h2>Tell your agent how to reach you</h2>
      <form onSubmit={handleSubmit} data-testid="trip-fork-handoff-inputs">
        <label>
          Your name
          <input
            type="text"
            name="contactName"
            required
            maxLength={200}
            defaultValue={identity?.name ?? ""}
            disabled={handoff.phase === "submitting"}
          />
        </label>
        <label>
          Email (optional)
          <input
            type="email"
            name="contactEmail"
            maxLength={320}
            defaultValue={identity?.email ?? ""}
            disabled={handoff.phase === "submitting"}
          />
        </label>
        <label>
          Notes (optional)
          <textarea name="notes" maxLength={2000} disabled={handoff.phase === "submitting"} />
        </label>
        {handoff.phase === "refused" ? <p role="alert">{handoff.message}</p> : null}
        <button type="submit" className="tf-btn tf-btn--cta" disabled={handoff.phase === "submitting"}>
          {handoff.phase === "submitting" ? "Sending…" : "Send request"}
        </button>
      </form>
    </section>
  );
}
